const env = require('../config/env');

const notFound = (req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
};

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: 'File too large (max 20MB)',
  LIMIT_FILE_COUNT: 'Too many files uploaded',
  LIMIT_FIELD_COUNT: 'Too many form fields',
  LIMIT_UNEXPECTED_FILE: 'Unexpected file field',
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let status = err.status || err.statusCode || 500;
  let message = err.message;

  if (err.name === 'MulterError') {
    status = 400;
    message = MULTER_MESSAGES[err.code] ? `${MULTER_MESSAGES[err.code]}${err.field ? `: "${err.field}"` : ''}` : err.message;
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Request body is not valid JSON';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request body too large';
  }

  if (status >= 500) {
    console.error(err);
    if (env.nodeEnv === 'production') message = 'Internal server error';
  }

  const body = { success: false, message };
  if (err.errors) body.errors = err.errors;
  res.status(status).json(body);
};

module.exports = { notFound, errorHandler };
