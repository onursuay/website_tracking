import { NextRequest, NextResponse } from "next/server";
import { formatDurationMinutes, getOpenIncident, getUptimePercentage } from "@/lib/site-utils";
import { sendWeeklyReport } from "@/lib/notifier";
import { getSites } from "@/lib/store";

export const dynamic = "force-dynamic";

function isCronAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return true;
  }

  return req.headers.get("authorization") === `Bearer ${cronSecret}`;
}

function buildReport(sites: Awaited<ReturnType<typeof getSites>>) {
  const siteRows = sites
    .map((site) => {
      const uptime24h = getUptimePercentage(site.history, 24);
      const uptime7d = getUptimePercentage(site.history, 24 * 7);
      const openIncident = getOpenIncident(site);

      return `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${site.name}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${site.status === "up" ? "Çevrimiçi" : site.status === "down" ? "Çevrimdışı" : "Bekliyor"}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${uptime24h ?? "-"}%</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${uptime7d ?? "-"}%</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${site.responseTime ? `${site.responseTime} ms` : "-"}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${openIncident ? `Açık incident (${new Date(openIncident.startedAt).toLocaleString("tr-TR")})` : "Yok"}</td>
        </tr>
      `;
    })
    .join("");

  const openIncidents = sites
    .map((site) => {
      const incident = getOpenIncident(site);
      if (!incident) return null;

      return `- ${site.name}: ${new Date(incident.startedAt).toLocaleString("tr-TR")} itibarıyla açık (${incident.message ?? "neden belirtilmedi"})`;
    })
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto;">
      <h1>Website Tracking Haftalık Rapor</h1>
      <p>Rapor tarihi: ${new Date().toLocaleString("tr-TR")}</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
        <thead>
          <tr style="background: #0f172a; color: white;">
            <th style="padding: 10px; text-align: left;">Site</th>
            <th style="padding: 10px; text-align: left;">Durum</th>
            <th style="padding: 10px; text-align: left;">24 Saat</th>
            <th style="padding: 10px; text-align: left;">7 Gün</th>
            <th style="padding: 10px; text-align: left;">Son Yanıt</th>
            <th style="padding: 10px; text-align: left;">Incident</th>
          </tr>
        </thead>
        <tbody>${siteRows}</tbody>
      </table>
    </div>
  `;

  const text = [
    "Website Tracking Haftalık Rapor",
    `Rapor tarihi: ${new Date().toLocaleString("tr-TR")}`,
    "",
    ...sites.map((site) => {
      const uptime24h = getUptimePercentage(site.history, 24);
      const uptime7d = getUptimePercentage(site.history, 24 * 7);
      const openIncident = getOpenIncident(site);
      return `${site.name} | durum=${site.status} | 24s=${uptime24h ?? "-"}% | 7g=${uptime7d ?? "-"}% | son yanıt=${site.responseTime ?? "-"} ms | açık incident=${openIncident ? formatDurationMinutes(openIncident.durationMinutes) : "yok"}`;
    }),
    "",
    openIncidents ? `Açık incidentler:\n${openIncidents}` : "Açık incident yok.",
  ].join("\n");

  return { html, text };
}

async function sendReport() {
  const sites = await getSites();
  const report = buildReport(sites);
  const delivery = await sendWeeklyReport({
    subject: "Website Tracking Haftalık Rapor",
    html: report.html,
    text: report.text,
  });

  return NextResponse.json({
    sent: delivery.sentAny,
    channels: delivery.channels,
    generatedAt: new Date().toISOString(),
  });
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
  }

  return sendReport();
}

export async function POST() {
  return sendReport();
}
