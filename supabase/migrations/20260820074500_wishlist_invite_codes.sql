-- Joining a list you were invited to.
--
-- There is no way for one user to find another from the client: profiles
-- hold no email, auth.users is not reachable, and adding a lookup by email
-- would mean either storing addresses here or letting anyone probe for them.
-- So an invitation is a code the owner hands over, which is also how this
-- app already shares a day.
--
-- The code IS the permission. Anyone holding it can join, exactly like a
-- link-shared document, and the owner revokes it by rotating it. That is the
-- trade a share link makes, and it should be said plainly in the UI rather
-- than discovered.

-- Crockford-ish base32: no I, L, O or U, so a code read aloud or typed from
-- a photo does not turn into a different code. pgcrypto lives in the
-- extensions schema here, and with an empty search_path it has to be named.
create or replace function public.new_invite_code()
returns text language sql volatile set search_path = ''
as $$
  select string_agg(
    substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ',
           1 + (get_byte(extensions.gen_random_bytes(10), i) % 32), 1),
    ''
  )
  from generate_series(0, 9) as i;
$$;

alter table public.wishlists
  add column invite_code text not null unique default public.new_invite_code();

-- Ten characters of a 32-symbol alphabet is about fifty bits. Guessing one
-- is not the threat; losing one is, which is what rotation is for.
create or replace function public.rotate_invite_code(wl uuid)
returns text language plpgsql volatile security definer set search_path = ''
as $$
declare
  fresh text;
begin
  if not public.is_wishlist_owner(wl) then
    raise exception 'only the owner can rotate the invite code';
  end if;
  fresh := public.new_invite_code();
  update public.wishlists set invite_code = fresh where id = wl;
  return fresh;
end;
$$;

-- Joining. Security definer because the caller is by definition not yet a
-- member, so no policy could let them read the list or write the membership.
--
-- Returns the list id so the client can open it, and is idempotent: tapping
-- the same invite twice is a person checking it worked, not a second join.
create or replace function public.join_wishlist(code text)
returns uuid language plpgsql volatile security definer set search_path = ''
as $$
declare
  target uuid;
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'sign in first';
  end if;

  select id into target
  from public.wishlists
  -- Case and spacing are what a code picks up between two phones.
  where invite_code = upper(btrim(code));

  if target is null then
    raise exception 'that invite is not valid any more';
  end if;

  insert into public.wishlist_members (wishlist_id, user_id, role)
  values (target, me, 'editor')
  -- Never a downgrade: an owner who taps their own invite stays the owner.
  on conflict (wishlist_id, user_id) do nothing;

  return target;
end;
$$;

-- The code is only readable by people already on the list, since the select
-- policy on wishlists sees to that. An invite can only come from someone who
-- already has one.
revoke all on function public.new_invite_code() from public, anon, authenticated;
revoke all on function public.rotate_invite_code(uuid) from public, anon;
revoke all on function public.join_wishlist(text) from public, anon;
grant execute on function public.rotate_invite_code(uuid) to authenticated;
grant execute on function public.join_wishlist(text) to authenticated;
