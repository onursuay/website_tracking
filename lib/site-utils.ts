import {
  CheckHistoryEntry,
  HISTORY_LIMIT,
  INCIDENT_LIMIT,
  Incident,
  Site,
  SiteRules,
} from "@/lib/types";

export function sanitizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function sanitizeTags(value: unknown): string[] {
  const source =
    typeof value === "string"
      ? value.split(",")
      : Array.isArray(value)
        ? value
        : [];

  return Array.from(
    new Set(
      source
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    )
  );
}

export function sanitizeNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

export function sanitizeStatusCodes(value: unknown): number[] {
  const raw =
    typeof value === "string"
      ? value.split(",")
      : Array.isArray(value)
        ? value
        : [];

  return Array.from(
    new Set(
      raw
        .map((item) =>
          typeof item === "number"
            ? item
            : typeof item === "string"
              ? Number(item.trim())
              : Number.NaN
        )
        .filter((item) => Number.isInteger(item) && item >= 100 && item <= 599)
    )
  );
}

export function normalizeRules(value: unknown): SiteRules {
  const source =
    value && typeof value === "object"
      ? (value as Partial<SiteRules>)
      : {};

  return {
    checkIntervalHours: sanitizeNumber(source.checkIntervalHours, 1, 1, 24),
    timeoutMs: sanitizeNumber(source.timeoutMs, 30000, 1000, 120000),
    slowThresholdMs: sanitizeNumber(source.slowThresholdMs, 5000, 250, 120000),
    notificationThresholdHours: sanitizeNumber(
      source.notificationThresholdHours,
      3,
      1,
      168
    ),
    expectedContent: sanitizeText(source.expectedContent),
    expectedStatusCodes: sanitizeStatusCodes(source.expectedStatusCodes),
    expectedHeaderName: sanitizeText(source.expectedHeaderName),
    expectedHeaderValue: sanitizeText(source.expectedHeaderValue),
    expectedFinalUrlContains: sanitizeText(source.expectedFinalUrlContains),
    maintenanceUntil: sanitizeIsoDate(source.maintenanceUntil),
    emailAlerts: source.emailAlerts !== false,
    whatsappAlerts: source.whatsappAlerts !== false,
    showOnStatusPage: source.showOnStatusPage !== false,
  };
}

export function sanitizeIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeHistory(value: unknown): CheckHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const current = entry as Partial<CheckHistoryEntry>;
      const checkedAt = sanitizeIsoDate(current.checkedAt);

      if (!checkedAt) {
        return null;
      }

      return {
        checkedAt,
        status:
          current.status === "up" ||
          current.status === "down" ||
          current.status === "unknown"
            ? current.status
            : "unknown",
        statusCode:
          typeof current.statusCode === "number" ? current.statusCode : null,
        responseTime:
          typeof current.responseTime === "number" ? current.responseTime : null,
        errorType: typeof current.errorType === "string" ? current.errorType : null,
        message: sanitizeText(current.message),
        location: sanitizeText(current.location) ?? "local-tr",
        slow: current.slow === true,
      };
    })
    .filter((entry): entry is CheckHistoryEntry => entry !== null)
    .sort((a, b) => a.checkedAt.localeCompare(b.checkedAt))
    .slice(-HISTORY_LIMIT);
}

export function normalizeIncidents(value: unknown): Incident[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((incident) => {
      if (!incident || typeof incident !== "object") {
        return null;
      }

      const current = incident as Partial<Incident>;
      const startedAt = sanitizeIsoDate(current.startedAt);

      if (!startedAt) {
        return null;
      }

      return {
        id: sanitizeText(current.id) ?? crypto.randomUUID(),
        startedAt,
        resolvedAt: sanitizeIsoDate(current.resolvedAt),
        durationMinutes:
          typeof current.durationMinutes === "number"
            ? current.durationMinutes
            : null,
        message: sanitizeText(current.message),
        errorType: typeof current.errorType === "string" ? current.errorType : null,
        notifiedAt: sanitizeIsoDate(current.notifiedAt),
        channels: Array.isArray(current.channels)
          ? current.channels.filter((channel): channel is string => typeof channel === "string")
          : [],
      };
    })
    .filter((incident): incident is Incident => incident !== null)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .slice(-INCIDENT_LIMIT);
}

export function appendHistory(
  history: CheckHistoryEntry[],
  entry: CheckHistoryEntry
): CheckHistoryEntry[] {
  return [...history, entry].slice(-HISTORY_LIMIT);
}

export function upsertIncident(
  incidents: Incident[],
  incident: Incident
): Incident[] {
  const next = [...incidents];
  const index = next.findIndex((item) => item.id === incident.id);

  if (index === -1) {
    next.push(incident);
  } else {
    next[index] = incident;
  }

  return next.sort((a, b) => a.startedAt.localeCompare(b.startedAt)).slice(-INCIDENT_LIMIT);
}

export function getOpenIncident(site: Site): Incident | null {
  const reversed = [...site.incidents].reverse();
  return reversed.find((incident) => incident.resolvedAt === null) ?? null;
}

export function isMaintenanceActive(rules: SiteRules, now = Date.now()): boolean {
  if (!rules.maintenanceUntil) {
    return false;
  }

  return new Date(rules.maintenanceUntil).getTime() > now;
}

export function getUptimePercentage(
  history: CheckHistoryEntry[],
  maxEntries: number
): number | null {
  const recent = history.slice(-maxEntries).filter((entry) => entry.status !== "unknown");

  if (recent.length === 0) {
    return null;
  }

  const upCount = recent.filter((entry) => entry.status === "up").length;
  return Math.round((upCount / recent.length) * 1000) / 10;
}

export function getRecentChecks(
  history: CheckHistoryEntry[],
  maxEntries: number
): CheckHistoryEntry[] {
  return history.slice(-maxEntries);
}

export function getGroupOptions(sites: Site[]): string[] {
  return Array.from(new Set(sites.map((site) => site.group))).sort((a, b) =>
    a.localeCompare(b, "tr")
  );
}

export function formatDurationMinutes(value: number | null): string {
  if (value === null || value < 1) {
    return "1 dk'dan kısa";
  }

  if (value < 60) {
    return `${Math.round(value)} dk`;
  }

  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);

  if (minutes === 0) {
    return `${hours} sa`;
  }

  return `${hours} sa ${minutes} dk`;
}

export function buildCsv(sites: Site[]): string {
  const header = [
    "id",
    "name",
    "url",
    "group",
    "status",
    "lastCheck",
    "responseTime",
    "lastError",
    "sslDaysRemaining",
    "tags",
    "note",
  ];

  const rows = sites.map((site) => [
    site.id,
    site.name,
    site.url,
    site.group,
    site.status,
    site.lastCheck ?? "",
    site.responseTime ?? "",
    site.lastError ?? "",
    site.sslDaysRemaining ?? "",
    site.tags.join("|"),
    site.note ?? "",
  ]);

  return [header, ...rows]
    .map((row) =>
      row
        .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
        .join(",")
    )
    .join("\n");
}
