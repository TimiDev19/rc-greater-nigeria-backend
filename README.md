# E-Club of Greater Nigeria API

REST API built with **Node.js, Express and Supabase**, documented with **Swagger UI**, ready to deploy on **Render**.

| | |
|---|---|
| Interactive docs | `GET /api-docs` |
| Raw OpenAPI spec | `GET /api-docs.json` (import into Postman / Insomnia, or generate a typed client) |
| Health check | `GET /health` |

**Who can do what**

- **Everyone (public site):** read projects, bulletins, club officers and past presidents; read and post comments; react.
- **Admin only (admin panel):** create, update and delete projects, bulletins, club officers, past presidents; delete comments.

---

## Contents

1. [Setup](#1-setup)
2. [Conventions every endpoint follows](#2-conventions)
3. [Endpoint reference](#3-endpoint-reference)
4. [Frontend integration guide](#4-frontend-integration-guide)
5. [Deploy to Render](#5-deploy-to-render)
6. [Adding a new resource](#6-adding-a-new-resource)
7. [Project structure](#7-project-structure)
8. [Security notes and design decisions](#8-security-notes-and-design-decisions)

---

## 1. Setup

### 1.1 Install

```bash
npm install
cp .env.example .env        # then fill in the values (see 1.4)
```

### 1.2 Create the database tables and storage bucket (once)

1. Open your Supabase project, then **SQL Editor > New query**.
2. Paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.

This creates the tables (`projects`, `bulletins`, `club_officers`, `past_presidents`, `comments`, `reactions`, and clubhouse articles/comments/reactions),
turns on Row Level Security (so the public anon key cannot touch the data directly, only this API can),
and creates a public storage bucket called `media` for pictures and PDFs.
It's safe to run again.

### 1.3 Create the admin account and start

```bash
npm run seed:admin          # creates the admin in Supabase Auth (uses ADMIN_EMAIL / ADMIN_PASSWORD from .env)
npm run dev                 # http://localhost:3000/api-docs
```

### 1.4 Environment variables

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | yes | Supabase > Project Settings > API > Project URL |
| `SUPABASE_ANON_KEY` | yes | Same page, `anon public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Same page, `service_role` key. **Secret. Server only.** |
| `SUPABASE_STORAGE_BUCKET` | no | Defaults to `media` |
| `CORS_ORIGINS` | no | Comma-separated allowed frontend origins, e.g. `https://eclub.org,https://admin.eclub.org`. Defaults to `*` |
| `API_BASE_URL` | no | Public URL shown in Swagger. On Render it is detected automatically |
| `PORT` | no | Defaults to `3000` (Render sets it) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | seed only | Used by `npm run seed:admin`. Don't set on Render |

> Change the admin password after first login (`POST /api/auth/change-password`), then delete `ADMIN_PASSWORD` from `.env`.

---

## 2. Conventions

### Base URL
Local: `http://localhost:3000` &nbsp;|&nbsp; Render: `https://<your-service>.onrender.com`

### Response envelope
Every response is JSON.

```jsonc
// success
{ "success": true, "data": { ... } }
// success, list
{ "success": true, "data": [ ... ], "meta": { "page": 1, "limit": 10, "total": 42, "total_pages": 5 } }
// failure
{ "success": false, "message": "Validation failed", "errors": { "title": "is required" } }
```
`errors` (per-field messages) only appears on `400 Validation failed`, so a form can show each message beside its field.

### Status codes
| Code | Meaning |
|---|---|
| 200 / 201 | OK / Created |
| 400 | Validation failed, bad id, or bad upload |
| 401 | Missing, invalid or expired token |
| 403 | Logged in, but not an admin |
| 404 | Not found |
| 429 | Too many requests (login, comments, reactions are rate limited) |
| 500 | Server error |

### Authentication
Admin write endpoints need a header: `Authorization: Bearer <access_token>`.
Get the token from `POST /api/auth/login`. It lasts about an hour; renew it with `POST /api/auth/refresh`.

### Pagination and search (all list endpoints)
`?page=1&limit=10` (limit max 100). Lists of projects, bulletins, officers and past presidents also accept `?search=...`
(case-insensitive match on title, or on full name for people).

### File uploads
Creating or updating anything with a picture or PDF uses **`multipart/form-data`** (use `FormData` in the browser). Don't set the `Content-Type` header yourself, since the browser adds the boundary.

| File | Allowed | Max size |
|---|---|---|
| `image` | JPEG, PNG, WebP | 5 MB |
| `pdf` | PDF | 20 MB |

Files are checked by their real contents, not the filename. On **update**, send only what changed; uploading a new file replaces the old one (the old file is deleted). Responses return public URLs (`image_url`, `pdf_url`) you can drop straight into `<img src>` / `<a href>`.

---

## 3. Endpoint reference

`Public` = no token needed. `Admin` = requires admin token.

### Auth
| Method | Path | Access | Body |
|---|---|---|---|
| POST | `/api/auth/login` | Public | `{ email, password }` (admin or member) |
| POST | `/api/auth/refresh` | Public | `{ refresh_token }` |
| POST | `/api/auth/logout` | Admin | |
| GET | `/api/auth/me` | Admin | |
| POST | `/api/auth/change-password` | Admin | `{ current_password, new_password }` |

### Clubhouse members and profile
| Method | Path | Access | Body |
|---|---|---|---|
| POST | `/api/clubhouse/auth/login` | Public (member accounts only) | `{ email, password }` |
| GET | `/api/clubhouse/members` | Admin | `?page &limit` |
| GET | `/api/clubhouse/members/:id` | Admin | |
| POST | `/api/clubhouse/members` | Admin | `{ email, password }` (initial password exactly 8 characters) |
| PUT | `/api/clubhouse/members/:id` | Admin | `{ email?, password? }` |
| DELETE | `/api/clubhouse/members/:id` | Admin | |
| GET | `/api/clubhouse/profile` | Member or admin | |
| POST | `/api/clubhouse/profile/change-password` | Member or admin | `{ current_password, new_password }` |

Members cannot change their email. Only admins can update member email addresses.

### Clubhouse articles, comments and reactions
All endpoints require an authenticated member or admin. Members can create articles and edit/delete their own; admins can manage any article.

| Method | Path | Access | Body / query |
|---|---|---|---|
| GET | `/api/clubhouse/articles` | Member or admin | `?page &limit &search` |
| GET | `/api/clubhouse/articles/:id` | Member or admin | |
| POST | `/api/clubhouse/articles` | Member or admin | `{ title, body }` |
| PUT | `/api/clubhouse/articles/:id` | Author or admin | `{ title?, body? }` |
| DELETE | `/api/clubhouse/articles/:id` | Author or admin | |
| GET | `/api/clubhouse/articles/:id/comments` | Member or admin | `?page &limit` |
| POST | `/api/clubhouse/articles/:id/comments` | Member or admin | `{ body }` |
| PUT | `/api/clubhouse/articles/:id/comments/:commentId` | Comment author or admin | `{ body }` |
| DELETE | `/api/clubhouse/articles/:id/comments/:commentId` | Author or admin | |
| GET | `/api/clubhouse/articles/:id/reactions` | Member or admin | |
| POST | `/api/clubhouse/articles/:id/reactions` | Member or admin | `{ type }` (like, love, celebrate, clap, wow; toggles) |

### Projects: picture, title, date, description (+ comments & reactions)
| Method | Path | Access | Fields |
|---|---|---|---|
| GET | `/api/projects` | Public | `?page &limit &search` |
| GET | `/api/projects/:id` | Public | |
| POST | `/api/projects` | Admin | form-data: `title`\*, `date`\* (YYYY-MM-DD), `description`\*, `image`\* |
| PUT | `/api/projects/:id` | Admin | any of the above |
| DELETE | `/api/projects/:id` | Admin | also deletes its file, comments, reactions |

Sorted newest `date` first.

### Bulletins: picture, title, PDF (+ comments & reactions)
| Method | Path | Access | Fields |
|---|---|---|---|
| GET | `/api/bulletins` | Public | `?page &limit &search` |
| GET | `/api/bulletins/:id` | Public | |
| POST | `/api/bulletins` | Admin | form-data: `title`\*, `image`\*, `pdf`\* |
| PUT | `/api/bulletins/:id` | Admin | any of the above |
| DELETE | `/api/bulletins/:id` | Admin | also deletes both files, comments, reactions |

Sorted newest first.

### Club officers: picture, position, full name
| Method | Path | Access | Fields |
|---|---|---|---|
| GET | `/api/club-officers` | Public | `?page &limit &search` |
| GET | `/api/club-officers/:id` | Public | |
| POST | `/api/club-officers` | Admin | form-data: `full_name`\*, `position`\*, `image`\*, `display_order` (optional, lowest shows first) |
| PUT | `/api/club-officers/:id` | Admin | any of the above |
| DELETE | `/api/club-officers/:id` | Admin | |

Sorted by `display_order`, then creation order. Give the President `1`, Vice President `2`, and so on.

### League of past presidents: picture, full name, year served
| Method | Path | Access | Fields |
|---|---|---|---|
| GET | `/api/past-presidents` | Public | `?page &limit &search` |
| GET | `/api/past-presidents/:id` | Public | |
| POST | `/api/past-presidents` | Admin | form-data: `full_name`\*, `year_served`\* (`2019`, `2019/2020` or `2019-2020`), `image`\* |
| PUT | `/api/past-presidents/:id` | Admin | any of the above |
| DELETE | `/api/past-presidents/:id` | Admin | |

Sorted most recent `year_served` first.

### Comments and reactions (projects and bulletins)
Replace `projects` with `bulletins` for bulletins; the behaviour is identical.

| Method | Path | Access | Body / query |
|---|---|---|---|
| GET | `/api/projects/:id/comments` | Public | `?page &limit` (newest first, default 20) |
| POST | `/api/projects/:id/comments` | Public | `{ author_name, body }` |
| GET | `/api/projects/:id/reactions` | Public | `?visitor_id=` (optional) |
| POST | `/api/projects/:id/reactions` | Public | `{ type, visitor_id }` |
| GET | `/api/comments` | Admin | `?target_type=project\|bulletin &target_id= &page &limit` |
| DELETE | `/api/comments/:id` | Admin | moderate any comment |

Reaction `type` is one of: `like`, `love`, `celebrate`, `clap`, `wow`.
Reactions **toggle**: sending the same type again removes it, a different type switches it.

Every project and bulletin in a list or detail response already includes `comments_count`, `reactions` (counts per type) and `reactions_total`, so you rarely need extra calls.

### Example response: one project
```json
{
  "success": true,
  "data": {
    "id": "0d5b9c0e-3d8e-4f5a-9d49-6d8f2f6f1a11",
    "title": "Community Borehole Project",
    "date": "2025-03-14",
    "description": "We drilled a solar-powered borehole serving over 500 residents.",
    "image_url": "https://<ref>.supabase.co/storage/v1/object/public/media/projects/8c1e...e3.jpg",
    "created_at": "2025-03-20T09:12:44.512Z",
    "updated_at": "2025-03-20T09:12:44.512Z",
    "comments_count": 4,
    "reactions": { "like": 7, "love": 3, "celebrate": 2, "clap": 0, "wow": 0 },
    "reactions_total": 12
  }
}
```

---

## 4. Frontend integration guide

All examples use plain `fetch`. `API` is your base URL.

```js
const API = 'https://<your-service>.onrender.com';
```

### 4.1 A small reusable client (copy this into your frontend)

```js
const API = 'https://<your-service>.onrender.com';

// ---- token storage (admin panel) ----
const tokens = {
  get access() { return localStorage.getItem('access_token'); },
  get refresh() { return localStorage.getItem('refresh_token'); },
  save(s) { localStorage.setItem('access_token', s.access_token); localStorage.setItem('refresh_token', s.refresh_token); },
  clear() { localStorage.removeItem('access_token'); localStorage.removeItem('refresh_token'); },
};

async function request(path, { method = 'GET', body, auth = false } = {}, retry = true) {
  const headers = {};
  if (auth && tokens.access) headers.Authorization = `Bearer ${tokens.access}`;

  let payload = body;
  if (body && !(body instanceof FormData)) {           // JSON body
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }                                                    // FormData: browser sets the header itself

  const res = await fetch(API + path, { method, headers, body: payload });
  const json = await res.json().catch(() => ({}));

  // Expired access token: refresh once, then retry the request
  if (res.status === 401 && auth && retry && tokens.refresh) {
    const r = await fetch(API + '/api/auth/refresh', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: tokens.refresh }),
    });
    if (r.ok) { tokens.save((await r.json()).data); return request(path, { method, body, auth }, false); }
    tokens.clear();                                     // refresh failed: send user to the login page
  }

  if (!res.ok) throw Object.assign(new Error(json.message || 'Request failed'), { status: res.status, errors: json.errors });
  return json;
}

export const api = {
  login: async (email, password) => {
    const { data } = await request('/api/auth/login', { method: 'POST', body: { email, password } });
    tokens.save(data);
    return data.user;
  },
  logout: async () => { try { await request('/api/auth/logout', { method: 'POST', auth: true }); } finally { tokens.clear(); } },
  me: () => request('/api/auth/me', { auth: true }),

  // generic helpers for projects | bulletins | club-officers | past-presidents
  list:   (resource, params = {}) => request(`/api/${resource}?${new URLSearchParams(params)}`),
  get:    (resource, id) => request(`/api/${resource}/${id}`),
  create: (resource, formData) => request(`/api/${resource}`, { method: 'POST', body: formData, auth: true }),
  update: (resource, id, formData) => request(`/api/${resource}/${id}`, { method: 'PUT', body: formData, auth: true }),
  remove: (resource, id) => request(`/api/${resource}/${id}`, { method: 'DELETE', auth: true }),
};
```

### 4.2 Public website

```js
// Latest projects, 6 per page
const { data: projects, meta } = await api.list('projects', { page: 1, limit: 6 });

// Search bulletins
const { data: bulletins } = await api.list('bulletins', { search: 'october' });

// Club officers and past presidents
const { data: officers } = await api.list('club-officers', { limit: 100 });
const { data: presidents } = await api.list('past-presidents', { limit: 100 });

// Render
projects.forEach(p => {
  console.log(p.title, p.date, p.image_url, p.comments_count, p.reactions_total);
});
// Bulletin PDF: <a href={b.pdf_url} target="_blank">Download</a>
```

### 4.3 Comments

```js
// Read
const { data: comments, meta } = await request(`/api/projects/${id}/comments?page=1&limit=20`);

// Post (no login needed)
await request(`/api/projects/${id}/comments`, {
  method: 'POST',
  body: { author_name: 'Ngozi A.', body: 'Great work, team!' },
});
```
Comments are plain text. Render them as text (React/Vue do this by default); never insert them with `innerHTML`.

### 4.4 Reactions

Visitors don't log in, so give each browser a random ID **once** and reuse it:

```js
function visitorId() {
  let id = localStorage.getItem('visitor_id');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('visitor_id', id); }
  return id;
}

// Load counts and which reaction THIS visitor made (to highlight the button)
const { data } = await request(`/api/projects/${id}/reactions?visitor_id=${visitorId()}`);
// data = { reactions: { like: 7, love: 3, ... }, reactions_total: 12, my_reaction: 'like' | null }

// Click a reaction button (click the same one again to undo it)
const { data: result } = await request(`/api/projects/${id}/reactions`, {
  method: 'POST',
  body: { type: 'love', visitor_id: visitorId() },
});
// result = { action: 'added'|'changed'|'removed', reactions: {...}, reactions_total, my_reaction }
```

### 4.5 Admin panel

```js
// Login form
await api.login(email, password);              // throws on wrong credentials

// Create a project from a form: <input name="title"> <input type="date" name="date">
//   <textarea name="description"> <input type="file" name="image" accept="image/*">
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api.create('projects', new FormData(form));
  } catch (err) {
    if (err.errors) showFieldErrors(err.errors);   // { title: 'is required', image: 'file is required' }
    else alert(err.message);
  }
});

// Create a bulletin (image + pdf)
const fd = new FormData();
fd.append('title', 'October 2025 Bulletin');
fd.append('image', coverFile);
fd.append('pdf', pdfFile);
await api.create('bulletins', fd);

// Edit: send only what changed. Add a file field only to replace the file.
const edit = new FormData();
edit.append('title', 'New title');
await api.update('projects', id, edit);

// Delete
await api.remove('projects', id);

// Moderate comments
const { data } = await request('/api/comments?target_type=project&page=1', { auth: true });
await request(`/api/comments/${commentId}`, { method: 'DELETE', auth: true });
```

### 4.6 cURL

```bash
# login
curl -X POST $API/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@eclubofgreaternigeria.com","password":"<password>"}'

# create a project
curl -X POST $API/api/projects -H "Authorization: Bearer $TOKEN" \
  -F title="Community Borehole" -F date=2025-03-14 -F description="Water for all" -F image=@./borehole.jpg

# create a bulletin
curl -X POST $API/api/bulletins -H "Authorization: Bearer $TOKEN" \
  -F title="October 2025" -F image=@./cover.png -F pdf=@./bulletin.pdf

# react
curl -X POST $API/api/projects/$ID/reactions -H "Content-Type: application/json" \
  -d '{"type":"love","visitor_id":"visitor-12345678"}'
```

### 4.7 Typed client (optional)
Because the API publishes an OpenAPI spec, TypeScript projects can generate types in one command:
```bash
npx openapi-typescript https://<your-service>.onrender.com/api-docs.json -o src/api-types.ts
```

### 4.8 Gotchas
- **Don't set `Content-Type` manually for `FormData`** requests; the browser must add the multipart boundary.
- **Render's free tier sleeps** after ~15 min idle, so the first request can take 30-60 s. Show a loading state, or use a paid instance.
- **CORS:** if the browser reports a CORS error, add your frontend's exact origin (scheme + host, no trailing slash) to `CORS_ORIGINS` on Render and redeploy.
- **Dates** are plain `YYYY-MM-DD` strings with no timezone, so format them for display without converting through `new Date()` timezones if you need exact days.
- **`year_served`** is text (`"2019"` or `"2019/2020"`), because terms often span two calendar years.

---

## 5. Deploy to Render

1. Push this folder to GitHub (`.env` is git-ignored).
2. Render > **New > Blueprint** (reads `render.yaml`), or **New > Web Service** with
   Build `npm install`, Start `npm start`, Health check path `/health`.
3. Set environment variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `CORS_ORIGINS` (your frontend URLs).
4. Open `https://<your-service>.onrender.com/api-docs`.

Run `supabase/schema.sql` and `npm run seed:admin` from your own machine before or after the first deploy; neither runs on Render.

---

## 6. Adding a new resource

1. Add its table to `supabase/schema.sql` (and enable RLS) and run it.
2. Create `src/resources/<name>.js`, copying a similar one (fields, validators, files, ordering, route path).
3. Add it to `src/resources/index.js`.

Routes, validation, uploads, cleanup **and Swagger docs** are generated from that config.
To enable comments and reactions on it, set `targetType` in the config and add that type to the `check` constraints on the `comments` and `reactions` tables.

---

## 7. Project structure

```
supabase/schema.sql        tables, RLS, count views, storage bucket
scripts/seedAdmin.js       creates the admin user
src/
  config/                  env, Supabase clients, Swagger spec
  resources/               one config per resource (projects, bulletins, ...)
  controllers/
    crud.factory.js        list / get / create / update / delete from a resource config
    engagement.controller.js  comments + reactions
    comments.controller.js    admin comment moderation
    auth.controller.js     login / refresh / logout / me / change password
  routes/                  resource.router.js, engagement.router.js, auth, comments
  middleware/              auth (JWT + admin), upload (multer), rate limiters, errors
  services/                storage (Supabase Storage), engagement (counts)
  docs/buildDocs.js        generates Swagger paths/schemas from resource configs
  utils/                   validators, pagination, helpers
```

---

## 8. Security notes and design decisions

- **Admin = `app_metadata.role`**, which only the server can set. Every write route checks the token *before* parsing any upload.
- **Database is locked down.** RLS is on with no policies, so the public anon key can't read or write tables directly; everything goes through this API.
- **Uploads are verified by content** (magic bytes), size-limited, and stored under random names. If a database write fails after an upload, the file is removed again so nothing is orphaned.
- **Comments and reactions are public and anonymous** (visitors don't have accounts). To limit abuse they are rate-limited per IP (10 comments / 60 reactions per 15 min), validated and length-capped, and the admin can delete any comment. Reactions use a browser-generated `visitor_id` to give one reaction per visitor per item. That prevents accidental double-counting, but a determined person could create many IDs; if you later need stronger guarantees, require visitors to sign in.
- **Pictures and PDFs are publicly readable by URL** (that's what lets your site display them). Don't upload anything confidential.
- Login/refresh/change-password are rate-limited (10 per 15 min per IP). Login errors don't reveal whether the email exists.
- Keep `SUPABASE_SERVICE_ROLE_KEY` secret. It bypasses all database security.
