-- A block hid the posts but not the name.
--
-- Publishing makes a display name readable through the feed, and that policy
-- did not ask about blocking — so after blocking someone their content
-- vanished while their name stayed reachable. Half a block is a confusing
-- block.
--
-- The other two ways to read a profile are untouched: your own, and people
-- you share a wishlist with. Blocking somebody you are planning with is a
-- different situation, and the list is the place to resolve it.
drop policy "read profiles of people who post publicly" on public.profiles;

create policy "read profiles of people who post publicly"
  on public.profiles for select
  to authenticated
  using (
    public.has_public_post(id)
    and not public.is_blocked_either_way(id)
  );
