create function public.create_trip(name text, default_currency text, member_name text, avatar_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_trip uuid;
  v_member uuid;
  v_token text := '';
  v_byte integer;
  v_constraint text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if name is null or btrim(name) = '' or member_name is null or btrim(member_name) = '' then
    raise exception using errcode = '22023', message = 'NAME_REQUIRED';
  end if;
  loop
    v_token := '';
    -- Rejection sampling avoids modulo bias; use cryptographic random bytes.
    while length(v_token) < 22 loop
      v_byte := get_byte(extensions.gen_random_bytes(1), 0);
      if v_byte < 248 then
        v_token := v_token || substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', v_byte % 62 + 1, 1);
      end if;
    end loop;
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
  insert into public.trip_access(trip_id, user_id) values (v_trip, auth.uid());
  return jsonb_build_object('trip_id', v_trip, 'share_token', v_token, 'member_id', v_member);
end;
$$;

create function public.join_trip(share_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_trip uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  select t.id into v_trip from public.trips t where t.share_token = join_trip.share_token;
  if v_trip is null then
    raise exception using errcode = 'P0002', message = 'TRIP_NOT_FOUND';
  end if;
  insert into public.trip_access(trip_id, user_id) values (v_trip, auth.uid()) on conflict do nothing;
  return v_trip;
end;
$$;

create function public.add_member(trip_id uuid, name text, avatar_id text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_member uuid; v_constraint text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if not exists (select 1 from public.trip_access a where a.trip_id = add_member.trip_id and a.user_id = auth.uid()) then
    raise exception using errcode = '42501', message = 'TRIP_ACCESS_DENIED';
  end if;
  insert into public.members(trip_id, name, avatar_id)
  values (trip_id, btrim(name), avatar_id) returning id into v_member;
  return v_member;
exception when unique_violation then
  get stacked diagnostics v_constraint = constraint_name;
  if v_constraint = 'members_trip_avatar_key' then
    raise exception using errcode = 'P0001', message = 'AVATAR_TAKEN';
  end if;
  raise;
end;
$$;

-- Full replacement payload; id is omitted on create, required on update.
create function public.upsert_expense(payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_trip uuid;
  v_id uuid;
  v_actor uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  v_trip := (payload->>'trip_id')::uuid;
  if not exists (select 1 from public.trip_access a where a.trip_id = v_trip and a.user_id = auth.uid()) then
    raise exception using errcode = '42501', message = 'TRIP_ACCESS_DENIED';
  end if;
  if jsonb_typeof(payload->'split_member_ids') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'SPLITTERS_REQUIRED';
  end if;
  if jsonb_array_length(payload->'split_member_ids') = 0 then
    raise exception using errcode = '22023', message = 'SPLITTERS_REQUIRED';
  end if;
  if payload ? 'items' and jsonb_typeof(payload->'items') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'INVALID_ITEMS';
  end if;
  v_actor := (payload->>'member_id')::uuid;
  if not exists (select 1 from public.members m where m.trip_id = v_trip and m.id = v_actor) then
    raise exception using errcode = '22023', message = 'INVALID_MEMBER';
  end if;
  v_id := (payload->>'id')::uuid;
  if v_id is null then
    insert into public.expenses(trip_id, title, amount, currency, spent_on, paid_by, receipt_path, receipt_raw, created_by, updated_by)
    values (v_trip, payload->>'title', (payload->>'amount')::bigint, payload->>'currency',
      (payload->>'spent_on')::date, (payload->>'paid_by')::uuid, payload->>'receipt_path',
      nullif(payload->'receipt_raw', 'null'::jsonb), v_actor, v_actor)
    returning id into v_id;
  else
    -- The row lock serializes simultaneous full replacements, including child rows.
    perform 1 from public.expenses e where e.id = v_id and e.trip_id = v_trip for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'EXPENSE_NOT_FOUND';
    end if;
    update public.expenses set
      title = payload->>'title', amount = (payload->>'amount')::bigint,
      currency = payload->>'currency', spent_on = (payload->>'spent_on')::date,
      paid_by = (payload->>'paid_by')::uuid, receipt_path = payload->>'receipt_path',
      receipt_raw = nullif(payload->'receipt_raw', 'null'::jsonb),
      updated_by = v_actor, updated_at = clock_timestamp()
    where id = v_id;
    delete from public.expense_splits where expense_id = v_id;
    delete from public.expense_items where expense_id = v_id;
  end if;
  insert into public.expense_splits(trip_id, expense_id, member_id)
  select v_trip, v_id, value::uuid from jsonb_array_elements_text(payload->'split_member_ids');
  insert into public.expense_items(trip_id, expense_id, position, name, name_zh, qty, unit_price, amount)
  select v_trip, v_id, (ordinality - 1)::integer, item->>'name', item->>'name_zh',
    (item->>'qty')::numeric, (item->>'unit_price')::bigint, (item->>'amount')::bigint
  from jsonb_array_elements(coalesce(payload->'items', '[]'::jsonb)) with ordinality as items(item, ordinality);
  return v_id;
end;
$$;

create function public.delete_expense(expense_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_trip uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  select e.trip_id into v_trip from public.expenses e where e.id = expense_id for update;
  if not exists (select 1 from public.trip_access a where a.trip_id = v_trip and a.user_id = auth.uid()) then
    raise exception using errcode = '42501', message = 'TRIP_ACCESS_DENIED';
  end if;
  delete from public.expenses where id = expense_id;
end;
$$;

revoke all on function public.create_trip(text,text,text,text), public.join_trip(text),
  public.add_member(uuid,text,text), public.upsert_expense(jsonb), public.delete_expense(uuid) from public, anon;
grant execute on function public.create_trip(text,text,text,text), public.join_trip(text),
  public.add_member(uuid,text,text), public.upsert_expense(jsonb), public.delete_expense(uuid) to authenticated;
