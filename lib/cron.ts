const INTERVAL = 5 * 60 * 1000; // 5 dakika
let started = false;

export function startCron(baseUrl: string) {
  if (started) return;
  started = true;

  console.log(`[Cron] Otomatik kontrol basladi (her 5 dk)`);

  const run = async () => {
    try {
      const secret = process.env.CRON_SECRET;
      const res = await fetch(`${baseUrl}/api/check`, {
        headers: secret ? { Authorization: `Bearer ${secret}` } : {},
      });
      const data = await res.json();
      console.log(
        `[Cron] Kontrol tamamlandi: ${data.checked} site, ${new Date().toLocaleString("tr-TR")}`
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
