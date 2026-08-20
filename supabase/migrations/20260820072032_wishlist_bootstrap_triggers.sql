-- Two things that must happen for the policies to be usable at all.

-- A profile per account. Done in the database rather than in the app because
-- the app is not the only way a row gets created — an OAuth sign-in, a magic
-- link, or a support action all land in auth.users, and a profile that only
-- appears when a particular screen remembers to write one is a profile that
-- is sometimes missing.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      -- Falls back to the local part of the email rather than the whole
      -- address: collaborators should not learn each other's email from a
      -- default nobody chose.
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Someone'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- The creator joins their own list.
--
-- Without this a new list is invisible the moment it is written: reading a
-- list requires membership, and the row that grants membership would not
-- exist yet. Done as a trigger rather than a second insert from the client
-- so the two can never come apart — a client that crashed between them would
-- leave a list nobody, including its owner, could ever see.
create or replace function public.add_owner_as_member()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.wishlist_members (wishlist_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (wishlist_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

create trigger on_wishlist_created
  after insert on public.wishlists
  for each row execute function public.add_owner_as_member();
