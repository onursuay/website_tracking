"use client";

import { useEffect, useState, useCallback } from "react";
import { ModeToggle } from "@/components/mode-toggle";

interface Site {
  id: string;
  url: string;
  name: string;
  addedAt: string;
  lastCheck: string | null;
  status: "up" | "down" | "unknown";
  downSince: string | null;
  notifiedAt: string | null;
  lastError: string | null;
  errorType: string | null;
  responseTime: number | null;
  sslDaysRemaining: number | null;
}

interface Feedback {
  type: "error" | "success";
  text: string;
}

const ERROR_LABELS: Record<string, { label: string; icon: string }> = {
  ssl_expired: { label: "SSL Süresi Dolmuş", icon: "🔓" },
  ssl_not_yet_valid: { label: "SSL Geçerli Değil", icon: "🔓" },
  ssl_self_signed: { label: "Self-Signed SSL", icon: "⚠️" },
  ssl_hostname_mismatch: { label: "SSL Alan Adı Uyumsuz", icon: "🔓" },
  ssl_other: { label: "SSL Hatası", icon: "🔓" },
  dns_not_found: { label: "DNS Hatası", icon: "🌐" },
  connection_refused: { label: "Bağlantı Reddedildi", icon: "🚫" },
  connection_reset: { label: "Bağlantı Kesildi", icon: "⛓️" },
  timeout: { label: "Zaman Aşımı", icon: "⏱️" },
  http_4xx: { label: "İstemci Hatası", icon: "⚠️" },
  http_5xx: { label: "Sunucu Hatası", icon: "🔥" },
  too_slow: { label: "Yavaş Yanıt", icon: "🐌" },
  unknown: { label: "Bilinmeyen", icon: "❓" },
};

async function readJsonResponse<T>(res: Response, fallbackMessage: string): Promise<T> {
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

export default function Dashboard() {
  const [sites, setSites] = useState<Site[]>([]);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

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
    }, 3500);

    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const addSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url || !name) return;

    try {
      setLoading(true);
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, name }),
      });
      const site = await readJsonResponse<Site>(res, "Site eklenemedi.");

      setUrl("");
      setName("");
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
  };

  const deleteSite = async (id: string) => {
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
  };

  const runCheck = async () => {
    try {
      setChecking(true);
      const res = await fetch("/api/check", { method: "POST" });
      const data = await readJsonResponse<{ checked: number }>(
        res,
        "Kontrol başlatılamadı."
      );
      await fetchSites();
      setFeedback({
        type: "success",
        text: `${data.checked} site için kontrol tamamlandı.`,
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
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "Henüz kontrol edilmedi";
    return new Date(iso).toLocaleString("tr-TR");
  };

  const timeSince = (iso: string | null) => {
    if (!iso) return "Henüz kontrol edilmedi";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "az önce";
    if (mins < 60) return `${mins} dk önce`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} saat önce`;
    return `${Math.floor(hours / 24)} gün önce`;
  };

  const responseColor = (ms: number | null) => {
    if (ms === null) return "text-gray-500 dark:text-gray-400";
    if (ms < 500) return "text-accent-green";
    if (ms < 1500) return "text-accent-yellow";
    return "text-accent-red";
  };

  const upCount = sites.filter((s) => s.status === "up").length;
  const downCount = sites.filter((s) => s.status === "down").length;
  const unknownCount = sites.filter((s) => s.status === "unknown").length;
  const responseSamples = sites.filter(
    (site) => site.responseTime !== null
  );
  const avgResponse =
    responseSamples.length > 0
      ? Math.round(
          responseSamples.reduce(
            (sum, site) => sum + (site.responseTime ?? 0),
            0
          ) / responseSamples.length
        )
      : 0;

  return (
    <div className="min-h-screen">
      {/* Background gradient orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-[-1]">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-accent-purple/5 rounded-full blur-[100px]" />
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-accent-blue/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <header className="flex items-center justify-between mb-10">
          <div>
            <img
              src="/we_logo.png"
              alt="Website Tracking logo"
              className="h-20 w-auto object-contain"
            />
          </div>
          <div className="flex items-center gap-3">
            <ModeToggle />
            <button
              onClick={() => setShowForm(!showForm)}
              className="px-4 py-2.5 rounded-xl bg-accent-blue/10 text-accent-blue border border-accent-blue/20 hover:bg-accent-blue/20 transition-all text-sm font-medium"
            >
              + Site Ekle
            </button>
            <button
              onClick={runCheck}
              disabled={checking}
              className="px-4 py-2.5 rounded-xl bg-accent-purple/10 text-accent-purple border border-accent-purple/20 hover:bg-accent-purple/20 transition-all text-sm font-medium disabled:opacity-50"
            >
              {checking ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Kontrol ediliyor
                </span>
              ) : (
                "Kontrol Et"
              )}
            </button>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
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
            <div className="text-3xl font-bold text-accent-green flex items-center gap-2">
              {upCount}
              {upCount > 0 && <span className="w-2 h-2 rounded-full bg-accent-green pulse-green" />}
            </div>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Çevrimdışı
            </div>
            <div className="text-3xl font-bold text-accent-red flex items-center gap-2">
              {downCount}
              {downCount > 0 && <span className="w-2 h-2 rounded-full bg-accent-red pulse-red" />}
            </div>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Ort. Yanıt
            </div>
            <div className={`text-3xl font-bold ${responseColor(avgResponse)}`}>
              {avgResponse > 0 ? `${avgResponse}ms` : "-"}
            </div>
          </div>
        </div>

        {feedback && (
          <div
            className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${feedback.type === "error"
                ? "border-accent-red/20 bg-accent-red/10 text-accent-red"
                : "border-accent-green/20 bg-accent-green/10 text-accent-green"
              }`}
          >
            {feedback.text}
          </div>
        )}

        {/* Add Site Form */}
        {showForm && (
          <div className="glass-card rounded-2xl p-6 mb-8 border border-accent-blue/20">
            <h2 className="text-lg font-semibold mb-4">
              Yeni Site Ekle
            </h2>
            <form onSubmit={addSite} className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="Site adı"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1 px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] border border-glass-border placeholder-gray-500 text-sm focus:outline-none input-glow transition-all"
              />
              <input
                type="text"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-[2] px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] border border-glass-border placeholder-gray-500 text-sm focus:outline-none input-glow transition-all"
              />
              <button
                type="submit"
                disabled={loading || !url || !name}
                className="px-6 py-3 rounded-xl bg-accent-blue text-white font-medium text-sm hover:bg-accent-blue/80 disabled:opacity-30 transition-all whitespace-nowrap"
              >
                {loading ? "Ekleniyor..." : "Ekle"}
              </button>
            </form>
          </div>
        )}

        {/* Site List */}
        <div className="space-y-3">
          {sites.length === 0 ? (
            <div className="glass-card rounded-2xl p-16 text-center">
              <div className="text-5xl mb-4 opacity-20">📡</div>
              <p className="text-gray-400 text-lg">Henüz site eklenmemiş</p>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                &quot;+ Site Ekle&quot; butonuna tıklayarak başlayın
              </p>
            </div>
          ) : (
            sites.map((site) => (
              <div key={site.id} className="glass-card rounded-2xl p-5 group">
                <div className="flex items-start justify-between gap-4">
                  {/* Left: Status + Info */}
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    {/* Status indicator */}
                    <div className="pt-1">
                      {site.status === "up" ? (
                        <div className="w-3 h-3 rounded-full bg-accent-green pulse-green" />
                      ) : site.status === "down" ? (
                        <div className="w-3 h-3 rounded-full bg-accent-red pulse-red" />
                      ) : (
                        <div className="w-3 h-3 rounded-full bg-gray-400 dark:bg-gray-600" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Name + URL */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-semibold text-base">
                          {site.name}
                        </span>
                        {site.status === "up" && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-accent-green/10 text-accent-green border border-accent-green/20">
                            Çevrimiçi
                          </span>
                        )}
                        {site.status === "down" && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-accent-red/10 text-accent-red border border-accent-red/20">
                            Çevrimdışı
                          </span>
                        )}
                        {site.status === "unknown" && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-500/10 text-gray-500 dark:text-gray-400 border border-gray-500/20">
                            Bekliyor
                          </span>
                        )}
                      </div>

                      <a
                        href={site.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-gray-500 dark:text-gray-400 hover:text-accent-blue transition-colors truncate block mt-0.5"
                      >
                        {site.url}
                      </a>

                      {/* Error & badges row */}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {/* Error type badge */}
                        {site.errorType &&
                          site.errorType !== "none" &&
                          (() => {
                            const info = ERROR_LABELS[site.errorType] || ERROR_LABELS.unknown;
                            const isSSL = site.errorType.startsWith("ssl_");
                            return (
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full border ${
                                  isSSL
                                    ? "bg-accent-yellow/10 text-accent-yellow border-accent-yellow/20"
                                    : site.errorType === "too_slow"
                                      ? "bg-accent-green/10 text-accent-green border-accent-green/20"
                                      : "bg-accent-red/10 text-accent-red border-accent-red/20"
                                }`}
                              >
                                {info.icon} {info.label}
                              </span>
                            );
                          })()}

                        {/* SSL badge */}
                        {site.sslDaysRemaining !== null && (
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full border ${site.sslDaysRemaining <= 0
                                ? "bg-accent-red/10 text-accent-red border-accent-red/20"
                                : site.sslDaysRemaining <= 30
                                  ? "bg-accent-yellow/10 text-accent-yellow border-accent-yellow/20"
                                  : "bg-accent-green/10 text-accent-green border-accent-green/20"
                              }`}
                          >
                            🔒 SSL {site.sslDaysRemaining <= 0
                              ? "süresi dolmuş"
                              : `${site.sslDaysRemaining} gün`}
                          </span>
                        )}

                        {/* Response time */}
                        {site.responseTime !== null && (
                          <span
                            className={`text-xs ${
                              site.errorType === "too_slow"
                                ? "text-accent-green"
                                : responseColor(site.responseTime)
                            }`}
                          >
                            ⚡ {site.responseTime}ms
                          </span>
                        )}
                      </div>

                      {/* Error detail */}
                      {site.lastError && (
                        <div
                          className={`mt-2 text-xs rounded-lg px-3 py-2 ${
                            site.errorType === "too_slow"
                              ? "text-accent-green/90 bg-accent-green/5 border border-accent-green/10"
                              : "text-accent-red/80 bg-accent-red/5 border border-accent-red/10"
                          }`}
                        >
                          {site.lastError}
                        </div>
                      )}

                      {/* Down since */}
                      {site.downSince && (
                        <div className="mt-2 text-xs text-accent-yellow/90 dark:text-accent-yellow/70">
                          ⏳ {formatDate(site.downSince)} tarihinden beri çevrimdışı
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Time + Delete */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-xs text-gray-500 dark:text-gray-600">Son kontrol</div>
                      <div className="text-xs text-gray-400">
                        {timeSince(site.lastCheck)}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteSite(site.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg hover:bg-accent-red/10 text-gray-400 dark:text-gray-600 hover:text-accent-red"
                      title="Sil"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {sites.length > 0 && (
          <div className="mt-8 text-center text-xs text-gray-500 dark:text-gray-600">
            Her 5 dakikada otomatik kontrol yapılır
            {unknownCount > 0 && ` · ${unknownCount} site henüz kontrol edilmedi`}
          </div>
        )}
      </div>
    </div>
  );
}
