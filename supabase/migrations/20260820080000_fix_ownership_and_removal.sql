-- Three faults found by probing the API as real users.
--
-- All three come from one mistake: "owner" had two sources of truth —
-- `wishlists.owner_id` and a `wishlist_members` row with role 'owner' — and
-- nothing kept them in step.

-- 1. Ownership is the column, not the membership row.
--
-- The old version read the membership role, so an owner who set their own
-- role to 'editor' left a list where is_wishlist_owner() was false for
-- everyone: nobody could invite, rotate the code, or change a role, ever
-- again. The membership row is now decoration; this is the fact.
create or replace function public.is_wishlist_owner(wl uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.wishlists w
    where w.id = wl and w.owner_id = (select auth.uid())
  );
$$;

create or replace function public.wishlist_owner_id(wl uuid)
returns uuid language sql stable security definer set search_path = ''
as $$
  select w.owner_id from public.wishlists w where w.id = wl;
$$;

revoke all on function public.wishlist_owner_id(uuid) from public, anon;
grant execute on function public.wishlist_owner_id(uuid) to authenticated;

-- 2. The owner may not leave their own list.
--
-- The old policy let anyone delete their own membership, the owner
-- included. The list survived, owned by someone who could no longer see it,
-- with an invite code nobody could read: a row that existed and could never
-- be reached again. Leaving is for members; an owner who is done with a
-- list deletes it.
drop policy "owner removes, or you leave" on public.wishlist_members;

create policy "owner removes others, or you leave"
  on public.wishlist_members for delete
  to authenticated
  using (
    user_id <> public.wishlist_owner_id(wishlist_id)
    and (
      public.is_wishlist_owner(wishlist_id)
      or user_id = (select auth.uid())
    )
  );

drop policy "owner changes roles" on public.wishlist_members;

create policy "owner changes other people's roles"
  on public.wishlist_members for update
  to authenticated
  using (
    public.is_wishlist_owner(wishlist_id)
    and user_id <> public.wishlist_owner_id(wishlist_id)
  )
  with check (
    public.is_wishlist_owner(wishlist_id)
    and user_id <> public.wishlist_owner_id(wishlist_id)
  );

-- 3. Removing someone has to actually remove them.
--
-- An invite code is a standing permission, so throwing someone out while
-- they still hold one removes them for as long as it takes to tap the link
-- again — which is not what "remove" means to the person doing it. Taking
-- someone off a list now rotates the code.
--
-- Only when they did not leave of their own accord: rotating on every
-- departure would cancel invitations the owner had already sent, for an
-- event that was nobody's decision but the leaver's.
create or replace function public.rotate_code_on_removal()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.user_id is distinct from (select auth.uid()) then
    update public.wishlists
    set invite_code = public.new_invite_code()
    where id = old.wishlist_id;
  end if;
  return old;
end;
$$;

revoke all on function public.rotate_code_on_removal() from public, anon, authenticated;

create trigger on_member_removed
  after delete on public.wishlist_members
  for each row execute function public.rotate_code_on_removal();
