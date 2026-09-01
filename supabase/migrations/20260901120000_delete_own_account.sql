-- Deleting your account, from inside the app.
--
-- App Store guideline 5.1.1(v) requires it of anything that lets you create
-- an account, and this app has let you create one since the wishlists went
-- up. Sign-out was the only control that existed, which is not the same
-- promise: it puts the session down and leaves the row.
--
-- `auth.users` is not reachable from a client, and giving one a grant on it
-- would be far worse than the problem. So a definer function does the
-- delete and is allowed exactly one row: the caller's own. There is no
-- argument to pass, so there is no argument to tamper with.
create or replace function public.delete_own_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = (select auth.uid());
$$;

-- `anon` cannot call it at all: with no `auth.uid()` the delete would match
-- nothing, but a function a signed-out caller may invoke is a function
-- somebody will probe.
revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

/* What goes with it, by the cascades already on the schema:

   - the profile, and the display name on it
   - wishlists they own, and every item on them
   - their membership of other people's lists — those lists stay
   - posts they published, and the places carried on them
   - comments they wrote, anywhere
   - reports they filed, and blocks in either direction

   `wishlist_items.added_by` is `on delete set null`, so a place someone
   added to a list they do not own stays on that list without their name.
   The item is the list's; the attribution was theirs.

   A shared list owned by the leaver goes with them, which takes it away
   from its members. That is the same rule 20260820_fix_ownership_and_removal
   settled on for leaving — an owner who is done with a list deletes it,
   rather than abandoning a row nobody can administer. Deletion is that, for
   every list at once.

   The diary is untouched, because it was never here. Visits, notes, ratings
   and photos are on the device, and deleting an account does not reach
   them — `PRIVACY.md` and the in-app privacy screen both say the diary
   never leaves the phone, and a delete that quietly erased it would make
   those false in the other direction. The app says so at the point of
   deletion rather than leaving it to be discovered. */
