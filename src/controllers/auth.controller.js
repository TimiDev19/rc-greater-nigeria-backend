const { supabaseAdmin, createAuthClient } = require('../config/supabase');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const isString = (v) => typeof v === 'string' && v.trim().length > 0;

const formatUser = (user) => ({
  id: user.id,
  email: user.email,
  role: user.app_metadata?.role || null,
});

const formatSession = (session, user) => ({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  token_type: session.token_type,
  expires_in: session.expires_in,
  expires_at: session.expires_at,
  user: formatUser(user),
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!isString(email) || !isString(password)) {
    throw new ApiError(400, 'email and password are required');
  }

  const { data, error } = await createAuthClient().auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  // Same message for wrong email or wrong password, so attackers can't probe for valid emails.
  if (error || !data?.session) throw new ApiError(401, 'Invalid email or password');

  if (!['admin', 'member'].includes(data.user.app_metadata?.role)) {
    throw new ApiError(403, 'This account does not have clubhouse access');
  }

  res.json({ success: true, data: formatSession(data.session, data.user) });
});

exports.refresh = asyncHandler(async (req, res) => {
  const { refresh_token } = req.body || {};
  if (!isString(refresh_token)) throw new ApiError(400, 'refresh_token is required');

  const { data, error } = await createAuthClient().auth.refreshSession({ refresh_token });
  if (error || !data?.session) throw new ApiError(401, 'Invalid or expired refresh token');

  res.json({ success: true, data: formatSession(data.session, data.user) });
});

exports.logout = asyncHandler(async (req, res) => {
  const { error } = await supabaseAdmin.auth.admin.signOut(req.token);
  if (error) throw new ApiError(400, error.message);

  res.json({ success: true, message: 'Logged out successfully' });
});

exports.me = (req, res) => {
  res.json({ success: true, data: formatUser(req.user) });
};

exports.changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!isString(current_password) || !isString(new_password)) {
    throw new ApiError(400, 'current_password and new_password are required');
  }
  if (new_password.length < 8) {
    throw new ApiError(400, 'new_password must be at least 8 characters');
  }
  if (new_password === current_password) {
    throw new ApiError(400, 'new_password must differ from current_password');
  }

  // Confirm the current password before allowing a change.
  const { error: verifyError } = await createAuthClient().auth.signInWithPassword({
    email: req.user.email,
    password: current_password,
  });
  if (verifyError) throw new ApiError(401, 'Current password is incorrect');

  const { error } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, {
    password: new_password,
  });
  if (error) throw new ApiError(400, error.message);

  res.json({ success: true, message: 'Password updated successfully' });
});
