const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { sendResetCodeEmail } = require('../utils/mailer');
const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const role = email.endsWith('@ege.edu.tr') ? 'personel' : 'ogrenci';

    const user = await User.create({ name, email, password, role });
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Bu e-posta adresiyle zaten bir hesap var. Giriş yapmayı dene.' });
    }
    res.status(400).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'E-posta veya şifre hatalı.' });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
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
