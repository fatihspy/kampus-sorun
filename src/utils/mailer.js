// Brevo'nun HTTPS API'si üzerinden gönderim yapar (SMTP değil — Render'ın
// ücretsiz katmanı SMTP portlarını engellediği için bu yol kullanılıyor).
// .env dosyasında BREVO_API_KEY ve EMAIL_USER (Brevo'da doğrulanmış gönderen) tanımlı olmalı.

async function sendCodeEmail(to, code, { subject, intro, outro }) {
  console.log(`[mailer] ${to} adresine kod gönderiliyor (${subject})...`);

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
      htmlContent: `
        <div style="font-family: sans-serif; max-width: 420px; margin: 0 auto;">
          <h2 style="color: #1e3a8a;">Kampüs Sorun Bildirim</h2>
          <p>${intro}</p>
          <div style="background: #eef2ff; color: #1e3a8a; font-size: 28px; font-weight: bold; letter-spacing: 6px; text-align: center; padding: 16px; border-radius: 10px; margin: 16px 0;">
            ${code}
          </div>
          <p style="color: #888; font-size: 13px;">${outro}</p>
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
