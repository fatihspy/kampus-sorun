const express = require('express');
const Report = require('../models/Report');
const Unit = require('../models/Unit');
const upload = require('../middleware/upload');
const { auth, requireRole } = require('../middleware/auth');
const router = express.Router();

// Yeni rapor oluştur (fotoğraf + konum + kategori)
router.post('/', auth, upload.single('photo'), async (req, res) => {
  try {
    const { description, category, lat, lng, building } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Fotoğraf zorunludur.' });
    }
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Konum bilgisi (lat, lng) zorunludur.' });
    }

    const unit = await Unit.findOne({ category });

    const report = await Report.create({
      reporter: req.user.id,
      photoUrl: `/uploads/${req.file.filename}`,
      description,
      category,
      location: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
      building,
      assignedUnit: unit ? unit._id : undefined
    });

    res.status(201).json(report);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Raporları listele (yönetici/personel hepsini görür, öğrenci sadece kendininkini)
router.get('/', auth, async (req, res) => {
  try {
    const filter = req.user.role === 'ogrenci' ? { reporter: req.user.id } : {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.category) filter.category = req.query.category;

    const reports = await Report.find(filter)
      .populate('reporter', 'name email')
      .populate('assignedUnit', 'name category')
      .sort({ createdAt: -1 });

    res.json(reports);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Tek rapor detayı
router.get('/:id', auth, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate('reporter', 'name email')
      .populate('assignedUnit', 'name category');

    if (!report) return res.status(404).json({ error: 'Rapor bulunamadı.' });

    if (req.user.role === 'ogrenci' && report.reporter._id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Bu rapora erişim yetkiniz yok.' });
    }

    res.json(report);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Rapor durumunu güncelle (sadece personel/yönetici)
router.patch('/:id/status', auth, requireRole('personel', 'yonetici'), async (req, res) => {
  try {
    const { status } = req.body;
    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );
    if (!report) return res.status(404).json({ error: 'Rapor bulunamadı.' });
    res.json(report);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
