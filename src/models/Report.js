const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  photoUrl: { type: String, required: true },
  description: { type: String, maxlength: 500 },
  category: {
    type: String,
    enum: ['temizlik', 'teknik', 'guvenlik', 'diger'],
    required: true
  },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true } // [lng, lat]
  },
  building: { type: String }, // haritadan seçilen bina/nokta adı
  assignedUnit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
  status: {
    type: String,
    enum: ['yeni', 'inceleniyor', 'cozuldu'],
    default: 'yeni'
  }
}, { timestamps: true });

reportSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Report', reportSchema);
