"use client";

import { useEffect, useMemo, useState } from "react";
import { HistoryStrip } from "@/components/history-strip";
import {
  formatDurationMinutes,
  getOpenIncident,
  getRecentChecks,
  getUptimePercentage,
  isMaintenanceActive,
} from "@/lib/site-utils";
import { Incident, Site } from "@/lib/types";

interface SiteCardProps {
  site: Site;
  onDelete: (id: string) => Promise<void>;
  onSave: (id: string, payload: Record<string, unknown>) => Promise<void>;
  formatDate: (iso: string | null) => string;
  timeSince: (iso: string | null) => string;
}

interface DraftState {
  group: string;
  tags: string;
  note: string;
  checkIntervalHours: number;
  timeoutMs: number;
  slowThresholdMs: number;
  notificationThresholdHours: number;
  expectedContent: string;
  expectedStatusCodes: string;
  expectedHeaderName: string;
  expectedHeaderValue: string;
  expectedFinalUrlContains: string;
  maintenanceUntil: string;
  emailAlerts: boolean;
  whatsappAlerts: boolean;
  showOnStatusPage: boolean;
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
  content_mismatch: { label: "İçerik Uyuşmuyor", icon: "🧩" },
  status_mismatch: { label: "Status Code Uyuşmuyor", icon: "🔢" },
  header_mismatch: { label: "Header Uyuşmuyor", icon: "🧾" },
  redirect_mismatch: { label: "Redirect Uyuşmuyor", icon: "↪️" },
  unknown: { label: "Bilinmeyen", icon: "❓" },
};

function toDraft(site: Site): DraftState {
  return {
    group: site.group,
    tags: site.tags.join(", "),
    note: site.note ?? "",
    checkIntervalHours: site.rules.checkIntervalHours,
    timeoutMs: site.rules.timeoutMs,
    slowThresholdMs: site.rules.slowThresholdMs,
    notificationThresholdHours: site.rules.notificationThresholdHours,
    expectedContent: site.rules.expectedContent ?? "",
    expectedStatusCodes: site.rules.expectedStatusCodes.join(", "),
    expectedHeaderName: site.rules.expectedHeaderName ?? "",
    expectedHeaderValue: site.rules.expectedHeaderValue ?? "",
    expectedFinalUrlContains: site.rules.expectedFinalUrlContains ?? "",
    maintenanceUntil: site.rules.maintenanceUntil
      ? site.rules.maintenanceUntil.slice(0, 16)
      : "",
    emailAlerts: site.rules.emailAlerts,
    whatsappAlerts: site.rules.whatsappAlerts,
    showOnStatusPage: site.rules.showOnStatusPage,
  };
}

function responseColor(ms: number | null) {
  if (ms === null) return "text-gray-500 dark:text-gray-400";
  if (ms < 500) return "text-accent-green";
  if (ms < 1500) return "text-accent-yellow";
  return "text-accent-red";
}

export function SiteCard({
  site,
  onDelete,
  onSave,
  formatDate,
  timeSince,
}: SiteCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<DraftState>(() => toDraft(site));

  useEffect(() => {
    setDraft(toDraft(site));
  }, [site]);

  const uptime24h = useMemo(() => getUptimePercentage(site.history, 24), [site.history]);
  const uptime7d = useMemo(
    () => getUptimePercentage(site.history, 24 * 7),
    [site.history]
  );
  const maintenanceActive = isMaintenanceActive(site.rules);
  const recentChecks = getRecentChecks(site.history, 24);
  const openIncident = getOpenIncident(site);
  const recentIncidents = [...site.incidents].reverse().slice(0, 3);

  async function handleSave() {
    setSaving(true);

    try {
      await onSave(site.id, {
        group: draft.group,
        tags: draft.tags,
        note: draft.note,
        rules: {
          checkIntervalHours: draft.checkIntervalHours,
          timeoutMs: draft.timeoutMs,
          slowThresholdMs: draft.slowThresholdMs,
          notificationThresholdHours: draft.notificationThresholdHours,
          expectedContent: draft.expectedContent,
          expectedStatusCodes: draft.expectedStatusCodes,
          expectedHeaderName: draft.expectedHeaderName,
          expectedHeaderValue: draft.expectedHeaderValue,
          expectedFinalUrlContains: draft.expectedFinalUrlContains,
          maintenanceUntil: draft.maintenanceUntil || null,
          emailAlerts: draft.emailAlerts,
          whatsappAlerts: draft.whatsappAlerts,
          showOnStatusPage: draft.showOnStatusPage,
        },
      });
      setExpanded(false);
    } catch {
      // Parent callback already shows a feedback message.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 flex-1 min-w-0">
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
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-semibold text-base">{site.name}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
                {site.group}
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
              {maintenanceActive && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-accent-yellow/10 text-accent-yellow border border-accent-yellow/20">
                  Bakım modu
                </span>
              )}
              {!site.rules.showOnStatusPage && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-500/10 text-gray-400 border border-gray-500/20">
                  Public sayfada gizli
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

            {site.tags.length > 0 && (
              <div className="flex gap-2 flex-wrap mt-2">
                {site.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-300"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {site.errorType && site.errorType !== "none" && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full border ${
                    site.errorType === "too_slow"
                      ? "bg-accent-yellow/10 text-accent-yellow border-accent-yellow/20"
                      : "bg-accent-red/10 text-accent-red border-accent-red/20"
                  }`}
                >
                  {(ERROR_LABELS[site.errorType] || ERROR_LABELS.unknown).icon}{" "}
                  {(ERROR_LABELS[site.errorType] || ERROR_LABELS.unknown).label}
                </span>
              )}

              {site.sslDaysRemaining !== null && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full border ${
                    site.sslDaysRemaining <= 0
                      ? "bg-accent-red/10 text-accent-red border-accent-red/20"
                      : site.sslDaysRemaining <= 30
                        ? "bg-accent-yellow/10 text-accent-yellow border-accent-yellow/20"
                        : "bg-accent-green/10 text-accent-green border-accent-green/20"
                  }`}
                >
                  🔒 SSL{" "}
                  {site.sslDaysRemaining <= 0
                    ? "süresi dolmuş"
                    : `${site.sslDaysRemaining} gün`}
                </span>
              )}

              {site.responseTime !== null && (
                <span className={`text-xs ${responseColor(site.responseTime)}`}>
                  ⚡ {site.responseTime}ms
                </span>
              )}

              <span className="text-xs text-gray-400">
                24s uptime: {uptime24h ?? "-"}%
              </span>
              <span className="text-xs text-gray-400">
                7g uptime: {uptime7d ?? "-"}%
              </span>
            </div>

            <div className="mt-3">
              <HistoryStrip history={recentChecks} />
            </div>

            {site.note && (
              <div className="mt-3 text-sm text-gray-300 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                {site.note}
              </div>
            )}

            {site.lastError && (
              <div className="mt-3 text-xs text-accent-red/80 bg-accent-red/5 border border-accent-red/10 rounded-lg px-3 py-2">
                {site.lastError}
              </div>
            )}

            <div className="grid md:grid-cols-4 gap-3 mt-4 text-xs text-gray-400">
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className="text-gray-500">SSL issuer</div>
                <div className="text-gray-200 mt-1">{site.sslIssuer ?? "-"}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className="text-gray-500">Geçerlilik</div>
                <div className="text-gray-200 mt-1">
                  {site.sslValidTo ? formatDate(site.sslValidTo) : "-"}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className="text-gray-500">Kontrol sıklığı</div>
                <div className="text-gray-200 mt-1">
                  {site.rules.checkIntervalHours} saat
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className="text-gray-500">Bildirim eşiği</div>
                <div className="text-gray-200 mt-1">
                  {site.rules.notificationThresholdHours} saat
                </div>
              </div>
            </div>

            {(openIncident || recentIncidents.length > 0) && (
              <div className="mt-4">
                <div className="text-sm font-medium mb-2">Incident geçmişi</div>
                <div className="space-y-2">
                  {recentIncidents.map((incident: Incident) => (
                    <div
                      key={incident.id}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300"
                    >
                      <div>
                        {formatDate(incident.startedAt)} başladı
                        {incident.resolvedAt
                          ? ` · ${formatDate(incident.resolvedAt)} çözüldü`
                          : " · hâlâ açık"}
                      </div>
                      <div className="text-gray-400 mt-1">
                        Süre: {formatDurationMinutes(incident.durationMinutes)}
                        {incident.channels.length > 0 &&
                          ` · bildirim: ${incident.channels.join(", ")}`}
                      </div>
                      {incident.message && (
                        <div className="text-gray-400 mt-1">{incident.message}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex gap-2 flex-wrap">
              <button
                onClick={() => setExpanded((current) => !current)}
                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm"
              >
                {expanded ? "Ayarları Gizle" : "Ayarları Düzenle"}
              </button>
              <button
                onClick={() => onDelete(site.id)}
                className="px-3 py-2 rounded-xl bg-accent-red/10 hover:bg-accent-red/20 border border-accent-red/20 text-sm text-accent-red"
              >
                Sil
              </button>
            </div>

            {expanded && (
              <div className="mt-4 border-t border-white/10 pt-4 grid gap-4">
                <div className="grid md:grid-cols-3 gap-3">
                  <label className="text-sm">
                    <span className="block mb-1 text-gray-400">Grup</span>
                    <input
                      value={draft.group}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          group: event.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-tertiary)] border border-glass-border text-sm"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block mb-1 text-gray-400">Etiketler</span>
                    <input
                      value={draft.tags}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          tags: event.target.value,
                        }))
                      }
                      placeholder="otel, kritik, vip"
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-tertiary)] border border-glass-border text-sm"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block mb-1 text-gray-400">Bakım bitişi</span>
                    <input
                      type="datetime-local"
                      value={draft.maintenanceUntil}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          maintenanceUntil: event.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-tertiary)] border border-glass-border text-sm"
                    />
                  </label>
                </div>

                <label className="text-sm">
                  <span className="block mb-1 text-gray-400">Not</span>
                  <textarea
                    value={draft.note}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        note: event.target.value,
                      }))
                    }
                    rows={3}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-tertiary)] border border-glass-border text-sm"
                  />
                </label>

                <div className="grid md:grid-cols-4 gap-3">
                  <label className="text-sm">
                    <span className="block mb-1 text-gray-400">Kontrol aralığı (saat)</span>
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={draft.checkIntervalHours}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          checkIntervalHours: Number(event.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-tertiary)] border border-glass-border text-sm"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block mb-1 text-gray-400">Timeout (ms)</span>
                    <input
                      type="number"
                      min={1000}
                      value={draft.timeoutMs}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          timeoutMs: Number(event.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-tertiary)] border border-glass-border text-sm"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block mb-1 text-gray-400">Yavaş eşik (ms)</span>
                    <input
                      type="number"
                      min={250}
                      value={draft.slowThresholdMs}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          slowThresholdMs: Number(event.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-tertiary)] border border-glass-border text-sm"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block mb-1 text-gray-400">Bildirim eşiği (saat)</span>
                    <input
                      type="number"
                      min={1}
                      max={168}
                      value={draft.notificationThresholdHours}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          notificationThresholdHours: Number(event.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-tertiary)] border border-glass-border text-sm"
                    />
                  </label>
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  <label className="text-sm">
                    <span className="block mb-1 text-gray-400">Beklenen içerik</span>
                    <input
                      value={draft.expectedContent}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          expectedContent: event.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-tertiary)] border border-glass-border text-sm"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block mb-1 text-gray-400">Beklenen status code'lar</span>
                    <input
                      value={draft.expectedStatusCodes}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          expectedStatusCodes: event.target.value,
                        }))
                      }
                      placeholder="200, 301"
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-tertiary)] border border-glass-border text-sm"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block mb-1 text-gray-400">Beklenen header adı</span>
                    <input
                      value={draft.expectedHeaderName}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          expectedHeaderName: event.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-tertiary)] border border-glass-border text-sm"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block mb-1 text-gray-400">Beklenen header değeri</span>
                    <input
                      value={draft.expectedHeaderValue}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          expectedHeaderValue: event.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-tertiary)] border border-glass-border text-sm"
                    />
                  </label>
                  <label className="text-sm md:col-span-2">
                    <span className="block mb-1 text-gray-400">Final URL içinde geçmeli</span>
                    <input
                      value={draft.expectedFinalUrlContains}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          expectedFinalUrlContains: event.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-tertiary)] border border-glass-border text-sm"
                    />
                  </label>
                </div>

                <div className="flex gap-4 flex-wrap text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draft.emailAlerts}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          emailAlerts: event.target.checked,
                        }))
                      }
                    />
                    E-posta bildirimi
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draft.whatsappAlerts}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          whatsappAlerts: event.target.checked,
                        }))
                      }
                    />
                    WhatsApp bildirimi
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draft.showOnStatusPage}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          showOnStatusPage: event.target.checked,
                        }))
                      }
                    />
                    Public status page'de göster
                  </label>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 rounded-xl bg-accent-blue text-white text-sm disabled:opacity-50"
                  >
                    {saving ? "Kaydediliyor..." : "Kaydet"}
                  </button>
                  <button
                    onClick={() => {
                      setDraft(toDraft(site));
                      setExpanded(false);
                    }}
                    className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-sm"
                  >
                    Vazgeç
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-xs text-gray-500 dark:text-gray-600">Son kontrol</div>
          <div className="text-xs text-gray-400">{timeSince(site.lastCheck)}</div>
          <div className="text-xs text-gray-500 mt-2">
            {site.lastCheck ? formatDate(site.lastCheck) : "Bekleniyor"}
          </div>
        </div>
      </div>
    </div>
  );
}
