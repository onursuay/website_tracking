export type SiteStatus = "up" | "down" | "unknown";

export type ErrorType =
  | "none"
  | "ssl_expired"
  | "ssl_not_yet_valid"
  | "ssl_self_signed"
  | "ssl_hostname_mismatch"
  | "ssl_other"
  | "dns_not_found"
  | "connection_refused"
  | "connection_reset"
  | "timeout"
  | "http_4xx"
  | "http_5xx"
  | "too_slow"
  | "content_mismatch"
  | "status_mismatch"
  | "header_mismatch"
  | "redirect_mismatch"
  | "unknown";

export interface SslInfo {
  valid: boolean;
  issuer: string;
  subject: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number;
}

export interface CheckHistoryEntry {
  checkedAt: string;
  status: SiteStatus;
  statusCode: number | null;
  responseTime: number | null;
  errorType: ErrorType | null;
  message: string | null;
  location: string;
  slow: boolean;
}

export interface Incident {
  id: string;
  startedAt: string;
  resolvedAt: string | null;
  durationMinutes: number | null;
  message: string | null;
  errorType: ErrorType | null;
  notifiedAt: string | null;
  channels: string[];
}

export interface SiteRules {
  checkIntervalHours: number;
  timeoutMs: number;
  slowThresholdMs: number;
  notificationThresholdHours: number;
  expectedContent: string | null;
  expectedStatusCodes: number[];
  expectedHeaderName: string | null;
  expectedHeaderValue: string | null;
  expectedFinalUrlContains: string | null;
  maintenanceUntil: string | null;
  emailAlerts: boolean;
  whatsappAlerts: boolean;
  showOnStatusPage: boolean;
}

export interface Site {
  id: string;
  url: string;
  name: string;
  group: string;
  tags: string[];
  note: string | null;
  addedAt: string;
  lastCheck: string | null;
  status: SiteStatus;
  downSince: string | null;
  notifiedAt: string | null;
  lastError: string | null;
  errorType: ErrorType | null;
  responseTime: number | null;
  sslDaysRemaining: number | null;
  sslIssuer: string | null;
  sslSubject: string | null;
  sslValidFrom: string | null;
  sslValidTo: string | null;
  rules: SiteRules;
  history: CheckHistoryEntry[];
  incidents: Incident[];
}

export interface CheckResult {
  isUp: boolean;
  statusCode: number | null;
  error: string | null;
  errorType: ErrorType;
  responseTime: number;
  sslInfo: SslInfo | null;
  finalUrl: string | null;
}

export interface CheckOptions {
  timeoutMs?: number;
  slowThresholdMs?: number;
  expectedContent?: string | null;
  expectedStatusCodes?: number[];
  expectedHeaderName?: string | null;
  expectedHeaderValue?: string | null;
  expectedFinalUrlContains?: string | null;
}

export const HISTORY_LIMIT = 24 * 7;
export const INCIDENT_LIMIT = 50;

export function createDefaultSiteRules(): SiteRules {
  return {
    checkIntervalHours: 1,
    timeoutMs: 30000,
    slowThresholdMs: 5000,
    notificationThresholdHours: 3,
    expectedContent: null,
    expectedStatusCodes: [],
    expectedHeaderName: null,
    expectedHeaderValue: null,
    expectedFinalUrlContains: null,
    maintenanceUntil: null,
    emailAlerts: true,
    whatsappAlerts: true,
    showOnStatusPage: true,
  };
}
