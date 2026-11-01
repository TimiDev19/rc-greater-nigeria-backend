const { supabaseAdmin } = require('../config/supabase');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// Verifies the Bearer token with Supabase and attaches the user to the request.
const requireAuth = asyncHandler(async (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new ApiError(401, 'Missing or malformed Authorization header. Use: Bearer <token>');
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    throw new ApiError(401, 'Invalid or expired token');
  }

  req.user = data.user;
  req.token = token;
  next();
});

// Must run after requireAuth. The role lives in app_metadata, which users cannot edit themselves.
const requireAdmin = (req, res, next) => {
  if (req.user?.app_metadata?.role !== 'admin') {
    return next(new ApiError(403, 'Admin access required'));
  }
  next();
};

const requireMember = (req, res, next) => {
  if (!['admin', 'member'].includes(req.user?.app_metadata?.role)) {
    return next(new ApiError(403, 'Clubhouse access required'));
  }
  next();
};

module.exports = { requireAuth, requireAdmin, requireMember };
