-- Publishing a day, and the feed that reads it (PRD §3.8, Phase 3).
--
-- WHAT A POST CANNOT CONTAIN: the start place. §3.1 is unconditional and
-- §384 asks for it to be "enforced at the API level (never serialized into
-- shared posts)". There is no column for it here, so the guarantee is
-- structural rather than a rule someone has to remember.
--
-- Also absent: coordinates of any kind. A post carries place ids from the
-- shared dataset and the names they had, which say where somebody went
-- without saying where anybody is.
--
-- No photos. §120 gates photo sharing behind reporting and moderation
-- tooling existing first, so that tooling is what this builds.

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id) on delete cascade,
  city text not null default 'sf',
  title text not null,
  note text,
  day_start_min int not null default 540,
  home_by_min int not null default 1200,
  goal text not null default 'balanced'
    check (goal in ('economic', 'balanced', 'fastest', 'leastWalking')),
  created_at timestamptz not null default now(),
  -- Set when moderation takes a post down. A column rather than a delete:
  -- the author should be able to see that something happened to their post.
  hidden_at timestamptz,
  hidden_reason text,
  constraint posts_title_not_blank check (length(btrim(title)) > 0),
  constraint posts_title_length check (length(title) <= 120),
  constraint posts_note_length check (note is null or length(note) <= 2000)
);

create table public.post_places (
  post_id uuid not null references public.posts (id) on delete cascade,
  -- Route order. The order is the post: a day is an arrangement.
  position int not null,
  place_id text not null,
  place_name text not null,
  primary key (post_id, position)
);

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  constraint comments_not_blank check (length(btrim(body)) > 0),
  constraint comments_length check (length(body) <= 1000)
);

-- Reports (§384, and App Store guideline 1.2). One row per person per
-- thing, so a report count counts people rather than taps.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  subject_type text not null check (subject_type in ('post', 'comment', 'user')),
  subject_id uuid not null,
  reason text not null check (reason in ('spam', 'offensive', 'wrong', 'other')),
  detail text,
  created_at timestamptz not null default now(),
  unique (reporter_id, subject_type, subject_id),
  constraint reports_detail_length check (detail is null or length(detail) <= 1000)
);

-- Blocking. One-directional to write, mutual in effect, and silent: a block
-- that notifies is a block that escalates.
create table public.blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_blocking_yourself check (blocker_id <> blocked_id)
);

create index posts_city_created_idx on public.posts (city, created_at desc)
  where hidden_at is null;
create index posts_author_idx on public.posts (author_id);
create index post_comments_post_idx on public.post_comments (post_id, created_at);
create index reports_subject_idx on public.reports (subject_type, subject_id);
create index blocks_blocked_idx on public.blocks (blocked_id);
