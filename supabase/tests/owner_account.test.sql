begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- O is the owner, F a friend who joins by link, S a stranger.
insert into auth.users(id) values
 ('0a000000-0000-4000-8000-000000000001'),
 ('0f000000-0000-4000-8000-000000000002'),
 ('05000000-0000-4000-8000-000000000003');
insert into public.app_owners(user_id) values ('0a000000-0000-4000-8000-000000000001');
create temporary table s(key text primary key, value jsonb);
grant all on s to authenticated;
-- Returns the error detail a statement raises (pgTAP only checks code and message).
create function pg_temp.error_detail(q text) returns text language plpgsql as $$
declare d text;
begin
  execute q;
  return 'no error';
exception when others then
  get stacked diagnostics d = pg_exception_detail;
  return d;
end;
$$;
create function pg_temp.id(k text) returns uuid language sql as $$
  select (case when jsonb_typeof(value) = 'object' then value->>'trip_id' else value #>> '{}' end)::uuid
  from s where key = k;
$$;

-- Owner creates a trip and its members.
set local role authenticated;
set local request.jwt.claims = '{"sub":"0a000000-0000-4000-8000-000000000001","role":"authenticated"}';
select ok(public.is_owner(), 'owner is recognised');
select lives_ok($$insert into s values ('trip', public.create_trip('台南之旅','TWD','熊','bear'))$$, 'owner creates trip');
insert into s values ('other', public.create_trip('東京 2026','JPY','熊','bear'));
insert into s select 'bear', value->'member_id' from s where key = 'trip';
insert into s values ('cat', to_jsonb(public.add_member(pg_temp.id('trip'), '阿美', 'cat')));
insert into s values ('fox', to_jsonb(public.add_member(pg_temp.id('trip'), '小華', 'fox')));
insert into s values ('dog', to_jsonb(public.add_member(pg_temp.id('trip'), '小明', 'dog')));
insert into s values ('owl', to_jsonb(public.add_member(pg_temp.id('trip'), '阿德', 'owl')));
select is((select member_id from public.trip_access where trip_id = pg_temp.id('trip')), pg_temp.id('bear'),
  'create_trip stores the creator identity');

-- Stranger: not an owner, no access.
set local request.jwt.claims = '{"sub":"05000000-0000-4000-8000-000000000003","role":"authenticated"}';
select ok(not public.is_owner(), 'stranger is not an owner');
select throws_ok($$select public.create_trip('偷建','TWD','貓','cat')$$, '42501', 'OWNER_REQUIRED', 'non-owner cannot create trip');
select throws_ok($$select public.set_my_member(pg_temp.id('trip'), pg_temp.id('cat'))$$, '42501', 'TRIP_ACCESS_DENIED', 'stranger cannot set identity');
select throws_ok($$select public.delete_member(pg_temp.id('dog'))$$, '42501', 'TRIP_ACCESS_DENIED', 'stranger cannot delete member');
select is((select count(*) from public.trips where id = pg_temp.id('trip')), 0::bigint, 'stranger cannot read trip');

-- Friend joins and picks an identity.
set local request.jwt.claims = '{"sub":"0f000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok($$select public.join_trip((select value->>'share_token' from s where key = 'trip'))$$, 'friend joins');
select lives_ok($$select public.set_my_member(pg_temp.id('trip'), pg_temp.id('cat'))$$, 'friend sets identity');
select is((select member_id from public.trip_access where trip_id = pg_temp.id('trip')), pg_temp.id('cat'), 'identity stored');
select throws_ok($$select public.set_my_member(pg_temp.id('trip'), (select (value->>'member_id')::uuid from s where key = 'other'))$$,
  '42501', 'TRIP_ACCESS_DENIED', 'member of another trip rejected');
select lives_ok($$select public.set_my_member(pg_temp.id('trip'), null)$$, 'friend clears identity');
select is((select member_id from public.trip_access where trip_id = pg_temp.id('trip')), null::uuid, 'identity cleared');
select is((select count(*) from public.trips where id = pg_temp.id('other')), 0::bigint, 'friend cannot read other trips');
select throws_ok($$select public.create_trip('朋友建','TWD','貓','cat')$$, '42501', 'OWNER_REQUIRED', 'friend cannot create trip');

-- Records: cat paid expense 1 (split cat, fox); fox paid expense 2 (split cat);
-- bear paid owl back. dog has nothing.
select public.upsert_expense(jsonb_build_object('trip_id', pg_temp.id('trip'), 'member_id', pg_temp.id('cat'),
  'title','牛肉湯','amount',300,'currency','TWD','spent_on','2026-11-06','paid_by', pg_temp.id('cat'),
  'split_member_ids', jsonb_build_array(pg_temp.id('cat'), pg_temp.id('fox'))));
select public.upsert_expense(jsonb_build_object('trip_id', pg_temp.id('trip'), 'member_id', pg_temp.id('fox'),
  'title','豆花','amount',80,'currency','TWD','spent_on','2026-11-06','paid_by', pg_temp.id('fox'),
  'split_member_ids', jsonb_build_array(pg_temp.id('cat'))));
insert into public.settlements(trip_id, from_member, to_member, amount, currency, created_by)
values (pg_temp.id('trip'), pg_temp.id('bear'), pg_temp.id('owl'), 100, 'TWD', pg_temp.id('bear'));

select throws_ok($$select public.delete_member(pg_temp.id('cat'))$$, 'P0001', 'MEMBER_HAS_RECORDS', 'payer and splitter kept');
select is(pg_temp.error_detail($$select public.delete_member(pg_temp.id('cat'))$$), '2', 'cat has 2 records');
select is(pg_temp.error_detail($$select public.delete_member(pg_temp.id('fox'))$$), '2', 'fox has 2 records');
select throws_ok($$select public.delete_member(pg_temp.id('owl'))$$, 'P0001', 'MEMBER_HAS_RECORDS', 'settlement receiver kept');
select is(pg_temp.error_detail($$select public.delete_member(pg_temp.id('owl'))$$), '1', 'owl has 1 record');
select is(pg_temp.error_detail($$select public.delete_member(pg_temp.id('bear'))$$), '1', 'settlement payer and creator count once');

-- Deleting a member someone uses clears that identity but keeps access.
select public.set_my_member(pg_temp.id('trip'), pg_temp.id('dog'));
select lives_ok($$select public.delete_member(pg_temp.id('dog'))$$, 'friend deletes member without records');
select is((select count(*) from public.members where id = pg_temp.id('dog')), 0::bigint, 'member deleted');
select is((select member_id from public.trip_access where trip_id = pg_temp.id('trip')), null::uuid, 'identity of deleted member cleared');
select ok(public.has_trip_access(pg_temp.id('trip')), 'access kept after member deleted');
select lives_ok($$select public.add_member(pg_temp.id('trip'), '小明', 'dog')$$, 'avatar free again');

-- Owner reads every trip, even without an access row, including receipts.
reset role;
delete from public.trip_access where user_id = '0a000000-0000-4000-8000-000000000001' and trip_id = pg_temp.id('trip');
insert into storage.objects(bucket_id, name) values ('receipts', pg_temp.id('trip') || '/r.jpg');
set local role authenticated;
set local request.jwt.claims = '{"sub":"0a000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*) from public.trips where id = pg_temp.id('trip')), 1::bigint, 'owner reads trip without access row');
select is((select count(*) from public.expenses where trip_id = pg_temp.id('trip')), 2::bigint, 'owner reads expenses');
select is((select count(*) from storage.objects where bucket_id = 'receipts' and name like pg_temp.id('trip') || '/%'), 1::bigint, 'owner reads receipts');
select lives_ok($$select public.set_my_member(pg_temp.id('trip'), pg_temp.id('bear'))$$, 'owner sets identity without joining');
select is((select member_id from public.trip_access where trip_id = pg_temp.id('trip')), pg_temp.id('bear'), 'owner identity stored');

-- Reset share link: owner only; old link stops working, joined friend keeps access.
set local request.jwt.claims = '{"sub":"0f000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$select public.reset_share_token(pg_temp.id('trip'))$$, '42501', 'OWNER_REQUIRED', 'friend cannot reset link');
select throws_ok($$select public.delete_trip(pg_temp.id('trip'))$$, '42501', 'OWNER_REQUIRED', 'friend cannot delete trip');
set local request.jwt.claims = '{"sub":"0a000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$insert into s values ('token', to_jsonb(public.reset_share_token(pg_temp.id('trip'))))$$, 'owner resets link');
select ok((select value #>> '{}' from s where key = 'token') ~ '^[A-Za-z0-9]{22}$', 'new token is base62');
select isnt((select value #>> '{}' from s where key = 'token'), (select value->>'share_token' from s where key = 'trip'), 'token changed');
select throws_ok($$select public.reset_share_token(gen_random_uuid())$$, 'P0002', 'TRIP_NOT_FOUND', 'reset missing trip');
set local request.jwt.claims = '{"sub":"05000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok($$select public.join_trip((select value->>'share_token' from s where key = 'trip'))$$, 'P0002', 'TRIP_NOT_FOUND', 'old link no longer joins');
set local request.jwt.claims = '{"sub":"0f000000-0000-4000-8000-000000000002","role":"authenticated"}';
select ok(public.has_trip_access(pg_temp.id('trip')), 'joined friend keeps access');
select is((select share_token from public.trips where id = pg_temp.id('trip')), (select value #>> '{}' from s where key = 'token'), 'friend sees new token');

-- Delete trip: owner only, removes everything.
set local request.jwt.claims = '{"sub":"0a000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$select public.delete_trip(gen_random_uuid())$$, 'P0002', 'TRIP_NOT_FOUND', 'delete missing trip');
select lives_ok($$select public.delete_trip(pg_temp.id('trip'))$$, 'owner deletes trip');
reset role;
select is((select count(*) from public.trips where id = pg_temp.id('trip')), 0::bigint, 'trip gone');
select is((select count(*) from public.members where trip_id = pg_temp.id('trip')), 0::bigint, 'members gone');
select is((select count(*) from public.expenses where trip_id = pg_temp.id('trip')), 0::bigint, 'expenses gone');
select is((select count(*) from public.expense_splits where trip_id = pg_temp.id('trip')), 0::bigint, 'splits gone');
select is((select count(*) from public.settlements where trip_id = pg_temp.id('trip')), 0::bigint, 'settlements gone');
select is((select count(*) from public.trip_access where trip_id = pg_temp.id('trip')), 0::bigint, 'access rows gone');
select is((select count(*) from public.trips where id = pg_temp.id('other')), 1::bigint, 'other trip untouched');

-- No session and the anon role get nothing.
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select throws_ok($$select public.set_my_member(pg_temp.id('other'), null)$$, '42501', 'AUTH_REQUIRED', 'set identity requires uid');
select throws_ok($$select public.delete_trip(pg_temp.id('other'))$$, '42501', 'AUTH_REQUIRED', 'delete trip requires uid');
reset role;
select ok(not has_function_privilege('anon', 'public.set_my_member(uuid,uuid)', 'execute'), 'anon cannot set identity');
select ok(not has_function_privilege('anon', 'public.delete_member(uuid)', 'execute'), 'anon cannot delete member');
select ok(not has_function_privilege('anon', 'public.delete_trip(uuid)', 'execute'), 'anon cannot delete trip');
select ok(not has_function_privilege('anon', 'public.reset_share_token(uuid)', 'execute'), 'anon cannot reset link');
select ok(not has_function_privilege('authenticated', 'public.new_share_token()', 'execute'), 'token helper is internal');
select ok(not has_table_privilege('authenticated', 'public.app_owners', 'select'), 'owner list is hidden');
select ok(not has_table_privilege('authenticated', 'public.app_owners', 'insert'), 'nobody can make themselves owner');

select * from finish();
rollback;
