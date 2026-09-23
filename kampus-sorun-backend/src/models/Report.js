const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, maxlength: 300 }
}, { timestamps: true });

const reportSchema = new mongoose.Schema({
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isAnonymous: { type: Boolean, default: false },
  photoUrl: { type: String, required: true },
  resolvedPhotoUrl: { type: String }, // sorun çözülünce eklenen "sonrası" fotoğrafı
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
  },
  resolvedAt: { type: Date },
  upvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments: [commentSchema]
}, { timestamps: true });

reportSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Report', reportSchema);

