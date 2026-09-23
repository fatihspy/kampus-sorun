const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

// Dosyalar artık Render'ın diskine değil, doğrudan Cloudinary'ye yükleniyor.
// Böylece sunucu her yeniden başladığında (her deploy'da olduğu gibi) fotoğraflar kaybolmuyor.
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'kampus-sorun',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1600, height: 1600, crop: 'limit' }] // aşırı büyük dosyaları küçült
  }
});

function fileFilter(req, file, cb) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Sadece jpeg, png veya webp formatında fotoğraf yükleyebilirsiniz.'));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024 } // 8MB
});

module.exports = upload;
