import { getSites } from "@/lib/store";
import { getOpenIncident, getUptimePercentage } from "@/lib/site-utils";

export const dynamic = "force-dynamic";

function formatDate(iso: string | null) {
  if (!iso) return "Henüz kontrol edilmedi";
  return new Date(iso).toLocaleString("tr-TR");
}

export default async function PublicStatusPage() {
  const sites = (await getSites()).filter((site) => site.rules.showOnStatusPage);
  const upCount = sites.filter((site) => site.status === "up").length;
  const openIncidents = sites.filter((site) => getOpenIncident(site)).length;

  return (
    <main className="min-h-screen bg-background text-foreground px-6 py-12">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold">Website Tracking Status</h1>
          <p className="text-gray-500 mt-2">
            Son güncelleme: {new Date().toLocaleString("tr-TR")}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <div className="glass-card rounded-2xl p-5">
            <div className="text-xs uppercase text-gray-500 mb-2">Toplam site</div>
            <div className="text-3xl font-bold">{sites.length}</div>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <div className="text-xs uppercase text-gray-500 mb-2">Çevrimiçi</div>
            <div className="text-3xl font-bold text-accent-green">{upCount}</div>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <div className="text-xs uppercase text-gray-500 mb-2">Açık incident</div>
            <div className="text-3xl font-bold text-accent-yellow">{openIncidents}</div>
          </div>
        </div>

        <div className="space-y-4">
          {sites.map((site) => {
            const uptime24h = getUptimePercentage(site.history, 24);
            const uptime7d = getUptimePercentage(site.history, 24 * 7);
            const openIncident = getOpenIncident(site);

            return (
              <div key={site.id} className="glass-card rounded-2xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="text-xl font-semibold">{site.name}</h2>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border ${
                          site.status === "up"
                            ? "bg-accent-green/10 text-accent-green border-accent-green/20"
                            : site.status === "down"
                              ? "bg-accent-red/10 text-accent-red border-accent-red/20"
                              : "bg-gray-500/10 text-gray-400 border-gray-500/20"
                        }`}
                      >
                        {site.status === "up"
                          ? "Çevrimiçi"
                          : site.status === "down"
                            ? "Çevrimdışı"
                            : "Bekliyor"}
                      </span>
                      {site.group && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
                          {site.group}
                        </span>
                      )}
                    </div>
                    <a
                      href={site.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-gray-500 hover:text-accent-blue mt-1 inline-block"
                    >
                      {site.url}
                    </a>
                  </div>
                  <div className="text-right text-sm text-gray-400">
                    <div>Son kontrol</div>
                    <div>{formatDate(site.lastCheck)}</div>
                  </div>
                </div>

                <div className="grid md:grid-cols-4 gap-3 mt-4 text-sm">
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    24 saat uptime
                    <div className="text-lg font-semibold mt-1">{uptime24h ?? "-"}%</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    7 gün uptime
                    <div className="text-lg font-semibold mt-1">{uptime7d ?? "-"}%</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    Son yanıt
                    <div className="text-lg font-semibold mt-1">
                      {site.responseTime ? `${site.responseTime} ms` : "-"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    SSL
                    <div className="text-lg font-semibold mt-1">
                      {site.sslDaysRemaining !== null
                        ? `${site.sslDaysRemaining} gün`
                        : "-"}
                    </div>
                  </div>
                </div>

                {openIncident && (
                  <div className="mt-4 rounded-xl border border-accent-yellow/20 bg-accent-yellow/10 px-4 py-3 text-sm text-accent-yellow">
                    Açık incident: {formatDate(openIncident.startedAt)} ·{" "}
                    {openIncident.message ?? "neden belirtilmedi"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
