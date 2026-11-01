const crypto = require('crypto');
const { supabaseAdmin } = require('../config/supabase');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const MB = 1024 * 1024;

// Files are identified by their real contents (magic bytes), not by the filename or the
// browser-supplied Content-Type, so a renamed .exe can't be uploaded as an image.
const KINDS = {
  image: {
    maxBytes: 5 * MB,
    maxLabel: '5MB',
    description: 'a JPEG, PNG or WebP image',
    types: [
      { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
      {
        mime: 'image/png',
        ext: 'png',
        test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
      },
      {
        mime: 'image/webp',
        ext: 'webp',
        test: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
      },
    ],
  },
  pdf: {
    maxBytes: 20 * MB,
    maxLabel: '20MB',
    description: 'a PDF document',
    types: [{ mime: 'application/pdf', ext: 'pdf', test: (b) => b.toString('ascii', 0, 4) === '%PDF' }],
  },
};

// Throws Error(message) if the file is too big or not really the claimed kind. Returns the detected type.
const validateFile = (file, kind) => {
  const spec = KINDS[kind];
  if (!file || !file.buffer || file.buffer.length < 12) throw new Error('file is empty or corrupted');
  if (file.size > spec.maxBytes) throw new Error(`file must be ${spec.maxLabel} or smaller`);
  const type = spec.types.find((t) => t.test(file.buffer));
  if (!type) throw new Error(`must be ${spec.description}`);
  return type;
};

const uploadFile = async (file, kind, folder) => {
  const type = validateFile(file, kind);
  const path = `${folder}/${crypto.randomUUID()}.${type.ext}`;

  const { error } = await supabaseAdmin.storage.from(env.storageBucket).upload(path, file.buffer, {
    contentType: type.mime,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) {
    console.error('[storage] upload failed:', error);
    throw new ApiError(500, `File upload failed: ${error.message}`);
  }

  const { data } = supabaseAdmin.storage.from(env.storageBucket).getPublicUrl(path);
  return { path, url: data.publicUrl };
};

// Best-effort cleanup: never throws, so a storage hiccup can't break a request that already succeeded.
const removeFiles = async (paths) => {
  const list = (paths || []).filter(Boolean);
  if (!list.length) return;
  try {
    const { error } = await supabaseAdmin.storage.from(env.storageBucket).remove(list);
    if (error) console.error('[storage] cleanup failed:', error);
  } catch (err) {
    console.error('[storage] cleanup failed:', err);
  }
};

module.exports = { validateFile, uploadFile, removeFiles, KINDS };
