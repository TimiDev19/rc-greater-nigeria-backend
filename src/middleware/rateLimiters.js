const rateLimit = require('express-rate-limit');

const make = (max, message) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message },
  });

// Public write endpoints (no login required), so they need throttling against spam.
module.exports = {
  commentLimiter: make(10, 'Too many comments from this network. Please try again later.'),
  reactionLimiter: make(60, 'Too many reactions from this network. Please try again later.'),
};
