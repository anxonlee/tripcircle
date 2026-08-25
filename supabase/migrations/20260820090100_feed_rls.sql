-- Who can see and change what in the feed.

-- Blocking works in both directions from one row: if either of us has
-- blocked the other, neither sees the other's posts or comments. A block
-- that only worked one way would let the blocked person keep watching.
create or replace function public.is_blocked_either_way(other uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = (select auth.uid()) and b.blocked_id = other)
       or (b.blocker_id = other and b.blocked_id = (select auth.uid()))
  );
$$;

create or replace function public.can_see_post(p uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.posts po
    where po.id = p
      and (
        po.author_id = (select auth.uid())
        or (po.hidden_at is null and not public.is_blocked_either_way(po.author_id))
      )
  );
$$;

-- Publishing makes a display name public. That is the bargain of a public
-- feed: nothing else on a profile is exposed, and someone who never posts
-- stays visible only to people they plan with.
create or replace function public.has_public_post(who uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.posts po
    where po.author_id = who and po.hidden_at is null
  );
$$;

revoke all on function public.is_blocked_either_way(uuid) from public, anon;
revoke all on function public.can_see_post(uuid) from public, anon;
revoke all on function public.has_public_post(uuid) from public, anon;
grant execute on function public.is_blocked_either_way(uuid) to authenticated;
grant execute on function public.can_see_post(uuid) to authenticated;
grant execute on function public.has_public_post(uuid) to authenticated;

alter table public.posts enable row level security;
alter table public.post_places enable row level security;
alter table public.post_comments enable row level security;
alter table public.reports enable row level security;
alter table public.blocks enable row level security;

-- The author sees their own even once hidden, so a takedown is visible to
-- the person it happened to rather than a post that silently vanished.
create policy "read your own posts" on public.posts for select
  to authenticated using (author_id = (select auth.uid()));

create policy "read public posts" on public.posts for select
  to authenticated using (
    hidden_at is null and not public.is_blocked_either_way(author_id)
  );

-- Owner is checked rather than trusted: otherwise anyone could publish
-- under someone else's name.
create policy "publish as yourself" on public.posts for insert
  to authenticated with check (author_id = (select auth.uid()));

create policy "edit your own post" on public.posts for update
  to authenticated using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy "delete your own post" on public.posts for delete
  to authenticated using (author_id = (select auth.uid()));

create policy "read places on a post you can see" on public.post_places for select
  to authenticated using (public.can_see_post(post_id));

create policy "author sets the places" on public.post_places for insert
  to authenticated with check (
    exists (select 1 from public.posts po
            where po.id = post_id and po.author_id = (select auth.uid()))
  );

create policy "author removes the places" on public.post_places for delete
  to authenticated using (
    exists (select 1 from public.posts po
            where po.id = post_id and po.author_id = (select auth.uid()))
  );

create policy "read comments on a post you can see" on public.post_comments for select
  to authenticated using (
    public.can_see_post(post_id)
    and (
      author_id = (select auth.uid())
      or (hidden_at is null and not public.is_blocked_either_way(author_id))
    )
  );

create policy "comment as yourself" on public.post_comments for insert
  to authenticated with check (
    author_id = (select auth.uid()) and public.can_see_post(post_id)
  );

create policy "edit your own comment" on public.post_comments for update
  to authenticated using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

-- The post's author can remove a comment from their own post. Someone has
-- to be able to clear a mess on their own doorstep without waiting for us.
create policy "your comment, or one on your post" on public.post_comments for delete
  to authenticated using (
    author_id = (select auth.uid())
    or exists (select 1 from public.posts po
               where po.id = post_id and po.author_id = (select auth.uid()))
  );

-- Anyone signed in may report anything, deliberately including content they
-- can no longer see: someone who has just blocked an account should still be
-- able to report it.
create policy "report as yourself" on public.reports for insert
  to authenticated with check (reporter_id = (select auth.uid()));

-- Report counts are not public: a visible tally is a scoreboard to game.
create policy "read your own reports" on public.reports for select
  to authenticated using (reporter_id = (select auth.uid()));

-- Only ever your own list, in both directions of the check: nobody learns
-- that they have been blocked.
create policy "your own blocks" on public.blocks for all
  to authenticated using (blocker_id = (select auth.uid()))
  with check (blocker_id = (select auth.uid()));

create policy "read profiles of people who post publicly" on public.profiles for select
  to authenticated using (public.has_public_post(id));

revoke all on table public.posts from anon;
revoke all on table public.post_places from anon;
revoke all on table public.post_comments from anon;
revoke all on table public.reports from anon;
revoke all on table public.blocks from anon;
