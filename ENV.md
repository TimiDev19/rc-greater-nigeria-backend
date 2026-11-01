# Environment setup

The server reads configuration from a file named `.env` in the project root. Start with the template:

```bash
cp .env.example .env
```

Then replace the Supabase placeholders and any settings you want to change. Do not commit `.env`; it contains a privileged key. The repository's `.gitignore` excludes it.

## Find the Supabase values

1. Sign in to [Supabase](https://supabase.com/dashboard) and open the project used by this API.
2. In the project dashboard, open **Project Settings → API** (in some dashboard versions this is labeled **API Keys**).
3. Copy the **Project URL** into `SUPABASE_URL`.
4. Copy the **anon/public** key into `SUPABASE_ANON_KEY`. It is intended for client-side use, though this API uses it only to verify user password changes and sign in.
5. Copy the **service_role/secret** key into `SUPABASE_SERVICE_ROLE_KEY`. This key bypasses Row Level Security, so keep it on the server, never put it in frontend settings, and never share it publicly.

The project URL looks like `https://<project-ref>.supabase.co`. Keys are long strings; paste each value without adding quotes.

## Other variables

| Variable | What to enter |
|---|---|
| `PORT` | Local server port; `3000` is the default. |
| `NODE_ENV` | Use `development` locally and `production` when deployed. |
| `CORS_ORIGINS` | Comma-separated frontend origins, such as `https://eclub.org,https://admin.eclub.org`. Use `*` only when you intentionally allow any origin. |
| `API_BASE_URL` | Public API URL shown in Swagger. Locally, use `http://localhost:3000`. Render sets `RENDER_EXTERNAL_URL` automatically if this is omitted. |
| `SUPABASE_STORAGE_BUCKET` | Storage bucket name. Keep `media` unless you create and configure a different bucket. |
| `ADMIN_EMAIL` | Email for the initial admin account, used only by `npm run seed:admin`. |
| `ADMIN_PASSWORD` | Strong initial admin password, used only by `npm run seed:admin`. Change it after setup and remove it from the environment. |

The first three Supabase variables are required by the application. The remaining variables are optional and have defaults.

## Deploying

For Render, add the variables in the service's **Environment** settings instead of uploading a `.env` file. Add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`; add other variables only when you need to override their defaults. Do not add `ADMIN_PASSWORD` to a deployed service after the initial admin has been created.

After configuring the values, install dependencies and start locally with:

```bash
npm install
npm run dev
```

See [README.md](README.md) for database setup and the admin seeding command.
