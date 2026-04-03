import { NextRequest, NextResponse } from "next/server";
import { checkUrl } from "@/lib/checker";
import {
  appendHistory,
  getOpenIncident,
  isMaintenanceActive,
  upsertIncident,
} from "@/lib/site-utils";
import { sendDownAlert, sendRecoveryAlert } from "@/lib/notifier";
import { getSites, updateSite } from "@/lib/store";
import { CheckHistoryEntry, Incident, Site, SslInfo } from "@/lib/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const HOUR_MS = 60 * 60 * 1000;

function isCronAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return true;
  }

  return req.headers.get("authorization") === `Bearer ${cronSecret}`;
}

function buildSslUpdates(site: Site, sslInfo: SslInfo | null) {
  return {
    sslDaysRemaining: sslInfo?.daysRemaining ?? site.sslDaysRemaining,
    sslIssuer: sslInfo?.issuer ?? site.sslIssuer,
    sslSubject: sslInfo?.subject ?? site.sslSubject,
    sslValidFrom: sslInfo?.validFrom ?? site.sslValidFrom,
    sslValidTo: sslInfo?.validTo ?? site.sslValidTo,
  };
}

async function runChecks(force = false) {
  const sites = await getSites();
  const results = [];
  let checked = 0;
  let skipped = 0;

  for (const site of sites) {
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const intervalMs = site.rules.checkIntervalHours * HOUR_MS;
    const lastCheckAt = site.lastCheck ? new Date(site.lastCheck).getTime() : 0;

    if (!force && site.lastCheck && nowDate.getTime() - lastCheckAt < intervalMs) {
      skipped += 1;
      results.push({
        id: site.id,
        name: site.name,
        status: "skipped",
        nextDueAt: new Date(lastCheckAt + intervalMs).toISOString(),
      });
      continue;
    }

    checked += 1;

    const result = await checkUrl(site.url, {
      timeoutMs: site.rules.timeoutMs,
      slowThresholdMs: site.rules.slowThresholdMs,
      expectedContent: site.rules.expectedContent,
      expectedStatusCodes: site.rules.expectedStatusCodes,
      expectedHeaderName: site.rules.expectedHeaderName,
      expectedHeaderValue: site.rules.expectedHeaderValue,
      expectedFinalUrlContains: site.rules.expectedFinalUrlContains,
    });

    const maintenanceActive = isMaintenanceActive(site.rules, nowDate.getTime());
    const historyEntry: CheckHistoryEntry = {
      checkedAt: now,
      status: result.isUp ? "up" : "down",
      statusCode: result.statusCode,
      responseTime: result.responseTime,
      errorType: result.errorType === "none" ? null : result.errorType,
      message: result.error,
      location: "local-tr",
      slow: result.errorType === "too_slow",
    };

    if (result.isUp) {
      let incidents = site.incidents;
      const openIncident = getOpenIncident(site);

      if (openIncident && site.downSince) {
        const resolvedIncident: Incident = {
          ...openIncident,
          resolvedAt: now,
          durationMinutes: Math.max(
            1,
            Math.round(
              (nowDate.getTime() - new Date(openIncident.startedAt).getTime()) / 60000
            )
          ),
        };
        incidents = upsertIncident(site.incidents, resolvedIncident);

        if (site.notifiedAt && !maintenanceActive) {
          await sendRecoveryAlert({
            siteName: site.name,
            siteUrl: site.url,
            downSince: site.downSince,
            sendEmail: site.rules.emailAlerts,
            sendWhatsApp: site.rules.whatsappAlerts,
          });
        }
      }

      await updateSite(site.id, {
        status: "up",
        lastCheck: now,
        lastError: result.error,
        errorType: result.errorType !== "none" ? result.errorType : null,
        downSince: null,
        notifiedAt: null,
        responseTime: result.responseTime,
        history: appendHistory(site.history, historyEntry),
        incidents,
        ...buildSslUpdates(site, result.sslInfo),
      });

      results.push({
        id: site.id,
        name: site.name,
        status: "up",
        responseTime: result.responseTime,
        maintenanceActive,
      });
      continue;
    }

    const downSince = site.downSince || now;
    const downDuration = nowDate.getTime() - new Date(downSince).getTime();
    const notificationThresholdMs =
      site.rules.notificationThresholdHours * HOUR_MS;

    let openIncident = getOpenIncident(site);
    let incidents = site.incidents;
    let notifiedAt = site.notifiedAt;

    if (!openIncident) {
      openIncident = {
        id: crypto.randomUUID(),
        startedAt: downSince,
        resolvedAt: null,
        durationMinutes: null,
        message: result.error || `HTTP ${result.statusCode}`,
        errorType: result.errorType,
        notifiedAt: null,
        channels: [],
      };
    } else {
      openIncident = {
        ...openIncident,
        message: result.error || openIncident.message,
        errorType: result.errorType,
      };
    }

    if (
      downDuration >= notificationThresholdMs &&
      !openIncident.notifiedAt &&
      !maintenanceActive
    ) {
      const delivery = await sendDownAlert({
        siteName: site.name,
        siteUrl: site.url,
        error: `[${result.errorType}] ${result.error || `HTTP ${result.statusCode}`}`,
        downSince,
        sendEmail: site.rules.emailAlerts,
        sendWhatsApp: site.rules.whatsappAlerts,
      });

      if (delivery.sentAny) {
        notifiedAt = now;
        openIncident = {
          ...openIncident,
          notifiedAt: now,
          channels: delivery.channels,
        };
      }
    }

    incidents = upsertIncident(incidents, openIncident);

    await updateSite(site.id, {
      status: "down",
      lastCheck: now,
      lastError: result.error || `HTTP ${result.statusCode}`,
      errorType: result.errorType,
      downSince,
      notifiedAt,
      responseTime: result.responseTime,
      history: appendHistory(site.history, historyEntry),
      incidents,
      ...buildSslUpdates(site, result.sslInfo),
    });

    results.push({
      id: site.id,
      name: site.name,
      status: "down",
      errorType: result.errorType,
      error: result.error,
      responseTime: result.responseTime,
      maintenanceActive,
    });
  }

  return NextResponse.json({
    checked,
    skipped,
    timestamp: new Date().toISOString(),
    results,
  });
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
  }

  return runChecks(false);
}

export async function POST() {
  return runChecks(true);
}
