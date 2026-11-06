begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- owner creates a trip with data; stranger has no access; friend joins by token.
insert into auth.users(id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc');

-- Only the owner can create trips (owner-account design §1).
insert into public.app_owners(user_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
create temporary table t(key text primary key, value jsonb);
grant all on t to authenticated, anon;

-- Owner
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into t values ('trip', public.create_trip('東京 2026', 'JPY', '熊', 'bear'));
insert into t values ('cat', to_jsonb(public.add_member((select (value->>'trip_id')::uuid from t where key = 'trip'), '貓', 'cat')));
select public.upsert_expense(jsonb_build_object(
  'trip_id', value->>'trip_id', 'member_id', value->>'member_id', 'title', '一蘭', 'amount', 3240,
  'currency', 'JPY', 'spent_on', '2026-11-02', 'paid_by', value->>'member_id',
  'split_member_ids', jsonb_build_array(value->>'member_id'),
  'items', jsonb_build_array(jsonb_build_object('name', 'ラーメン', 'name_zh', '拉麵', 'qty', 1, 'amount', 3240))))
from t where key = 'trip';
insert into public.settlements(trip_id, from_member, to_member, amount, currency, created_by)
select (tr.value->>'trip_id')::uuid, (c.value #>> '{}')::uuid, (tr.value->>'member_id')::uuid, 100, 'JPY', (tr.value->>'member_id')::uuid
from t tr, t c where tr.key = 'trip' and c.key = 'cat';
insert into storage.objects(bucket_id, name)
select 'receipts', (value->>'trip_id') || '/r1.jpg' from t where key = 'trip';

-- Scoped to this test's trip: the owner can read every trip in a local database.
select is((select count(*) from public.trips where id = (select (value->>'trip_id')::uuid from t where key = 'trip'))::int, 1, 'owner sees the trip');
select is((select count(*) from public.members where trip_id = (select (value->>'trip_id')::uuid from t where key = 'trip'))::int, 2, 'owner sees members');
select is((select count(*) from public.expenses where trip_id = (select (value->>'trip_id')::uuid from t where key = 'trip'))::int, 1, 'owner sees expenses');
select is((select count(*) from public.expense_splits where trip_id = (select (value->>'trip_id')::uuid from t where key = 'trip'))::int, 1, 'owner sees splits');
select is((select count(*) from public.expense_items where trip_id = (select (value->>'trip_id')::uuid from t where key = 'trip'))::int, 1, 'owner sees items');
select is((select count(*) from public.settlements where trip_id = (select (value->>'trip_id')::uuid from t where key = 'trip'))::int, 1, 'owner sees settlements');
select is((select count(*) from storage.objects where bucket_id = 'receipts' and name like (select (value->>'trip_id')::uuid from t where key = 'trip') || '/%')::int, 1, 'owner sees the receipt');

-- Stranger: authenticated but never joined.
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';
select is((select count(*) from public.trips)::int, 0, 'stranger cannot list trips');
select is((select count(*) from public.trip_access)::int, 0, 'stranger cannot see access rows');
select is((select count(*) from public.members)::int, 0, 'stranger cannot see members');
select is((select count(*) from public.expenses)::int, 0, 'stranger cannot see expenses');
select is((select count(*) from public.expense_splits)::int, 0, 'stranger cannot see splits');
select is((select count(*) from public.expense_items)::int, 0, 'stranger cannot see items');
select is((select count(*) from public.settlements)::int, 0, 'stranger cannot see settlements');
select is((select count(*) from storage.objects where bucket_id = 'receipts')::int, 0, 'stranger cannot see receipts');

select throws_ok(
  $$insert into public.settlements(trip_id, from_member, to_member, amount, currency, created_by)
    select (tr.value->>'trip_id')::uuid, (c.value #>> '{}')::uuid, (tr.value->>'member_id')::uuid, 1, 'JPY', (tr.value->>'member_id')::uuid
    from t tr, t c where tr.key = 'trip' and c.key = 'cat'$$,
  '42501', null, 'stranger cannot record a settlement');
select throws_ok($$insert into public.trips(share_token, name, default_currency) values ('AAAAAAAAAAAAAAAAAAAAAA', 'x', 'JPY')$$,
  '42501', null, 'direct trip insert is not allowed');
select throws_ok($$insert into public.trip_access(trip_id, user_id) select (value->>'trip_id')::uuid, auth.uid() from t where key = 'trip'$$,
  '42501', null, 'cannot grant yourself access without the token');
select throws_ok($$insert into storage.objects(bucket_id, name) select 'receipts', (value->>'trip_id') || '/evil.jpg' from t where key = 'trip'$$,
  '42501', null, 'stranger cannot upload into the trip folder');
select throws_ok($$insert into storage.objects(bucket_id, name) values ('receipts', 'not-a-uuid/x.jpg')$$,
  '42501', null, 'uploads outside a trip folder are rejected');

select throws_ok($$update public.expenses set amount = 1$$, '42501', null, 'stranger cannot update expenses');
-- Deletes by the stranger silently affect zero rows.
delete from public.settlements;
-- Storage deletes cannot be issued in SQL (storage.protect_delete); the delete
-- policy is exercised through the Storage API in task 6.4.

-- Friend joins with the token and sees everything, unchanged.
set local request.jwt.claims = '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}';
select is((select count(*) from public.expenses)::int, 0, 'before joining the friend sees nothing');
select lives_ok($$select public.join_trip((select value->>'share_token' from t where key = 'trip'))$$, 'friend joins by token');
select is((select count(*) from public.trips)::int, 1, 'after joining the friend sees the trip');
select is((select amount from public.expenses), 3240::bigint, 'stranger update had no effect');
select is((select count(*) from public.settlements)::int, 1, 'stranger delete had no effect');
select is((select count(*) from storage.objects where bucket_id = 'receipts')::int, 1, 'receipt survived and is visible to the friend');
select throws_ok($$update public.expenses set amount = 1$$, '42501', null, 'direct expense updates are not allowed even for members');
select lives_ok(
  $$delete from public.settlements$$, 'members can delete (undo) settlements');
select is((select count(*) from public.settlements)::int, 0, 'settlement deleted');

-- No session at all.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select count(*) from public.trips$$, '42501', null, 'anon role has no table access');

select * from finish();
rollback;
