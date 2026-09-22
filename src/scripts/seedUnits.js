require('dotenv').config();
const mongoose = require('mongoose');
const Unit = require('../models/Unit');

const units = [
  { name: 'Temizlik İşleri', category: 'temizlik' },
  { name: 'Teknik Servis', category: 'teknik' },
  { name: 'Güvenlik', category: 'guvenlik' },
  { name: 'Genel İşler', category: 'diger' }
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB bağlantısı başarılı.');

    for (const unit of units) {
      await Unit.findOneAndUpdate(
        { category: unit.category },
        unit,
        { upsert: true, new: true }
      );
      console.log(`Birim eklendi/güncellendi: ${unit.name}`);
    }

    console.log('Seed işlemi tamamlandı.');
  } catch (err) {
    console.error('Seed hatası:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

seed();
