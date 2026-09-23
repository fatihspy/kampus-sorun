// Brevo'nun HTTPS API'si üzerinden gönderim yapar (SMTP değil — Render'ın
// ücretsiz katmanı SMTP portlarını engellediği için bu yol kullanılıyor).
// .env dosyasında BREVO_API_KEY ve EMAIL_USER (Brevo'da doğrulanmış gönderen) tanımlı olmalı.

async function sendResetCodeEmail(to, code) {
  console.log(`[mailer] ${to} adresine kod gönderiliyor...`);

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': process.env.BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: { email: process.env.EMAIL_USER, name: 'Kampüs Sorun Bildirim' },
      to: [{ email: to }],
      subject: 'Şifre Sıfırlama Kodu',
      htmlContent: `
        <div style="font-family: sans-serif; max-width: 420px; margin: 0 auto;">
          <h2 style="color: #1e3a8a;">Kampüs Sorun Bildirim</h2>
          <p>Şifreni sıfırlamak için aşağıdaki kodu uygulamaya gir:</p>
          <div style="background: #eef2ff; color: #1e3a8a; font-size: 28px; font-weight: bold; letter-spacing: 6px; text-align: center; padding: 16px; border-radius: 10px; margin: 16px 0;">
            ${code}
          </div>
          <p style="color: #888; font-size: 13px;">Bu kod 15 dakika geçerlidir. Bu isteği sen yapmadıysan bu e-postayı görmezden gelebilirsin.</p>
        </div>
      `
    })
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const message = errData.message || `Brevo API hatası (${res.status})`;
    console.error(`[mailer] ${to} adresine gönderim BAŞARISIZ:`, message);
    throw new Error(message);
  }

  console.log(`[mailer] ${to} adresine gönderim başarılı.`);
}

module.exports = { sendResetCodeEmail };
