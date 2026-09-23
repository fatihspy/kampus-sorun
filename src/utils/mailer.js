const nodemailer = require('nodemailer');

// Gmail SMTP üzerinden gönderim yapar. .env dosyasında EMAIL_USER ve
// EMAIL_PASS (Gmail Uygulama Şifresi) tanımlı olmalı.
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendResetCodeEmail(to, code) {
  await transporter.sendMail({
    from: `"Kampüs Sorun Bildirim" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Şifre Sıfırlama Kodu',
    html: `
      <div style="font-family: sans-serif; max-width: 420px; margin: 0 auto;">
        <h2 style="color: #1e3a8a;">Kampüs Sorun Bildirim</h2>
        <p>Şifreni sıfırlamak için aşağıdaki kodu uygulamaya gir:</p>
        <div style="background: #eef2ff; color: #1e3a8a; font-size: 28px; font-weight: bold; letter-spacing: 6px; text-align: center; padding: 16px; border-radius: 10px; margin: 16px 0;">
          ${code}
        </div>
        <p style="color: #888; font-size: 13px;">Bu kod 15 dakika geçerlidir. Bu isteği sen yapmadıysan bu e-postayı görmezden gelebilirsin.</p>
      </div>
    `
  });
}

module.exports = { sendResetCodeEmail };
