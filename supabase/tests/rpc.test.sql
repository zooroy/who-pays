begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222');
-- Temporary state is accessible to the caller; assertions on protected tables run
-- as postgres, so they only count rows of the trips this test creates (a local
-- database may already hold other data).
-- Only the owner can create trips (owner-account design §1).
insert into public.app_owners(user_id) values ('11111111-1111-4111-8111-111111111111');
create temporary table test_state(key text primary key, value jsonb);
grant all on test_state to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$insert into test_state values ('trip', public.create_trip('東京 2026','JPY','熊','bear'))$$, 'create_trip succeeds');
select throws_ok($$select public.create_trip('  ','JPY','熊','bear')$$, '22023', 'NAME_REQUIRED', 'blank trip name rejected');
select throws_ok($$select public.create_trip('東京','JPY',' ','bear')$$, '22023', 'NAME_REQUIRED', 'blank member name rejected');
select lives_ok($$insert into test_state values ('other', public.create_trip('另一旅程','TWD','貓','cat'))$$, 'second trip');
select lives_ok($$insert into test_state values ('member', to_jsonb(public.add_member((select (value->>'trip_id')::uuid from test_state where key='trip'), '貓', 'cat')))$$, 'add placeholder member');
select throws_ok($$select public.add_member((select (value->>'trip_id')::uuid from test_state where key='trip'), '重複熊', 'bear')$$, 'P0001', 'AVATAR_TAKEN', 'duplicate avatar identifiable');
insert into test_state
select 'payload', jsonb_build_object('trip_id', value->>'trip_id', 'member_id', value->>'member_id',
 'title','計程車', 'amount',3000,'currency','JPY','spent_on','2026-11-03',
 'paid_by',value->>'member_id','split_member_ids',jsonb_build_array(value->>'member_id'),
 'items',jsonb_build_array(jsonb_build_object('name','車資','qty',1,'unit_price',3000,'amount',3000)))
from test_state where key='trip';
select lives_ok($$insert into test_state values ('expense', to_jsonb(public.upsert_expense((select value from test_state where key='payload'))))$$, 'create expense with children');
select throws_ok($$select public.upsert_expense((select value || '{"split_member_ids":[]}'::jsonb from test_state where key='payload'))$$, '22023','SPLITTERS_REQUIRED','empty split rejected');
select throws_ok($$select public.upsert_expense((select value || '{"amount":0}'::jsonb from test_state where key='payload'))$$, '23514', null, 'zero amount rejected');
select throws_ok($$select public.upsert_expense((select value || '{"amount":-1}'::jsonb from test_state where key='payload'))$$, '23514', null, 'negative amount rejected');
select throws_ok($$select public.upsert_expense((select value || jsonb_build_object('paid_by',(select value->>'member_id' from test_state where key='other')) from test_state where key='payload'))$$, '23503',null,'cross-trip payer rejected');
select throws_ok($$select public.upsert_expense((select value || jsonb_build_object('split_member_ids',jsonb_build_array((select value->>'member_id' from test_state where key='other'))) from test_state where key='payload'))$$, '23503',null,'cross-trip splitter rolls back inserted expense');
select throws_ok($$select public.upsert_expense((select value || jsonb_build_object('member_id',(select value->>'member_id' from test_state where key='other')) from test_state where key='payload'))$$, '22023','INVALID_MEMBER','cross-trip author rejected');
reset role;
select is((select count(*) from public.expenses where trip_id in (select (value->>'trip_id')::uuid from test_state where key in ('trip','other'))),1::bigint,'failed creates leave no expenses');
select is((select count(*) from public.expense_splits where trip_id in (select (value->>'trip_id')::uuid from test_state where key in ('trip','other'))),1::bigint,'failed creates leave no splits');
select is((select count(*) from public.expense_items where trip_id in (select (value->>'trip_id')::uuid from test_state where key in ('trip','other'))),1::bigint,'failed creates leave no items');
select ok((select value->>'share_token' ~ '^[A-Za-z0-9]{22}$' from test_state where key='trip'), 'base62 token length');
select is((select count(*) from public.trip_access where trip_id in (select (value->>'trip_id')::uuid from test_state where key in ('trip','other'))),2::bigint,'creator access created');
select is((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity),8::bigint,'all eight tables have RLS (incl. app_owners)');
update test_state set value = value || jsonb_build_object('id',(select value #>> '{}' from test_state where key='expense')) where key='payload';
set local role authenticated;
select throws_ok($$select public.upsert_expense((select value || '{"split_member_ids":[]}'::jsonb from test_state where key='payload'))$$,'22023','SPLITTERS_REQUIRED','empty split update rejected');
select throws_ok($$select public.upsert_expense((select value || '{"title":"不應保留","items":[{"name":"壞品項","qty":0,"amount":0}]}'::jsonb from test_state where key='payload'))$$,'23514',null,'late item failure rolls back update and child replacement');
reset role;
select is((select title from public.expenses where trip_id in (select (value->>'trip_id')::uuid from test_state where key in ('trip','other'))),'計程車','failed update preserves parent');
select is((select count(*) from public.expense_splits where trip_id in (select (value->>'trip_id')::uuid from test_state where key in ('trip','other'))),1::bigint,'failed update preserves split');
select is((select amount from public.expense_items where trip_id in (select (value->>'trip_id')::uuid from test_state where key in ('trip','other'))),3000::bigint,'failed update preserves item');
set local role authenticated;
select lives_ok($$select public.upsert_expense((select value || jsonb_build_object('amount',4000,'member_id',(select value #>> '{}' from test_state where key='member'),'split_member_ids',jsonb_build_array((select value #>> '{}' from test_state where key='member')),'items','[]'::jsonb) from test_state where key='payload'))$$,'update replaces children and author');
reset role;
select is((select amount from public.expenses where trip_id in (select (value->>'trip_id')::uuid from test_state where key in ('trip','other'))),4000::bigint,'amount updated');
select is((select updated_by::text from public.expenses where trip_id in (select (value->>'trip_id')::uuid from test_state where key in ('trip','other'))),(select value #>> '{}' from test_state where key='member'),'last modifier updated');
select is((select created_by::text from public.expenses where trip_id in (select (value->>'trip_id')::uuid from test_state where key in ('trip','other'))),(select value->>'member_id' from test_state where key='trip'),'creator preserved');
select is((select member_id::text from public.expense_splits where trip_id in (select (value->>'trip_id')::uuid from test_state where key in ('trip','other'))),(select value #>> '{}' from test_state where key='member'),'splits replaced');
select is((select count(*) from public.expense_items where trip_id in (select (value->>'trip_id')::uuid from test_state where key in ('trip','other'))),0::bigint,'items replaced');
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok($$select public.add_member((select (value->>'trip_id')::uuid from test_state where key='trip'),'狐狸','fox')$$,'42501','TRIP_ACCESS_DENIED','nonmember cannot add member');
select throws_ok($$select public.upsert_expense((select value from test_state where key='payload'))$$,'42501','TRIP_ACCESS_DENIED','nonmember cannot update expense');
select throws_ok($$select public.upsert_expense((select value - 'id' from test_state where key='payload'))$$,'42501','TRIP_ACCESS_DENIED','nonmember cannot create expense');
select throws_ok($$select public.delete_expense((select (value #>> '{}')::uuid from test_state where key='expense'))$$,'42501','TRIP_ACCESS_DENIED','nonmember cannot delete expense');
select throws_ok($$select public.join_trip('invalid')$$,'P0002','TRIP_NOT_FOUND','invalid token identifiable');
select is(public.join_trip((select value->>'share_token' from test_state where key='trip'))::text,(select value->>'trip_id' from test_state where key='trip'),'valid join returns trip');
select lives_ok($$select public.join_trip((select value->>'share_token' from test_state where key='trip'))$$,'join idempotent');
reset role;
select is((select count(*) from public.trip_access where user_id='22222222-2222-4222-8222-222222222222'),1::bigint,'join writes access once');
set local role authenticated;
select lives_ok($$select public.upsert_expense((select value from test_state where key='payload'))$$,'joined caller can update');
select lives_ok($$select public.delete_expense((select (value #>> '{}')::uuid from test_state where key='expense'))$$,'joined caller can delete');
reset role;
select is((select count(*) from public.expenses where trip_id in (select (value->>'trip_id')::uuid from test_state where key in ('trip','other'))),0::bigint,'expense removed');
select is((select count(*) from public.expense_splits where trip_id in (select (value->>'trip_id')::uuid from test_state where key in ('trip','other'))),0::bigint,'splits cascade');
select is((select count(*) from public.expense_items where trip_id in (select (value->>'trip_id')::uuid from test_state where key in ('trip','other'))),0::bigint,'items cascade');
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select throws_ok($$select public.create_trip('東京','JPY','熊','bear')$$,'42501','AUTH_REQUIRED','create requires uid');
select throws_ok($$select public.join_trip('invalid')$$,'42501','AUTH_REQUIRED','join requires uid');
select throws_ok($$select public.add_member(null,'熊','bear')$$,'42501','AUTH_REQUIRED','add requires uid');
select throws_ok($$select public.upsert_expense('{}')$$,'42501','AUTH_REQUIRED','upsert requires uid');
select throws_ok($$select public.delete_expense(null)$$,'42501','AUTH_REQUIRED','delete requires uid');
reset role;
select ok(not has_function_privilege('anon','public.create_trip(text,text,text,text)','execute'),'anon cannot execute create');
select * from finish();
rollback;
