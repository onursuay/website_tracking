import { Resend } from "resend";

interface DeliveryResult {
  sentAny: boolean;
  channels: string[];
}

interface DownAlertParams {
  siteName: string;
  siteUrl: string;
  error: string;
  downSince: string;
  sendEmail: boolean;
  sendWhatsApp: boolean;
}

interface RecoveryAlertParams {
  siteName: string;
  siteUrl: string;
  downSince: string;
  sendEmail: boolean;
  sendWhatsApp: boolean;
}

interface WeeklyReportParams {
  subject: string;
  html: string;
  text: string;
}

let resend: Resend | null = null;
let hasWarnedMissingEmailKey = false;
let hasWarnedMissingWhatsAppConfig = false;

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    if (!hasWarnedMissingEmailKey) {
      hasWarnedMissingEmailKey = true;
      console.warn(
        "[Notifier] RESEND_API_KEY tanımlı değil. E-posta bildirimleri devre dışı."
      );
    }

    return null;
  }

  if (!resend) {
    resend = new Resend(apiKey);
  }

  return resend;
}

function getWhatsAppConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.WHATSAPP_FROM;
  const to = process.env.WHATSAPP_TO;

  if (!accountSid || !authToken || !from || !to) {
    if (!hasWarnedMissingWhatsAppConfig) {
      hasWarnedMissingWhatsAppConfig = true;
      console.warn(
        "[Notifier] WhatsApp için Twilio env değişkenleri eksik. WhatsApp bildirimleri devre dışı."
      );
    }

    return null;
  }

  return { accountSid, authToken, from, to };
}

async function sendEmail(subject: string, html: string): Promise<boolean> {
  const resendClient = getResendClient();

  if (!resendClient) {
    return false;
  }

  try {
    await resendClient.emails.send({
      from: "Website Tracking <onboarding@resend.dev>",
      to: process.env.NOTIFY_EMAIL || "onursuay@hotmail.com",
      subject,
      html,
    });
    return true;
  } catch (error) {
    console.error("E-posta gönderilemedi:", error);
    return false;
  }
}

async function sendWhatsAppMessage(body: string): Promise<boolean> {
  const config = getWhatsAppConfig();

  if (!config) {
    return false;
  }

  try {
    const payload = new URLSearchParams({
      Body: body,
      From: config.from,
      To: config.to,
    });

    const auth = Buffer.from(
      `${config.accountSid}:${config.authToken}`
    ).toString("base64");

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: payload.toString(),
      }
    );

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      console.error("WhatsApp gönderilemedi:", response.status, details);
      return false;
    }

    return true;
  } catch (error) {
    console.error("WhatsApp gönderilemedi:", error);
    return false;
  }
}

async function deliverNotification(
  subject: string,
  html: string,
  whatsappText: string,
  sendEmailChannel: boolean,
  sendWhatsAppChannel: boolean
): Promise<DeliveryResult> {
  const channels: string[] = [];

  if (sendEmailChannel && (await sendEmail(subject, html))) {
    channels.push("email");
  }

  if (sendWhatsAppChannel && (await sendWhatsAppMessage(whatsappText))) {
    channels.push("whatsapp");
  }

  return {
    sentAny: channels.length > 0,
    channels,
  };
}

export async function sendDownAlert({
  siteName,
  siteUrl,
  error,
  downSince,
  sendEmail,
  sendWhatsApp,
}: DownAlertParams): Promise<DeliveryResult> {
  const downDate = new Date(downSince);
  const now = new Date();
  const downHours = Math.round(
    (now.getTime() - downDate.getTime()) / (1000 * 60 * 60)
  );

  const subject = `🔴 SİTE ÇEVRİMDIŞI: ${siteName} (${downHours}+ saat)`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 20px;">Site Çevrimdışı!</h1>
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
            <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Kesinti süresi:</td>
            <td style="padding: 8px 0;">${downHours} saat+ (${downDate.toLocaleString("tr-TR")} tarihinden beri)</td>
          </tr>
        </table>
      </div>
    </div>
  `;
  const whatsappText = [
    "🔴 Website Tracking Uyarısı",
    `${siteName} erişilemiyor.`,
    `URL: ${siteUrl}`,
    `Süre: ${downHours}+ saat`,
    `Hata: ${error}`,
  ].join("\n");

  return deliverNotification(
    subject,
    html,
    whatsappText,
    sendEmail,
    sendWhatsApp
  );
}

export async function sendRecoveryAlert({
  siteName,
  siteUrl,
  downSince,
  sendEmail,
  sendWhatsApp,
}: RecoveryAlertParams): Promise<DeliveryResult> {
  const downDate = new Date(downSince);
  const now = new Date();
  const downHours = Math.round(
    (now.getTime() - downDate.getTime()) / (1000 * 60 * 60)
  );

  const subject = `🟢 SİTE YENİDEN ÇEVRİMİÇİ: ${siteName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #16a34a; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 20px;">Site Tekrar Çevrimiçi!</h1>
      </div>
      <div style="border: 1px solid #e5e7eb; padding: 20px; border-radius: 0 0 8px 8px;">
        <p><strong>${siteName}</strong> (<a href="${siteUrl}">${siteUrl}</a>) tekrar erişilebilir durumda.</p>
        <p>Toplam kesinti süresi: ~${downHours} saat</p>
        <p>Kurtarma zamanı: ${now.toLocaleString("tr-TR")}</p>
      </div>
    </div>
  `;
  const whatsappText = [
    "🟢 Website Tracking",
    `${siteName} yeniden çevrimiçi.`,
    `URL: ${siteUrl}`,
    `Toplam kesinti: yaklaşık ${downHours} saat`,
  ].join("\n");

  return deliverNotification(
    subject,
    html,
    whatsappText,
    sendEmail,
    sendWhatsApp
  );
}

export async function sendWeeklyReport({
  subject,
  html,
  text,
}: WeeklyReportParams): Promise<DeliveryResult> {
  return deliverNotification(subject, html, text, true, true);
}
