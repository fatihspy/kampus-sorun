const multer = require('multer');
const cloudinary = require('../config/cloudinary');

// multer için basit, elle yazılmış bir Cloudinary depolama motoru.
// Üçüncü parti "multer-storage-cloudinary" paketine gerek bırakmaz,
// böylece cloudinary'nin güncel (v2) sürümüyle versiyon çakışması olmaz.
class CloudinaryStorage {
  _handleFile(req, file, cb) {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'kampus-sorun',
        resource_type: 'image',
        transformation: [{ width: 1600, height: 1600, crop: 'limit' }]
      },
      (error, result) => {
        if (error) return cb(error);
        cb(null, {
          path: result.secure_url, // tam https:// adresi
          filename: result.public_id,
          size: result.bytes
        });
      }
    );
    file.stream.pipe(uploadStream);
  }

  _removeFile(req, file, cb) {
    cb(null);
  }
}

function fileFilter(req, file, cb) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Sadece jpeg, png veya webp formatında fotoğraf yükleyebilirsiniz.'));
  }
}

const upload = multer({
  storage: new CloudinaryStorage(),
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024 } // 8MB
});

module.exports = upload;
