const mongoose = require('mongoose');

const unitSchema = new mongoose.Schema({
  name: { type: String, required: true }, // örn: "Temizlik İşleri", "Teknik Servis", "Güvenlik"
  category: {
    type: String,
    enum: ['temizlik', 'teknik', 'guvenlik', 'diger'],
    required: true,
    unique: true
  },
  contactEmail: { type: String },
  contactPhone: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Unit', unitSchema);
