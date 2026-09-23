const express = require('express');
const Report = require('../models/Report');
const Unit = require('../models/Unit');
const upload = require('../middleware/upload');
const { auth, requireRole } = require('../middleware/auth');
const router = express.Router();

// Anonim raporlarda gönderen bilgisini gizleyen yardımcı
function maskAnonymous(report, viewerId, viewerRole) {
  const obj = report.toObject ? report.toObject() : report;
  const isOwner = obj.reporter?._id?.toString() === viewerId || obj.reporter?.toString() === viewerId;
  const isStaff = viewerRole === 'personel' || viewerRole === 'yonetici';

  if (obj.isAnonymous && !isOwner && !isStaff) {
    obj.reporter = null;
  }
  return obj;
}

// Yeni rapor oluştur (fotoğraf + konum + kategori)
router.post('/', auth, upload.single('photo'), async (req, res) => {
  try {
    const { description, category, lat, lng, building, isAnonymous } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Fotoğraf zorunludur.' });
    }
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Konum bilgisi (lat, lng) zorunludur.' });
    }

    const unit = await Unit.findOne({ category });

    const report = await Report.create({
      reporter: req.user.id,
      isAnonymous: isAnonymous === 'true' || isAnonymous === true,
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

// Kampüs akışı: herkesin gördüğü, oy verilebilen ortak rapor listesi
router.get('/feed', auth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.category) filter.category = req.query.category;

    const sort = req.query.sort === 'popular' ? { upvoteCount: -1, createdAt: -1 } : { createdAt: -1 };

    let reports = await Report.find(filter)
      .populate('reporter', 'name email')
      .populate('assignedUnit', 'name category')
      .populate('comments.author', 'name role')
      .lean();

    reports = reports.map((r) => {
      const masked = maskAnonymous(r, req.user.id, req.user.role);
      masked.upvoteCount = r.upvotes.length;
      masked.hasUpvoted = r.upvotes.some((u) => u.toString() === req.user.id);
      return masked;
    });

    if (req.query.sort === 'popular') {
      reports.sort((a, b) => b.upvoteCount - a.upvoteCount);
    } else {
      reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    res.json(reports);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Yönetim istatistikleri (sadece personel/yönetici)
router.get('/stats', auth, requireRole('personel', 'yonetici'), async (req, res) => {
  try {
    const byCategory = await Report.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);
    const byStatus = await Report.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const byBuilding = await Report.aggregate([
      { $match: { building: { $nin: [null, ''] } } },
      { $group: { _id: '$building', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    const resolvedReports = await Report.find({ status: 'cozuldu', resolvedAt: { $ne: null } });
    let avgResolutionHours = null;
    if (resolvedReports.length > 0) {
      const totalHours = resolvedReports.reduce((sum, r) => {
        return sum + (new Date(r.resolvedAt) - new Date(r.createdAt)) / (1000 * 60 * 60);
      }, 0);
      avgResolutionHours = Math.round((totalHours / resolvedReports.length) * 10) / 10;
    }

    const total = await Report.countDocuments();

    res.json({ total, byCategory, byStatus, byBuilding, avgResolutionHours });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Tek rapor detayı
router.get('/:id', auth, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate('reporter', 'name email')
      .populate('assignedUnit', 'name category')
      .populate('comments.author', 'name role');

    if (!report) return res.status(404).json({ error: 'Rapor bulunamadı.' });

    const isOwner = report.reporter._id.toString() === req.user.id;
    const isStaff = req.user.role === 'personel' || req.user.role === 'yonetici';

    if (!isOwner && !isStaff) {
      // Kampüs akışından erişim: herkes görebilir ama anonimse gönderen gizlenir
      const masked = maskAnonymous(report, req.user.id, req.user.role);
      masked.upvoteCount = report.upvotes.length;
      masked.hasUpvoted = report.upvotes.some((u) => u.toString() === req.user.id);
      return res.json(masked);
    }

    const obj = report.toObject();
    obj.upvoteCount = report.upvotes.length;
    obj.hasUpvoted = report.upvotes.some((u) => u.toString() === req.user.id);
    res.json(obj);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Rapor durumunu güncelle (sadece personel/yönetici)
router.patch('/:id/status', auth, requireRole('personel', 'yonetici'), async (req, res) => {
  try {
    const { status } = req.body;
    const update = { status };
    if (status === 'cozuldu') update.resolvedAt = new Date();

    const report = await Report.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true
    });
    if (!report) return res.status(404).json({ error: 'Rapor bulunamadı.' });
    res.json(report);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Çözüldü fotoğrafı ekle (sadece personel/yönetici) — durumu da otomatik "çözüldü" yapar
router.post('/:id/resolve-photo', auth, requireRole('personel', 'yonetici'), upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fotoğraf zorunludur.' });

    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { resolvedPhotoUrl: `/uploads/${req.file.filename}`, status: 'cozuldu', resolvedAt: new Date() },
      { new: true, runValidators: true }
    );
    if (!report) return res.status(404).json({ error: 'Rapor bulunamadı.' });
    res.json(report);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Oy ver / oyu geri çek (toggle)
router.post('/:id/upvote', auth, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: 'Rapor bulunamadı.' });

    const alreadyVoted = report.upvotes.some((u) => u.toString() === req.user.id);
    if (alreadyVoted) {
      report.upvotes = report.upvotes.filter((u) => u.toString() !== req.user.id);
    } else {
      report.upvotes.push(req.user.id);
    }
    await report.save();

    res.json({ upvoteCount: report.upvotes.length, hasUpvoted: !alreadyVoted });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Yorum ekle
router.post('/:id/comments', auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Yorum boş olamaz.' });

    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: 'Rapor bulunamadı.' });

    report.comments.push({ author: req.user.id, text: text.trim() });
    await report.save();
    await report.populate('comments.author', 'name role');

    res.status(201).json(report.comments[report.comments.length - 1]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
