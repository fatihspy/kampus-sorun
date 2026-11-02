// E-posta gönderimi. Render'ın ücretsiz katmanı SMTP portlarını engellediği için
// her iki yol da HTTPS API kullanır.
//
// 1) Gmail API (tercih edilen): GMAIL_REFRESH_TOKEN tanımlıysa kullanılır.
//    Mail gerçekten Gmail'den çıktığı için DMARC'ı geçer (Microsoft 365 / okul
//    adreslerinde Brevo + gmail.com göndericisi bu yüzden sessizce düşüyordu).
//    Gerekli env: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, EMAIL_USER (gönderen gmail adresi)
//
// 2) Brevo (yedek): GMAIL_REFRESH_TOKEN yoksa eski yol. Gerekli env: BREVO_API_KEY, EMAIL_USER

function buildHtml(code, { intro, outro }) {
  return `
        <div style="font-family: sans-serif; max-width: 420px; margin: 0 auto;">
          <h2 style="color: #1e3a8a;">Kampüs Sorun Bildirim</h2>
          <p>${intro}</p>
          <div style="background: #eef2ff; color: #1e3a8a; font-size: 28px; font-weight: bold; letter-spacing: 6px; text-align: center; padding: 16px; border-radius: 10px; margin: 16px 0;">
            ${code}
          </div>
          <p style="color: #888; font-size: 13px;">${outro}</p>
        </div>
      `;
}

// ---------- Gmail API ----------

let cachedToken = null; // { value, expiresAt }

async function getGmailAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60 * 1000) {
    return cachedToken.value;
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID || '',
      client_secret: process.env.GMAIL_CLIENT_SECRET || '',
      refresh_token: process.env.GMAIL_REFRESH_TOKEN || '',
      grant_type: 'refresh_token'
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const reason = data.error_description || data.error || `HTTP ${res.status}`;
    throw new Error(`Gmail yetkilendirme hatası: ${reason}`);
  }

  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000
  };
  return cachedToken.value;
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const encodedWord = (s) => `=?UTF-8?B?${b64(s)}?=`;
const noLineBreaks = (s) => String(s).replace(/[\r\n]+/g, ' ').trim();

function buildRawMessage(to, subject, html) {
  const from = noLineBreaks(process.env.EMAIL_USER);
  const body = b64(html).replace(/(.{76})/g, '$1\r\n');

  const message = [
    `From: ${encodedWord('Kampüs Sorun Bildirim')} <${from}>`,
    `To: ${noLineBreaks(to)}`,
    `Subject: ${encodedWord(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    body
  ].join('\r\n');

  return Buffer.from(message, 'utf8').toString('base64url');
}

async function sendViaGmail(to, subject, html) {
  const accessToken = await getGmailAccessToken();
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ raw: buildRawMessage(to, subject, html) })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) cachedToken = null;
    throw new Error(data.error?.message || `Gmail API hatası (${res.status})`);
  }
  return data.id;
}

// ---------- Brevo (yedek) ----------

async function sendViaBrevo(to, subject, html) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': process.env.BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: { email: process.env.EMAIL_USER, name: 'Kampüs Sorun Bildirim' },
      to: [{ email: to }],
      subject,
      htmlContent: html
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `Brevo API hatası (${res.status})`);
  }
  return data.messageId;
}

// ---------- Ortak ----------

async function sendCodeEmail(to, code, { subject, intro, outro }) {
  const provider = process.env.GMAIL_REFRESH_TOKEN ? 'gmail' : 'brevo';
  console.log(`[mailer] ${to} adresine kod gönderiliyor (${subject}) via ${provider}...`);

  const html = buildHtml(code, { intro, outro });

  try {
    const id = provider === 'gmail'
      ? await sendViaGmail(to, subject, html)
      : await sendViaBrevo(to, subject, html);
    console.log(`[mailer] ${to} adresine gönderim başarılı (${provider}, id: ${id || '-'}).`);
  } catch (err) {
    console.error(`[mailer] ${to} adresine gönderim BAŞARISIZ (${provider}):`, err.message);
    throw err;
  }
}

function sendResetCodeEmail(to, code) {
  return sendCodeEmail(to, code, {
    subject: 'Şifre Sıfırlama Kodu',
    intro: 'Şifreni sıfırlamak için aşağıdaki kodu uygulamaya gir:',
    outro: 'Bu kod 15 dakika geçerlidir. Bu isteği sen yapmadıysan bu e-postayı görmezden gelebilirsin.'
  });
}

function sendVerificationEmail(to, code) {
  return sendCodeEmail(to, code, {
    subject: 'E-posta Doğrulama Kodu',
    intro: 'Kayıt işlemini tamamlamak için aşağıdaki kodu uygulamaya gir:',
    outro: 'Bu kod 15 dakika geçerlidir. Kayıt olan sen değilsen bu e-postayı görmezden gelebilirsin.'
  });
}

module.exports = { sendResetCodeEmail, sendVerificationEmail };
