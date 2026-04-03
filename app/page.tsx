"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ModeToggle } from "@/components/mode-toggle";
import { SiteCard } from "@/components/site-card";
import { getGroupOptions, getOpenIncident } from "@/lib/site-utils";
import { Site } from "@/lib/types";

interface Feedback {
  type: "error" | "success";
  text: string;
}

async function readJsonResponse<T>(
  res: Response,
  fallbackMessage: string
): Promise<T> {
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const error =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : fallbackMessage;

    throw new Error(error);
  }

  return data as T;
}

function formatDate(iso: string | null) {
  if (!iso) return "Henüz kontrol edilmedi";
  return new Date(iso).toLocaleString("tr-TR");
}

function timeSince(iso: string | null) {
  if (!iso) return "Henüz kontrol edilmedi";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "az önce";
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} saat önce`;
  return `${Math.floor(hours / 24)} gün önce`;
}

function responseColor(ms: number | null) {
  if (ms === null) return "text-gray-500 dark:text-gray-400";
  if (ms < 500) return "text-accent-green";
  if (ms < 1500) return "text-accent-yellow";
  return "text-accent-red";
}

export default function Dashboard() {
  const [sites, setSites] = useState<Site[]>([]);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [group, setGroup] = useState("Genel");
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");

  const fetchSites = useCallback(async () => {
    try {
      const res = await fetch("/api/sites", { cache: "no-store" });
      const data = await readJsonResponse<Site[]>(
        res,
        "Site listesi yüklenemedi."
      );
      setSites(data);
      setFeedback((current) => (current?.type === "error" ? null : current));
    } catch (error) {
      setFeedback({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Site listesi yüklenemedi.",
      });
    }
  }, []);

  useEffect(() => {
    void fetchSites();
    const interval = setInterval(() => {
      void fetchSites();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchSites]);

  useEffect(() => {
    if (feedback?.type !== "success") return;

    const timeout = window.setTimeout(() => {
      setFeedback((current) => (current?.type === "success" ? null : current));
    }, 4000);

    return () => window.clearTimeout(timeout);
  }, [feedback]);

  async function addSite(event: React.FormEvent) {
    event.preventDefault();
    if (!url || !name) return;

    try {
      setLoading(true);
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, name, group, tags, note }),
      });
      const site = await readJsonResponse<Site>(res, "Site eklenemedi.");
      setUrl("");
      setName("");
      setGroup("Genel");
      setTags("");
      setNote("");
      setShowForm(false);
      setFeedback({
        type: "success",
        text: `${site.name} izleme listesine eklendi.`,
      });
      await fetchSites();
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Site eklenemedi.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function updateSite(id: string, payload: Record<string, unknown>) {
    try {
      const res = await fetch("/api/sites", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...payload }),
      });
      await readJsonResponse<Site>(res, "Site ayarları kaydedilemedi.");
      setFeedback({
        type: "success",
        text: "Site ayarları güncellendi.",
      });
      await fetchSites();
    } catch (error) {
      setFeedback({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Site ayarları kaydedilemedi.",
      });
      throw error;
    }
  }

  async function deleteSite(id: string) {
    try {
      const res = await fetch(`/api/sites?id=${id}`, { method: "DELETE" });
      await readJsonResponse<{ success: true }>(res, "Site silinemedi.");
      setFeedback({
        type: "success",
        text: "Site izleme listesinden silindi.",
      });
      await fetchSites();
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Site silinemedi.",
      });
    }
  }

  async function runCheck() {
    try {
      setChecking(true);
      const res = await fetch("/api/check", { method: "POST" });
      const data = await readJsonResponse<{ checked: number; skipped: number }>(
        res,
        "Kontrol başlatılamadı."
      );
      await fetchSites();
      setFeedback({
        type: "success",
        text: `${data.checked} site kontrol edildi${data.skipped > 0 ? ` · ${data.skipped} site interval nedeniyle atlandı` : ""}.`,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Kontrol başlatılamadı.",
      });
    } finally {
      setChecking(false);
    }
  }

  async function sendWeeklyReport() {
    try {
      setReporting(true);
      const res = await fetch("/api/report/weekly", { method: "POST" });
      const data = await readJsonResponse<{ sent: boolean; channels: string[] }>(
        res,
        "Haftalık rapor gönderilemedi."
      );
      setFeedback({
        type: data.sent ? "success" : "error",
        text: data.sent
          ? `Haftalık rapor gönderildi (${data.channels.join(", ")}).`
          : "Haftalık rapor gönderilemedi. Bildirim env ayarlarını kontrol edin.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Haftalık rapor gönderilemedi.",
      });
    } finally {
      setReporting(false);
    }
  }

  const responseSamples = useMemo(
    () => sites.filter((site) => site.responseTime !== null),
    [sites]
  );
  const avgResponse = useMemo(() => {
    if (responseSamples.length === 0) {
      return null;
    }

    return Math.round(
      responseSamples.reduce(
        (sum, site) => sum + (site.responseTime ?? 0),
        0
      ) / responseSamples.length
    );
  }, [responseSamples]);

  const openIncidents = useMemo(
    () => sites.filter((site) => getOpenIncident(site) !== null).length,
    [sites]
  );

  const groupOptions = useMemo(() => getGroupOptions(sites), [sites]);

  const filteredSites = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr");

    return sites.filter((site) => {
      const matchesQuery =
        query.length === 0 ||
        site.name.toLocaleLowerCase("tr").includes(query) ||
        site.url.toLocaleLowerCase("tr").includes(query) ||
        site.tags.some((tag) => tag.toLocaleLowerCase("tr").includes(query)) ||
        site.group.toLocaleLowerCase("tr").includes(query);

      const matchesStatus =
        statusFilter === "all" ? true : site.status === statusFilter;
      const matchesGroup =
        groupFilter === "all" ? true : site.group === groupFilter;

      return matchesQuery && matchesStatus && matchesGroup;
    });
  }, [groupFilter, search, sites, statusFilter]);

  return (
    <div className="min-h-screen">
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-[-1]">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-accent-purple/5 rounded-full blur-[100px]" />
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-accent-blue/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold gradient-text tracking-tight">
              Website Tracking
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Site durumlarını, performansı ve incident geçmişini tek panelden yönetin.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <ModeToggle />
            <a
              href="/status"
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2.5 rounded-xl bg-white/5 text-gray-200 border border-white/10 hover:bg-white/10 transition-all text-sm font-medium"
            >
              Public Status
            </a>
            <a
              href="/api/export?format=json"
              className="px-4 py-2.5 rounded-xl bg-white/5 text-gray-200 border border-white/10 hover:bg-white/10 transition-all text-sm font-medium"
            >
              JSON Export
            </a>
            <a
              href="/api/export?format=csv"
              className="px-4 py-2.5 rounded-xl bg-white/5 text-gray-200 border border-white/10 hover:bg-white/10 transition-all text-sm font-medium"
            >
              CSV Export
            </a>
            <button
              onClick={sendWeeklyReport}
              disabled={reporting}
              className="px-4 py-2.5 rounded-xl bg-accent-yellow/10 text-accent-yellow border border-accent-yellow/20 hover:bg-accent-yellow/20 transition-all text-sm font-medium disabled:opacity-50"
            >
              {reporting ? "Rapor gönderiliyor" : "Haftalık Rapor"}
            </button>
            <button
              onClick={() => setShowForm((current) => !current)}
              className="px-4 py-2.5 rounded-xl bg-accent-blue/10 text-accent-blue border border-accent-blue/20 hover:bg-accent-blue/20 transition-all text-sm font-medium"
            >
              + Site Ekle
            </button>
            <button
              onClick={runCheck}
              disabled={checking}
              className="px-4 py-2.5 rounded-xl bg-accent-purple/10 text-accent-purple border border-accent-purple/20 hover:bg-accent-purple/20 transition-all text-sm font-medium disabled:opacity-50"
            >
              {checking ? "Kontrol ediliyor" : "Tümünü Kontrol Et"}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-2 xl:grid-cols-5 gap-4 mb-8">
          <div className="glass-card rounded-2xl p-5">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Toplam Site
            </div>
            <div className="text-3xl font-bold">{sites.length}</div>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Çevrimiçi
            </div>
            <div className="text-3xl font-bold text-accent-green">
              {sites.filter((site) => site.status === "up").length}
            </div>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Çevrimdışı
            </div>
            <div className="text-3xl font-bold text-accent-red">
              {sites.filter((site) => site.status === "down").length}
            </div>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Açık Incident
            </div>
            <div className="text-3xl font-bold text-accent-yellow">
              {openIncidents}
            </div>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Ort. Yanıt
            </div>
            <div className={`text-3xl font-bold ${responseColor(avgResponse)}`}>
              {avgResponse ? `${avgResponse}ms` : "-"}
            </div>
          </div>
        </div>

        {feedback && (
          <div
            className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${
              feedback.type === "error"
                ? "border-accent-red/20 bg-accent-red/10 text-accent-red"
                : "border-accent-green/20 bg-accent-green/10 text-accent-green"
            }`}
          >
            {feedback.text}
          </div>
        )}

        <div className="glass-card rounded-2xl p-4 mb-6 grid lg:grid-cols-4 gap-3">
          <input
            type="text"
            placeholder="Site, grup veya etiket ara"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] border border-glass-border text-sm focus:outline-none"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] border border-glass-border text-sm focus:outline-none"
          >
            <option value="all">Tüm durumlar</option>
            <option value="up">Çevrimiçi</option>
            <option value="down">Çevrimdışı</option>
            <option value="unknown">Bekliyor</option>
          </select>
          <select
            value={groupFilter}
            onChange={(event) => setGroupFilter(event.target.value)}
            className="px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] border border-glass-border text-sm focus:outline-none"
          >
            <option value="all">Tüm gruplar</option>
            {groupOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <div className="px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] border border-glass-border text-sm text-gray-400">
            {filteredSites.length} site listeleniyor
          </div>
        </div>

        {showForm && (
          <div className="glass-card rounded-2xl p-6 mb-8 border border-accent-blue/20">
            <h2 className="text-lg font-semibold mb-4">Yeni Site Ekle</h2>
            <form onSubmit={addSite} className="grid lg:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Site adı"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] border border-glass-border text-sm focus:outline-none"
              />
              <input
                type="text"
                placeholder="https://example.com"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                className="px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] border border-glass-border text-sm focus:outline-none"
              />
              <input
                type="text"
                placeholder="Grup"
                value={group}
                onChange={(event) => setGroup(event.target.value)}
                className="px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] border border-glass-border text-sm focus:outline-none"
              />
              <input
                type="text"
                placeholder="Etiketler (virgülle)"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                className="px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] border border-glass-border text-sm focus:outline-none"
              />
              <textarea
                placeholder="Not"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                className="lg:col-span-2 px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] border border-glass-border text-sm focus:outline-none"
              />
              <div className="lg:col-span-2 flex gap-3">
                <button
                  type="submit"
                  disabled={loading || !url || !name}
                  className="px-6 py-3 rounded-xl bg-accent-blue text-white font-medium text-sm hover:bg-accent-blue/80 disabled:opacity-30 transition-all whitespace-nowrap"
                >
                  {loading ? "Ekleniyor..." : "Ekle"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-6 py-3 rounded-xl border border-white/10 bg-white/5 text-sm"
                >
                  Vazgeç
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="space-y-4">
          {filteredSites.length === 0 ? (
            <div className="glass-card rounded-2xl p-16 text-center">
              <div className="text-5xl mb-4 opacity-20">📡</div>
              <p className="text-gray-400 text-lg">Filtreye uygun site bulunamadı</p>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                Filtreleri temizleyin veya yeni bir site ekleyin.
              </p>
            </div>
          ) : (
            filteredSites.map((site) => (
              <SiteCard
                key={site.id}
                site={site}
                onDelete={deleteSite}
                onSave={updateSite}
                formatDate={formatDate}
                timeSince={timeSince}
              />
            ))
          )}
        </div>

        {sites.length > 0 && (
          <div className="mt-8 text-center text-xs text-gray-500 dark:text-gray-600">
            Otomatik kontrol saat başı yapılır · Açık status sayfası:{" "}
            <a href="/status" className="underline">
              /status
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
