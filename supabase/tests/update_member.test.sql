begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222');
-- Only the owner can create trips (owner-account design §1).
insert into public.app_owners(user_id) values ('11111111-1111-4111-8111-111111111111');
create temporary table test_state(key text primary key, value jsonb);
grant all on test_state to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
insert into test_state values ('trip', public.create_trip('台南之旅','TWD','熊','bear'));
insert into test_state values ('amy', to_jsonb(public.add_member((select (value->>'trip_id')::uuid from test_state where key='trip'), '阿梅', 'penguin')));

select lives_ok($$select public.update_member((select (value #>> '{}')::uuid from test_state where key='amy'), '  阿美 ', 'penguin')$$, 'rename placeholder member');
select lives_ok($$select public.update_member((select (value #>> '{}')::uuid from test_state where key='amy'), '阿美', 'fox')$$, 'change avatar to an unused one');
select throws_ok($$select public.update_member((select (value #>> '{}')::uuid from test_state where key='amy'), '阿美', 'bear')$$, 'P0001', 'AVATAR_TAKEN', 'avatar used by another member rejected');
select throws_ok($$select public.update_member((select (value #>> '{}')::uuid from test_state where key='amy'), '  ', 'fox')$$, '23514', null, 'blank name rejected');
select throws_ok($$select public.update_member((select (value #>> '{}')::uuid from test_state where key='amy'), '阿美', 'unicorn')$$, '23514', null, 'unknown avatar rejected');
select throws_ok($$select public.update_member('00000000-0000-4000-8000-000000000000', '誰', 'cat')$$, '42501', 'TRIP_ACCESS_DENIED', 'missing member looks like no access');
reset role;
select is((select name || '/' || avatar_id from public.members where id = (select (value #>> '{}')::uuid from test_state where key='amy')), '阿美/fox', 'failed updates keep last good values');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok($$select public.update_member((select (value #>> '{}')::uuid from test_state where key='amy'), '亂改', 'cat')$$, '42501', 'TRIP_ACCESS_DENIED', 'nonmember cannot update member');
set local request.jwt.claims = '{"role":"authenticated"}';
select throws_ok($$select public.update_member(null, '熊', 'bear')$$, '42501', 'AUTH_REQUIRED', 'update requires uid');
reset role;
select ok(not has_function_privilege('anon','public.update_member(uuid,text,text)','execute'), 'anon cannot execute update_member');
select * from finish();
rollback;
