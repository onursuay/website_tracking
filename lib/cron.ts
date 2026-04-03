const INTERVAL = 60 * 60 * 1000; // 1 saat
let started = false;

export function startCron(baseUrl: string) {
  if (started) return;
  started = true;

  console.log(`[Cron] Otomatik kontrol başladı (saat başı)`);

  const run = async () => {
    try {
      const secret = process.env.CRON_SECRET;
      const res = await fetch(`${baseUrl}/api/check`, {
        headers: secret ? { Authorization: `Bearer ${secret}` } : {},
      });
      const data = await res.json();
      console.log(
        `[Cron] Kontrol tamamlandı: ${data.checked} site, ${data.skipped ?? 0} atlandı, ${new Date().toLocaleString("tr-TR")}`
      );
    } catch (err) {
      console.error(`[Cron] Hata:`, err);
    }
  };

  // İlk kontrolü 10 sn sonra yap (sunucu tamamen hazır olsun)
  setTimeout(() => {
    run();
    setInterval(run, INTERVAL);
  }, 10000);
}
