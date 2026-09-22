const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    validate: {
      validator: function (v) {
        return /^[^\s@]+@(ogr\.ege\.edu\.tr|ege\.edu\.tr)$/.test(v);
      },
      message: 'Sadece @ogr.ege.edu.tr veya @ege.edu.tr uzantılı e-posta adresleriyle kayıt olabilirsiniz.'
    }
  },
  password: { type: String, required: true, minlength: 6 },
  role: {
    type: String,
    enum: ['ogrenci', 'personel', 'yonetici'],
    default: 'ogrenci'
  }
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
