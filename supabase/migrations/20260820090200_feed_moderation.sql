-- The automated half of "moderation from day one" (§384).

/*
 * How many separate people must report something before it comes down on
 * its own.
 *
 * Three, and the number is a judgement rather than a science. One is a
 * heckler's veto — anybody could silence anybody. Ten would mean nothing
 * ever came down on a beta with a dozen users. Three costs a coordinated
 * pair nothing and still requires more than a grudge.
 *
 * This hides; it never deletes. A hidden post stays visible to its author
 * and readable by us, because the appeal and the review both need the thing
 * itself.
 */
create or replace function public.auto_hide_threshold()
returns int language sql immutable set search_path = ''
as $$ select 3; $$;

create or replace function public.hide_on_reports()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  reporters int;
begin
  select count(distinct r.reporter_id) into reporters
  from public.reports r
  where r.subject_type = new.subject_type and r.subject_id = new.subject_id;

  if reporters < public.auto_hide_threshold() then
    return new;
  end if;

  if new.subject_type = 'post' then
    update public.posts
    set hidden_at = now(),
        hidden_reason = 'Hidden automatically after reports. Under review.'
    where id = new.subject_id and hidden_at is null;
  elsif new.subject_type = 'comment' then
    update public.post_comments set hidden_at = now()
    where id = new.subject_id and hidden_at is null;
  end if;
  -- A report about a person hides nothing on its own. There is no such
  -- thing as hiding a human being, and suspending an account is a decision
  -- someone has to make and answer for.
  return new;
end;
$$;

revoke all on function public.hide_on_reports() from public, anon, authenticated;

create trigger on_report_filed
  after insert on public.reports
  for each row execute function public.hide_on_reports();

/*
 * An author may unpublish their own post, but not un-hide one that
 * moderation took down. Without this, the update policy that correctly lets
 * authors edit their own posts is also a way to reverse every takedown.
 */
create or replace function public.protect_hidden_state()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.hidden_at is not null and new.hidden_at is null then
    raise exception 'This post is under review and cannot be restored from the app.';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_hidden_state() from public, anon, authenticated;

create trigger posts_keep_hidden before update on public.posts
  for each row execute function public.protect_hidden_state();
create trigger comments_keep_hidden before update on public.post_comments
  for each row execute function public.protect_hidden_state();
