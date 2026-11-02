const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const { sendResetCodeEmail, sendVerificationEmail } = require('../utils/mailer');
const router = express.Router();

const VERIFY_TTL_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

const normalizeEmail = (v) => String(v || '').trim().toLowerCase();

function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email, role: user.role };
}

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// Yeni bir doğrulama kodu üretip kullanıcı belgesine yazar (kaydetmez), düz kodu döndürür
async function prepareVerificationCode(user) {
  const code = String(crypto.randomInt(100000, 1000000));
  user.verifyCodeHash = await bcrypt.hash(code, 10);
  user.verifyCodeExpires = new Date(Date.now() + VERIFY_TTL_MS);
  user.verifyCodeSentAt = new Date();
  user.verifyAttempts = 0;
  return code;
}

// Kayıt: hesabı "doğrulanmamış" olarak oluşturur ve e-postaya kod yollar. Token burada VERİLMEZ.
router.post('/register', async (req, res) => {
  try {
    const { name, password } = req.body;
    const email = normalizeEmail(req.body.email);
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Ad, e-posta ve şifre zorunludur.' });
    }
    const role = email.endsWith('@ege.edu.tr') ? 'personel' : 'ogrenci';

    let user = await User.findOne({ email });
    if (user && user.emailVerified !== false) {
      return res.status(400).json({ error: 'Bu e-posta adresiyle zaten bir hesap var. Giriş yapmayı dene.' });
    }

    const isNew = !user;
    if (user) {
      // Daha önce kayıt olup kodu girmemiş: bilgileri güncelle, yeni kod gönder
      user.name = name;
      user.password = password;
      user.role = role;
    } else {
      user = new User({ name, email, password, role, emailVerified: false });
    }

    const code = await prepareVerificationCode(user);
    await user.save(); // doğrulama hataları (alan adı, şifre uzunluğu vb.) burada fırlar

    try {
      await sendVerificationEmail(user.email, code);
    } catch (mailErr) {
      // Kod gidemediyse hesap boşa kilitli kalmasın
      if (isNew) await User.deleteOne({ _id: user._id });
      return res.status(502).json({ error: 'Doğrulama kodu e-postana gönderilemedi. Birazdan tekrar dene.' });
    }

    res.status(201).json({
      message: 'E-postana 6 haneli bir doğrulama kodu gönderdik.',
      email: user.email,
      requiresVerification: true
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Bu e-posta adresiyle zaten bir hesap var. Giriş yapmayı dene.' });
    }
    res.status(400).json({ error: err.message });
  }
});

// Kodu doğrular, hesabı aktifleştirir ve giriş yaptırır
router.post('/verify-email', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const code = String(req.body.code || '').trim();
    if (!email || !code) {
      return res.status(400).json({ error: 'E-posta ve kod zorunludur.' });
    }

    const user = await User.findOne({ email }).select('+verifyCodeHash +verifyCodeExpires');
    if (!user) return res.status(400).json({ error: 'Geçersiz veya süresi dolmuş kod.' });
    if (user.emailVerified !== false) {
      return res.status(400).json({ error: 'Bu hesap zaten doğrulanmış. Giriş yapabilirsin.' });
    }
    if (!user.verifyCodeHash || !user.verifyCodeExpires || user.verifyCodeExpires < new Date()) {
      return res.status(400).json({ error: 'Kodun süresi dolmuş, yeni kod iste.' });
    }
    if ((user.verifyAttempts || 0) >= MAX_VERIFY_ATTEMPTS) {
      return res.status(400).json({ error: 'Çok fazla hatalı deneme. Yeni kod iste.' });
    }

    const isValid = await bcrypt.compare(code, user.verifyCodeHash);
    if (!isValid) {
      await User.updateOne({ _id: user._id }, { $inc: { verifyAttempts: 1 } });
      return res.status(400).json({ error: 'Kod hatalı.' });
    }

    user.emailVerified = true;
    user.verifyCodeHash = undefined;
    user.verifyCodeExpires = undefined;
    user.verifyAttempts = 0;
    await user.save();

    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Doğrulama kodunu yeniden gönder (en fazla dakikada bir)
router.post('/resend-verification', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const generic = { message: 'Bu e-posta doğrulama bekliyorsa yeni bir kod gönderildi.' };

    const user = await User.findOne({ email });
    if (!user || user.emailVerified !== false) return res.json(generic);

    if (user.verifyCodeSentAt && Date.now() - user.verifyCodeSentAt.getTime() < RESEND_COOLDOWN_MS) {
      return res.status(429).json({ error: 'Yeni kod için 1 dakika beklemen gerekiyor.' });
    }

    const code = await prepareVerificationCode(user);
    await user.save();
    await sendVerificationEmail(user.email, code);

    res.json(generic);
  } catch (err) {
    res.status(500).json({ error: 'Kod gönderilemedi: ' + err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'E-posta veya şifre hatalı.' });
    }
    if (user.emailVerified === false) {
      return res.status(403).json({
        error: 'E-postanı henüz doğrulamadın. Sana doğrulama kodu gönderiyoruz.',
        needsVerification: true,
        email: user.email
      });
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Adım 1: e-postaya 6 haneli sıfırlama kodu gönder
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    console.log(`[forgot-password] istek alındı: ${email}`);
    const user = await User.findOne({ email });

    // Kayıtlı olmayan e-postalarda da aynı mesajı dön (hesap taramasını önler)
    if (!user) {
      return res.json({ message: 'Bu e-posta kayıtlıysa, sıfırlama kodu gönderildi.' });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 haneli
    user.resetCodeHash = await bcrypt.hash(code, 10);
    user.resetCodeExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 dakika
    await user.save();

    await sendResetCodeEmail(user.email, code);

    res.json({ message: 'Bu e-posta kayıtlıysa, sıfırlama kodu gönderildi.' });
  } catch (err) {
    console.error('[forgot-password] hata:', err.message);
    res.status(500).json({ error: 'Kod gönderilemedi: ' + err.message });
  }
});

// Adım 2: kodu doğrula ve yeni şifreyi kaydet
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'E-posta, kod ve yeni şifre zorunludur.' });
    }

    const user = await User.findOne({ email }).select('+resetCodeHash +resetCodeExpires');
    if (!user || !user.resetCodeHash || !user.resetCodeExpires) {
      return res.status(400).json({ error: 'Geçersiz veya süresi dolmuş kod.' });
    }
    if (user.resetCodeExpires < new Date()) {
      return res.status(400).json({ error: 'Kodun süresi dolmuş, yeniden kod iste.' });
    }

    const isValid = await bcrypt.compare(code, user.resetCodeHash);
    if (!isValid) {
      return res.status(400).json({ error: 'Kod hatalı.' });
    }

    user.password = newPassword; // pre('save') hook otomatik hashler
    user.resetCodeHash = undefined;
    user.resetCodeExpires = undefined;
    await user.save();

    res.json({ message: 'Şifren başarıyla güncellendi. Şimdi giriş yapabilirsin.' });
  } catch (err) {
    res.status(500).json({ error: 'Şifre sıfırlanamadı: ' + err.message });
  }
});

module.exports = router;
