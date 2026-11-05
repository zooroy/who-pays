-- Any member of a trip can rename or re-avatar any member of it (polish-after-first-trip design §5).
create function public.update_member(member_id uuid, name text, avatar_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_trip uuid; v_constraint text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  select m.trip_id into v_trip from public.members m where m.id = update_member.member_id;
  -- A missing member reports the same error, so callers learn nothing about other trips.
  if v_trip is null or not exists (
    select 1 from public.trip_access a where a.trip_id = v_trip and a.user_id = auth.uid()
  ) then
    raise exception using errcode = '42501', message = 'TRIP_ACCESS_DENIED';
  end if;
  update public.members m
  set name = btrim(update_member.name), avatar_id = update_member.avatar_id
  where m.id = update_member.member_id;
exception when unique_violation then
  get stacked diagnostics v_constraint = constraint_name;
  if v_constraint = 'members_trip_avatar_key' then
    raise exception using errcode = 'P0001', message = 'AVATAR_TAKEN';
  end if;
  raise;
end;
$$;

revoke all on function public.update_member(uuid, text, text) from public, anon;
grant execute on function public.update_member(uuid, text, text) to authenticated;
