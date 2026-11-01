const { createClient } = require('@supabase/supabase-js');
const env = require('./env');

const options = {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
};

// Privileged client (service role). Bypasses RLS, so use it only on the server.
const supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, options);

// Fresh anon client per call, so one user's session never leaks into another request.
const createAuthClient = () => createClient(env.supabaseUrl, env.supabaseAnonKey, options);

module.exports = { supabaseAdmin, createAuthClient };
