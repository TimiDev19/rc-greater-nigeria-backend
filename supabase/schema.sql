-- =====================================================================
-- E-Club of Greater Nigeria API: database schema
-- Run this ONCE in Supabase Dashboard > SQL Editor > New query > Run.
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE).
-- =====================================================================

-- Keeps updated_at current on every UPDATE
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- projects
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text not null,
  date        date not null,
  image_url   text not null,
  image_path  text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists projects_date_idx on public.projects (date desc);

-- ---------------------------------------------------------------- bulletins
create table if not exists public.bulletins (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  image_url   text not null,
  image_path  text not null,
  pdf_url     text not null,
  pdf_path    text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists bulletins_created_idx on public.bulletins (created_at desc);

-- ------------------------------------------------------------ club officers
create table if not exists public.club_officers (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  position      text not null,
  display_order integer not null default 0,
  image_url     text not null,
  image_path    text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ------------------------------------------------- league of past presidents
create table if not exists public.past_presidents (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  year_served text not null,
  image_url   text not null,
  image_path  text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------- comments (projects and bulletins)
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('project', 'bulletin')),
  target_id   uuid not null,
  author_name text not null,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists comments_target_idx
  on public.comments (target_type, target_id, created_at desc);

-- --------------------------------------- reactions (projects and bulletins)
-- One reaction per visitor per item; visitor_id is a random ID the frontend generates.
create table if not exists public.reactions (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('project', 'bulletin')),
  target_id   uuid not null,
  visitor_id  text not null,
  type        text not null check (type in ('like', 'love', 'celebrate', 'clap', 'wow')),
  created_at  timestamptz not null default now(),
  unique (target_type, target_id, visitor_id)
);
create index if not exists reactions_target_idx
  on public.reactions (target_type, target_id);

-- --------------------------------------------------------------- clubhouse
create table if not exists public.clubhouse_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  author_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clubhouse_articles_created_idx on public.clubhouse_articles (created_at desc);
create index if not exists clubhouse_articles_author_idx on public.clubhouse_articles (author_id);

create table if not exists public.clubhouse_comments (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.clubhouse_articles(id) on delete cascade,
  author_id uuid not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists clubhouse_comments_article_idx on public.clubhouse_comments (article_id, created_at desc);

create table if not exists public.clubhouse_reactions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.clubhouse_articles(id) on delete cascade,
  author_id uuid not null,
  type text not null check (type in ('like', 'love', 'celebrate', 'clap', 'wow')),
  created_at timestamptz not null default now(),
  unique (article_id, author_id)
);
create index if not exists clubhouse_reactions_article_idx on public.clubhouse_reactions (article_id);

-- ------------------------------------------------------------ count views
create or replace view public.comment_counts with (security_invoker = true) as
  select target_type, target_id, count(*)::int as total
  from public.comments
  group by target_type, target_id;

create or replace view public.reaction_counts with (security_invoker = true) as
  select target_type, target_id, type, count(*)::int as total
  from public.reactions
  group by target_type, target_id, type;

-- ------------------------------------------------------------ triggers
do $$
declare t text;
begin
  foreach t in array array['projects', 'bulletins', 'club_officers', 'past_presidents', 'clubhouse_articles']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ------------------------------------------------------ row level security
-- RLS ON with NO policies = the public anon key cannot touch these tables directly.
-- Only this API (using the service role key) can read and write them.
alter table public.projects        enable row level security;
alter table public.bulletins       enable row level security;
alter table public.club_officers   enable row level security;
alter table public.past_presidents enable row level security;
alter table public.comments        enable row level security;
alter table public.reactions       enable row level security;
alter table public.clubhouse_articles enable row level security;
alter table public.clubhouse_comments enable row level security;
alter table public.clubhouse_reactions enable row level security;

-- This API performs database requests through its server-only service_role key.
-- Explicit grants are needed on projects where new tables do not inherit Data API privileges.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- --------------------------------------------------------------- storage
-- Public-read bucket for pictures and PDFs. Uploads only happen through the API.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', true, 20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
