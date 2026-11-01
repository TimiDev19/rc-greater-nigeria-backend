/**
 * Creates (or updates) the admin user in Supabase Auth.
 * Credentials come from ADMIN_EMAIL / ADMIN_PASSWORD in your .env, never hardcoded.
 * Safe to re-run: if the user exists, their password and admin role are reset.
 *
 * Usage: npm run seed:admin
 */
const { supabaseAdmin } = require('../src/config/supabase');

const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';

async function findUserByEmail(targetEmail) {
  let page = 1;
  for (;;) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === targetEmail);
    if (match) return match;
    if (data.users.length < 1000) return null;
    page += 1;
  }
}

(async () => {
  if (!email || !password) {
    console.error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env');
    process.exit(1);
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'admin' },
  });

  if (!error) {
    console.log(`Admin created: ${data.user.email} (id: ${data.user.id})`);
    return;
  }

  const alreadyExists = error.code === 'email_exists' || /already|registered/i.test(error.message);
  if (!alreadyExists) throw error;

  const existing = await findUserByEmail(email);
  if (!existing) throw new Error('User exists but could not be found via listUsers');

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
    app_metadata: { ...existing.app_metadata, role: 'admin' },
  });
  if (updateError) throw updateError;

  console.log(`Admin already existed. Password and admin role reset for ${email}`);
})().catch((err) => {
  console.error('Seeding failed:', err.message || err);
  process.exit(1);
});
