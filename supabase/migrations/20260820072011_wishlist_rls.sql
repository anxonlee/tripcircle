-- Row-level security for shared wishlists.
--
-- Written as security-definer helpers rather than inline subqueries because
-- a policy on wishlist_members that reads wishlist_members recurses: Postgres
-- applies the policy to the very query the policy is made of. The helpers run
-- as owner, so their reads are not themselves filtered, and the recursion
-- cannot start.
--
-- Every helper sets an empty search_path and names its tables in full. A
-- security-definer function that resolves names through a caller-controlled
-- search_path is how a definer function becomes a way in.

create or replace function public.is_wishlist_member(wl uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.wishlist_members m
    where m.wishlist_id = wl and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.can_edit_wishlist(wl uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.wishlist_members m
    where m.wishlist_id = wl and m.user_id = (select auth.uid())
      and m.role in ('owner', 'editor')
  );
$$;

create or replace function public.is_wishlist_owner(wl uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.wishlist_members m
    where m.wishlist_id = wl and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

-- Whether the caller shares any list with this person. What makes a
-- collaborator's name readable, and nothing wider: there are no public
-- profiles in this app, so a profile is visible exactly to the people you
-- are planning with.
create or replace function public.shares_wishlist_with(other uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.wishlist_members mine
    join public.wishlist_members theirs on theirs.wishlist_id = mine.wishlist_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = other
  );
$$;

alter table public.profiles enable row level security;
alter table public.wishlists enable row level security;
alter table public.wishlist_members enable row level security;
alter table public.wishlist_items enable row level security;

-- ——— profiles ———————————————————————————————————————————————

create policy "read own profile" on public.profiles for select
  to authenticated using (id = (select auth.uid()));

create policy "read profiles of people you plan with" on public.profiles for select
  to authenticated using (public.shares_wishlist_with(id));

create policy "create own profile" on public.profiles for insert
  to authenticated with check (id = (select auth.uid()));

create policy "update own profile" on public.profiles for update
  to authenticated using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ——— wishlists ——————————————————————————————————————————————

create policy "read lists you belong to" on public.wishlists for select
  to authenticated using (public.is_wishlist_member(id));

-- Owner is set to the caller rather than trusted from the request: without
-- this check, anyone could create a list owned by someone else.
create policy "create your own list" on public.wishlists for insert
  to authenticated with check (owner_id = (select auth.uid()));

create policy "owner renames the list" on public.wishlists for update
  to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "owner deletes the list" on public.wishlists for delete
  to authenticated using (owner_id = (select auth.uid()));

-- ——— members ————————————————————————————————————————————————

create policy "see who else is on the list" on public.wishlist_members for select
  to authenticated using (public.is_wishlist_member(wishlist_id));

create policy "owner invites" on public.wishlist_members for insert
  to authenticated with check (public.is_wishlist_owner(wishlist_id));

create policy "owner changes roles" on public.wishlist_members for update
  to authenticated using (public.is_wishlist_owner(wishlist_id))
  with check (public.is_wishlist_owner(wishlist_id));

-- Leaving is not the owner's decision, so this is deliberately two cases:
-- the owner removing someone, and anyone removing themselves.
create policy "owner removes, or you leave" on public.wishlist_members for delete
  to authenticated using (
    public.is_wishlist_owner(wishlist_id) or user_id = (select auth.uid())
  );

-- ——— items ——————————————————————————————————————————————————

create policy "read items on your lists" on public.wishlist_items for select
  to authenticated using (public.is_wishlist_member(wishlist_id));

create policy "editors add places" on public.wishlist_items for insert
  to authenticated with check (
    public.can_edit_wishlist(wishlist_id) and added_by = (select auth.uid())
  );

create policy "editors change places" on public.wishlist_items for update
  to authenticated using (public.can_edit_wishlist(wishlist_id))
  with check (public.can_edit_wishlist(wishlist_id));

create policy "editors remove places" on public.wishlist_items for delete
  to authenticated using (public.can_edit_wishlist(wishlist_id));
