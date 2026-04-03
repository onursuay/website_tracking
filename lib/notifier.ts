import { Resend } from "resend";

let resend: Resend | null = null;
let hasWarnedMissingKey = false;

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    if (!hasWarnedMissingKey) {
      hasWarnedMissingKey = true;
      console.warn(
        "[Notifier] RESEND_API_KEY tanimli degil. E-posta bildirimleri devre disi."
      );
    }

    return null;
  }

  if (!resend) {
    resend = new Resend(apiKey);
  }

  return resend;
}

interface NotifyParams {
  siteName: string;
  siteUrl: string;
  error: string;
  downSince: string;
}

export async function sendDownAlert({
  siteName,
  siteUrl,
  error,
  downSince,
}: NotifyParams): Promise<boolean> {
  const resendClient = getResendClient();
  if (!resendClient) {
    return false;
  }

  const notifyEmail = process.env.NOTIFY_EMAIL || "onursuay@hotmail.com";

  const downDate = new Date(downSince);
  const now = new Date();
  const downHours = Math.round(
    (now.getTime() - downDate.getTime()) / (1000 * 60 * 60)
  );

  try {
    await resendClient.emails.send({
      from: "Website Tracking <onboarding@resend.dev>",
      to: notifyEmail,
      subject: `🔴 SITE DOWN: ${siteName} (${downHours}+ saat)`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 20px;">Site Cevrimici Degil!</h1>
          </div>
          <div style="border: 1px solid #e5e7eb; padding: 20px; border-radius: 0 0 8px 8px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Site:</td>
                <td style="padding: 8px 0;">${siteName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">URL:</td>
                <td style="padding: 8px 0;"><a href="${siteUrl}" style="color: #2563eb;">${siteUrl}</a></td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Hata:</td>
                <td style="padding: 8px 0; color: #dc2626;">${error}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Down suresi:</td>
                <td style="padding: 8px 0;">${downHours} saat+ (${downDate.toLocaleString("tr-TR")} tarihinden beri)</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Kontrol zamani:</td>
                <td style="padding: 8px 0;">${now.toLocaleString("tr-TR")}</td>
              </tr>
            </table>
          </div>
          <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">
            Website Tracking tarafindan gonderildi
          </p>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error("Email gonderilemedi:", err);
    return false;
  }
}

export async function sendRecoveryAlert({
  siteName,
  siteUrl,
  downSince,
}: Omit<NotifyParams, "error">): Promise<boolean> {
  const resendClient = getResendClient();
  if (!resendClient) {
    return false;
  }

  const notifyEmail = process.env.NOTIFY_EMAIL || "onursuay@hotmail.com";

  const downDate = new Date(downSince);
  const now = new Date();
  const downHours = Math.round(
    (now.getTime() - downDate.getTime()) / (1000 * 60 * 60)
  );

  try {
    await resendClient.emails.send({
      from: "Website Tracking <onboarding@resend.dev>",
      to: notifyEmail,
      subject: `🟢 SITE RECOVERED: ${siteName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #16a34a; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 20px;">Site Tekrar Cevrimici!</h1>
          </div>
          <div style="border: 1px solid #e5e7eb; padding: 20px; border-radius: 0 0 8px 8px;">
            <p><strong>${siteName}</strong> (<a href="${siteUrl}">${siteUrl}</a>) tekrar erisilebilir durumda.</p>
            <p>Toplam kesinti suresi: ~${downHours} saat</p>
            <p>Kurtarma zamani: ${now.toLocaleString("tr-TR")}</p>
          </div>
        </div>
      `,
    });
    return true;
  } catch {
    return false;
  }
}
