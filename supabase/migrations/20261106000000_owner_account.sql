-- Owner account (owner-account design.md). One owner, listed in app_owners, can
-- read every trip and is the only one who can create, delete or re-link trips.
-- Friends stay anonymous; who each user is in a trip moves to trip_access.member_id.

-- §1 Owner list: rows are inserted by hand in the SQL editor, never by the app.
create table public.app_owners (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.app_owners enable row level security;
revoke all on public.app_owners from anon, authenticated;

create function public.is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_owners o where o.user_id = auth.uid());
$$;
revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

-- §2 The owner passes every read policy (RLS, Realtime, receipts storage).
create or replace function public.has_trip_access(p_trip_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_trip_id is not null and (
    public.is_owner() or exists (
      select 1 from public.trip_access a
      where a.trip_id = p_trip_id and a.user_id = auth.uid()
    )
  );
$$;

-- §3 Who this user is in the trip. Deleting the member clears it.
alter table public.trip_access
  add column member_id uuid,
  add constraint trip_access_member_fkey foreign key (trip_id, member_id)
    references public.members(trip_id, id) on delete set null (member_id);

-- §4 Share tokens: 22 base62 characters from cryptographic random bytes.
create function public.new_share_token()
returns text language plpgsql volatile set search_path = '' as $$
declare
  v_token text := '';
  v_byte integer;
begin
  while length(v_token) < 22 loop
    v_byte := get_byte(extensions.gen_random_bytes(1), 0);
    -- Rejection sampling avoids modulo bias.
    if v_byte < 248 then
      v_token := v_token || substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', v_byte % 62 + 1, 1);
    end if;
  end loop;
  return v_token;
end;
$$;
revoke all on function public.new_share_token() from public, anon, authenticated;

create or replace function public.create_trip(name text, default_currency text, member_name text, avatar_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_trip uuid;
  v_member uuid;
  v_token text;
  v_constraint text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if not public.is_owner() then
    raise exception using errcode = '42501', message = 'OWNER_REQUIRED';
  end if;
  if name is null or btrim(name) = '' or member_name is null or btrim(member_name) = '' then
    raise exception using errcode = '22023', message = 'NAME_REQUIRED';
  end if;
  loop
    v_token := public.new_share_token();
    begin
      insert into public.trips(share_token, name, default_currency)
      values (v_token, btrim(name), default_currency) returning id into v_trip;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint <> 'trips_share_token_key' then raise; end if;
    end;
  end loop;
  insert into public.members(trip_id, name, avatar_id)
  values (v_trip, btrim(member_name), avatar_id) returning id into v_member;
  insert into public.trip_access(trip_id, user_id, member_id) values (v_trip, auth.uid(), v_member);
  return jsonb_build_object('trip_id', v_trip, 'share_token', v_token, 'member_id', v_member);
end;
$$;

-- member_id null clears the identity. Upserts the access row, so the owner can
-- set an identity in a trip they have not opened through join_trip yet.
create function public.set_my_member(trip_id uuid, member_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if not public.has_trip_access(set_my_member.trip_id) or (
    set_my_member.member_id is not null and not exists (
      select 1 from public.members m
      where m.id = set_my_member.member_id and m.trip_id = set_my_member.trip_id
    )
  ) then
    raise exception using errcode = '42501', message = 'TRIP_ACCESS_DENIED';
  end if;
  insert into public.trip_access(trip_id, user_id, member_id)
  values (set_my_member.trip_id, auth.uid(), set_my_member.member_id)
  on conflict on constraint trip_access_pkey do update set member_id = excluded.member_id;
end;
$$;

-- §7 Anyone in the trip can delete a member with no expenses, splits or settlements.
create function public.delete_member(member_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_trip uuid;
  v_count bigint;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  -- The row lock makes a concurrent expense that references this member wait,
  -- then fail its foreign key check once the delete commits.
  select m.trip_id into v_trip from public.members m where m.id = delete_member.member_id for update;
  if v_trip is null or not public.has_trip_access(v_trip) then
    raise exception using errcode = '42501', message = 'TRIP_ACCESS_DENIED';
  end if;
  select
    (select count(*) from public.expenses e
     where e.trip_id = v_trip and (
       delete_member.member_id in (e.paid_by, e.created_by, e.updated_by)
       or exists (select 1 from public.expense_splits s
                  where s.expense_id = e.id and s.member_id = delete_member.member_id)))
    + (select count(*) from public.settlements s
       where s.trip_id = v_trip
         and delete_member.member_id in (s.from_member, s.to_member, s.created_by))
  into v_count;
  if v_count > 0 then
    raise exception using errcode = 'P0001', message = 'MEMBER_HAS_RECORDS', detail = v_count::text;
  end if;
  delete from public.members m where m.id = delete_member.member_id;
exception when foreign_key_violation then
  raise exception using errcode = 'P0001', message = 'MEMBER_HAS_RECORDS';
end;
$$;

-- §5 Owner only. Receipt photos are removed by the client first (storage objects
-- must go through the Storage API).
create function public.delete_trip(trip_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if not public.is_owner() then
    raise exception using errcode = '42501', message = 'OWNER_REQUIRED';
  end if;
  perform 1 from public.trips t where t.id = delete_trip.trip_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'TRIP_NOT_FOUND';
  end if;
  delete from public.settlements s where s.trip_id = delete_trip.trip_id;
  delete from public.expenses e where e.trip_id = delete_trip.trip_id; -- splits and items cascade
  delete from public.trip_access a where a.trip_id = delete_trip.trip_id;
  delete from public.members m where m.trip_id = delete_trip.trip_id;
  delete from public.trips t where t.id = delete_trip.trip_id;
end;
$$;

-- §6 Owner only. Access rows are kept, so people who joined keep the trip.
create function public.reset_share_token(trip_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_token text;
  v_constraint text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if not public.is_owner() then
    raise exception using errcode = '42501', message = 'OWNER_REQUIRED';
  end if;
  loop
    v_token := public.new_share_token();
    begin
      update public.trips t set share_token = v_token where t.id = reset_share_token.trip_id;
      if not found then
        raise exception using errcode = 'P0002', message = 'TRIP_NOT_FOUND';
      end if;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint <> 'trips_share_token_key' then raise; end if;
    end;
  end loop;
  return v_token;
end;
$$;

revoke all on function public.set_my_member(uuid, uuid), public.delete_member(uuid),
  public.delete_trip(uuid), public.reset_share_token(uuid) from public, anon;
grant execute on function public.set_my_member(uuid, uuid), public.delete_member(uuid),
  public.delete_trip(uuid), public.reset_share_token(uuid) to authenticated;

-- Open trip pages pick up a new share token or name.
alter publication supabase_realtime add table public.trips;
