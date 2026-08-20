-- Every function here is SECURITY DEFINER, which means it runs as its owner
-- and ignores the caller's row-level security. Being in the `public` schema
-- also publishes each one at /rest/v1/rpc/<name>, so by default anyone
-- holding the publishable key can call them directly.
--
-- The trigger functions have no business being called by anyone: a trigger
-- is invoked by the table, and permission for that is settled when the
-- trigger is created, not when it fires.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.add_owner_as_member() from public, anon, authenticated;

-- The four predicates stay callable by signed-in users, because a policy
-- expression is evaluated as the querying user and would fail without it.
-- What they expose is bounded: each one answers a question about the caller
-- themselves — am I on this list, may I edit it, do I share a list with this
-- person — which is what the app already shows them. Nothing here reveals
-- another person's lists, names, or membership.
revoke all on function public.is_wishlist_member(uuid) from public, anon;
revoke all on function public.can_edit_wishlist(uuid) from public, anon;
revoke all on function public.is_wishlist_owner(uuid) from public, anon;
revoke all on function public.shares_wishlist_with(uuid) from public, anon;

grant execute on function public.is_wishlist_member(uuid) to authenticated;
grant execute on function public.can_edit_wishlist(uuid) to authenticated;
grant execute on function public.is_wishlist_owner(uuid) to authenticated;
grant execute on function public.shares_wishlist_with(uuid) to authenticated;

-- Signed-out callers have no reason to reach any of these tables either.
-- RLS already denies them every row; this removes the endpoint as well, so
-- an unauthenticated probe gets a permission error rather than an empty list
-- that invites guessing.
revoke all on table public.profiles from anon;
revoke all on table public.wishlists from anon;
revoke all on table public.wishlist_members from anon;
revoke all on table public.wishlist_items from anon;
