const multer = require('multer');
const ApiError = require('../utils/ApiError');

const ALLOWED_MIME = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  pdf: ['application/pdf'],
};
const LABEL = { image: 'a JPEG, PNG or WebP image', pdf: 'a PDF' };

/**
 * Builds multipart parsing middleware for a resource's file fields.
 * Files are kept in memory, then validated and pushed to Supabase Storage by the controller.
 * (Deeper checks on file contents and per-type size limits happen in services/storage.js.)
 */
module.exports = (fileConfigs) => {
  const kinds = Object.fromEntries(fileConfigs.map((f) => [f.name, f.kind]));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024, files: fileConfigs.length, fields: 20 },
    fileFilter: (req, file, cb) => {
      const kind = kinds[file.fieldname];
      if (!kind) return cb(new ApiError(400, `Unexpected file field "${file.fieldname}"`));
      if (!ALLOWED_MIME[kind].includes(file.mimetype)) {
        return cb(new ApiError(400, `"${file.fieldname}" must be ${LABEL[kind]}`));
      }
      return cb(null, true);
    },
  });

  return upload.fields(fileConfigs.map((f) => ({ name: f.name, maxCount: 1 })));
};
