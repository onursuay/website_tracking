import { NextRequest, NextResponse } from "next/server";
import { getSites, updateSite } from "@/lib/store";
import { checkUrl } from "@/lib/checker";
import { sendDownAlert, sendRecoveryAlert } from "@/lib/notifier";

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;

export const maxDuration = 60; // Vercel's 10s limit override for this route
export const dynamic = "force-dynamic"; // Do not cache this route

function isCronAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return true;
  }

  return req.headers.get("authorization") === `Bearer ${cronSecret}`;
}

async function runChecks() {
  const sites = await getSites();
  const results = [];

  for (const site of sites) {
    const result = await checkUrl(site.url);
    const now = new Date().toISOString();
    const sslDays = result.sslInfo?.daysRemaining ?? null;

    if (result.isUp) {
      if (site.downSince && site.notifiedAt) {
        await sendRecoveryAlert({
          siteName: site.name,
          siteUrl: site.url,
          downSince: site.downSince,
        });
      }

      await updateSite(site.id, {
        status: "up",
        lastCheck: now,
        lastError: result.error, // SSL uyarısı olabilir
        errorType: result.errorType !== "none" ? result.errorType : null,
        downSince: null,
        notifiedAt: site.downSince ? null : site.notifiedAt,
        responseTime: result.responseTime,
        sslDaysRemaining: sslDays,
      });

      results.push({
        id: site.id,
        name: site.name,
        status: "up",
        responseTime: result.responseTime,
        sslDaysRemaining: sslDays,
      });
    } else {
      const downSince = site.downSince || now;
      const downDuration = Date.now() - new Date(downSince).getTime();
      let notifiedAt = site.notifiedAt;

      if (downDuration >= FIVE_HOURS_MS) {
        // Send email only if we haven't notified for this specific downtime incident yet
        // meaning `site.notifiedAt` is null (never notified since it went down 5+ hours ago)
        const shouldNotify = !site.notifiedAt;

        if (shouldNotify) {
          const errorDetail = `[${result.errorType}] ${result.error || `HTTP ${result.statusCode}`}`;
          const sent = await sendDownAlert({
            siteName: site.name,
            siteUrl: site.url,
            error: errorDetail,
            downSince,
          });
          if (sent) {
            notifiedAt = now;
          }
        }
      }

      await updateSite(site.id, {
        status: "down",
        lastCheck: now,
        lastError: result.error || `HTTP ${result.statusCode}`,
        errorType: result.errorType,
        downSince,
        notifiedAt,
        responseTime: result.responseTime,
        sslDaysRemaining: sslDays,
      });

      results.push({
        id: site.id,
        name: site.name,
        status: "down",
        errorType: result.errorType,
        error: result.error,
        responseTime: result.responseTime,
      });
    }
  }

  return NextResponse.json({
    checked: results.length,
    timestamp: new Date().toISOString(),
    results,
  });
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Yetkisiz erisim" }, { status: 401 });
  }

  return runChecks();
}

export async function POST() {
  return runChecks();
}
