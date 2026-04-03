import https from "https";
import { URL } from "url";
import { CheckOptions, CheckResult, ErrorType, SslInfo } from "@/lib/types";

function normalizeSslInfo(cert: import("tls").PeerCertificate): SslInfo | null {
  if (!cert.valid_from || !cert.valid_to) {
    return null;
  }

  const validFrom = new Date(cert.valid_from);
  const validTo = new Date(cert.valid_to);
  const now = new Date();
  const daysRemaining = Math.floor(
    (validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    valid: now >= validFrom && now <= validTo,
    issuer: String(cert.issuer?.O || cert.issuer?.CN || "Bilinmiyor"),
    subject: String(cert.subject?.CN || "Bilinmiyor"),
    validFrom: validFrom.toISOString(),
    validTo: validTo.toISOString(),
    daysRemaining,
  };
}

function checkSsl(hostname: string): Promise<SslInfo | null> {
  return new Promise((resolve) => {
    try {
      const req = https.request(
        { hostname, port: 443, method: "HEAD", timeout: 5000 },
        (res) => {
          const cert = (res.socket as import("tls").TLSSocket).getPeerCertificate();
          resolve(cert ? normalizeSslInfo(cert) : null);
          res.destroy();
        }
      );

      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        req.destroy();
        resolve(null);
      });
      req.end();
    } catch {
      resolve(null);
    }
  });
}

function classifyError(err: Error): { error: string; errorType: ErrorType } {
  const msg = err.message || "";

  if (err.name === "AbortError") {
    return { error: "Zaman aşımı", errorType: "timeout" };
  }
  if (msg.includes("ENOTFOUND")) {
    return {
      error: "DNS bulunamadı - alan adı geçersiz veya DNS sunucusu yanıtlamıyor",
      errorType: "dns_not_found",
    };
  }
  if (msg.includes("ECONNREFUSED")) {
    return {
      error: "Bağlantı reddedildi - sunucu portu kapalı veya servis çalışmıyor",
      errorType: "connection_refused",
    };
  }
  if (msg.includes("ECONNRESET")) {
    return {
      error: "Bağlantı sıfırlandı - sunucu bağlantıyı kesti",
      errorType: "connection_reset",
    };
  }
  if (msg.includes("CERT_HAS_EXPIRED") || msg.includes("certificate has expired")) {
    return { error: "SSL sertifikası süresi dolmuş", errorType: "ssl_expired" };
  }
  if (msg.includes("CERT_NOT_YET_VALID")) {
    return {
      error: "SSL sertifikası henüz geçerli değil",
      errorType: "ssl_not_yet_valid",
    };
  }
  if (msg.includes("DEPTH_ZERO_SELF_SIGNED") || msg.includes("self signed")) {
    return {
      error: "SSL sertifikası self-signed (kendinden imzalı)",
      errorType: "ssl_self_signed",
    };
  }
  if (msg.includes("ERR_TLS_CERT_ALTNAME_INVALID") || msg.includes("hostname")) {
    return {
      error: "SSL sertifikası alan adıyla uyuşmuyor",
      errorType: "ssl_hostname_mismatch",
    };
  }
  if (msg.includes("certificate") || msg.includes("SSL") || msg.includes("TLS")) {
    return { error: `SSL hatası: ${msg}`, errorType: "ssl_other" };
  }

  return { error: msg || "Bilinmeyen hata", errorType: "unknown" };
}

function classifyHttpStatus(
  status: number,
  statusText: string
): { error: string; errorType: ErrorType } {
  if (status >= 500) {
    return {
      error: `HTTP ${status} ${statusText || "Sunucu hatası"}`,
      errorType: "http_5xx",
    };
  }

  if (status >= 400) {
    return {
      error: `HTTP ${status} ${statusText || "İstemci hatası"}`,
      errorType: "http_4xx",
    };
  }

  return { error: "", errorType: "none" };
}

function hasExpectedHeader(
  headers: Headers,
  expectedHeaderName: string | null | undefined,
  expectedHeaderValue: string | null | undefined
): { ok: boolean; message: string | null } {
  if (!expectedHeaderName) {
    return { ok: true, message: null };
  }

  const value = headers.get(expectedHeaderName);

  if (!value) {
    return {
      ok: false,
      message: `Beklenen header bulunamadı: ${expectedHeaderName}`,
    };
  }

  if (expectedHeaderValue && !value.includes(expectedHeaderValue)) {
    return {
      ok: false,
      message: `${expectedHeaderName} header değeri "${expectedHeaderValue}" içermiyor`,
    };
  }

  return { ok: true, message: null };
}

export async function checkUrl(
  url: string,
  options: CheckOptions = {}
): Promise<CheckResult> {
  const start = Date.now();
  const parsedUrl = new URL(url);
  const isHttps = parsedUrl.protocol === "https:";
  const timeoutMs = options.timeoutMs ?? 30000;
  const slowThresholdMs = options.slowThresholdMs ?? 5000;
  const expectedStatusCodes = options.expectedStatusCodes ?? [];

  const sslPromise = isHttps ? checkSsl(parsedUrl.hostname) : Promise.resolve(null);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
      headers: {
        "User-Agent": "WebsiteTracking/1.0",
        "Cache-Control": "no-cache",
      },
    });

    clearTimeout(timeout);

    const responseTime = Date.now() - start;
    const sslInfo = await sslPromise;
    const finalUrl = res.url || url;

    if (expectedStatusCodes.length > 0 && !expectedStatusCodes.includes(res.status)) {
      return {
        isUp: false,
        statusCode: res.status,
        error: `Beklenen durum kodları: ${expectedStatusCodes.join(", ")}. Alınan: ${res.status}`,
        errorType: "status_mismatch",
        responseTime,
        sslInfo,
        finalUrl,
      };
    }

    if (res.status >= 400) {
      const { error, errorType } = classifyHttpStatus(res.status, res.statusText);
      return {
        isUp: false,
        statusCode: res.status,
        error,
        errorType,
        responseTime,
        sslInfo,
        finalUrl,
      };
    }

    if (
      options.expectedFinalUrlContains &&
      !finalUrl.includes(options.expectedFinalUrlContains)
    ) {
      return {
        isUp: false,
        statusCode: res.status,
        error: `Yönlendirme sonucu "${options.expectedFinalUrlContains}" içermiyor`,
        errorType: "redirect_mismatch",
        responseTime,
        sslInfo,
        finalUrl,
      };
    }

    const headerCheck = hasExpectedHeader(
      res.headers,
      options.expectedHeaderName,
      options.expectedHeaderValue
    );

    if (!headerCheck.ok) {
      return {
        isUp: false,
        statusCode: res.status,
        error: headerCheck.message,
        errorType: "header_mismatch",
        responseTime,
        sslInfo,
        finalUrl,
      };
    }

    if (options.expectedContent) {
      const body = await res.text();

      if (!body.includes(options.expectedContent)) {
        return {
          isUp: false,
          statusCode: res.status,
          error: `Beklenen içerik bulunamadı: ${options.expectedContent}`,
          errorType: "content_mismatch",
          responseTime,
          sslInfo,
          finalUrl,
        };
      }
    }

    if (responseTime > slowThresholdMs) {
      return {
        isUp: true,
        statusCode: res.status,
        error: `Yavaş yanıt: ${(responseTime / 1000).toFixed(1)} sn (eşik: ${(slowThresholdMs / 1000).toFixed(1)} sn)`,
        errorType: "too_slow",
        responseTime,
        sslInfo,
        finalUrl,
      };
    }

    let sslWarning: string | null = null;
    if (sslInfo && sslInfo.daysRemaining <= 30 && sslInfo.daysRemaining > 0) {
      sslWarning = `SSL sertifikası ${sslInfo.daysRemaining} gün içinde sona erecek!`;
    }

    return {
      isUp: true,
      statusCode: res.status,
      error: sslWarning,
      errorType: "none",
      responseTime,
      sslInfo,
      finalUrl,
    };
  } catch (err: unknown) {
    const responseTime = Date.now() - start;
    const sslInfo = await sslPromise;

    if (err instanceof Error) {
      const { error, errorType } = classifyError(err);
      return {
        isUp: false,
        statusCode: null,
        error,
        errorType,
        responseTime,
        sslInfo,
        finalUrl: null,
      };
    }

    return {
      isUp: false,
      statusCode: null,
      error: "Bilinmeyen hata",
      errorType: "unknown",
      responseTime,
      sslInfo,
      finalUrl: null,
    };
  }
}
