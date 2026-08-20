-- Shared wishlists (PRD F14, Phase 3).
--
-- The first server-side feature in an app that has been local-only. Scope is
-- deliberate: nothing here touches the diary. Visits, notes, ratings and
-- photos stay on the device, which is what the privacy page promises, and a
-- wishlist is the one part of planning that is useless alone.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- What collaborators see. Not a handle and not unique: there are no public
  -- profiles to squat, and a display name that must be unique is a naming
  -- fight nobody asked for.
  display_name text not null default 'Someone',
  created_at timestamptz not null default now()
);

create table public.wishlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Our list',
  -- Which place dataset the ids belong to, for the same reason the share
  -- link carries it: a Hong Kong list opening on a Bay Area build should be
  -- a named refusal rather than an empty one.
  city text not null default 'sf',
  created_at timestamptz not null default now(),
  constraint wishlists_name_not_blank check (length(btrim(name)) > 0)
);

create table public.wishlist_members (
  wishlist_id uuid not null references public.wishlists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- owner administers, editor adds and removes places, viewer only reads.
  role text not null default 'editor'
    check (role in ('owner', 'editor', 'viewer')),
  added_at timestamptz not null default now(),
  primary key (wishlist_id, user_id)
);

create table public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  wishlist_id uuid not null references public.wishlists (id) on delete cascade,
  -- The app's own place slug, e.g. 'ferry-building'.
  place_id text not null,
  -- Carried alongside the id for the same reason a visit carries it: the
  -- other person's build may not have this place, and a row that cannot be
  -- named is worse than one that cannot be mapped.
  place_name text not null,
  note text,
  -- Kept when the person leaves, so their additions do not vanish from a
  -- list other people are still using.
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- The same place twice in one list is not a thing the planner has a
  -- meaning for.
  unique (wishlist_id, place_id)
);

-- Every policy below filters by these, and every screen reads a list's
-- members or a member's lists.
create index wishlist_members_user_idx on public.wishlist_members (user_id);
create index wishlist_items_list_idx on public.wishlist_items (wishlist_id);
create index wishlists_owner_idx on public.wishlists (owner_id);
