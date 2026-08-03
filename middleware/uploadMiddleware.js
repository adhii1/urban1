const multer = require('multer');
const path = require('path');
const config = require('../config/config');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.uploads.path),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  if (extname && mimetype) cb(null, true);
  else cb(new Error('Only images and PDFs are allowed.'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.uploads.maxSize },
});

module.exports = upload;
