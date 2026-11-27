begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(15);
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-0000-0000-000000000001','owner@test.invalid',now()),
 ('00000000-0000-0000-0000-000000000002','viewer@test.invalid',now()),
 ('00000000-0000-0000-0000-000000000003','outsider@test.invalid',now());
insert into public.businesses(id,owner_id,name,currency,timezone,opening_balance,balance_date,business_days) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Test','LKR','Asia/Colombo',0,current_date,array[1,2,3,4,5]);
insert into public.business_members(business_id,user_id,role) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','owner'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','viewer');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select is((select count(*)::integer from public.businesses),0,'outsider cannot read business');
select throws_ok($$select public.flowledger_command('archive_business','{"business_id":"10000000-0000-0000-0000-000000000001","archived":true}')$$,'P0001','permission denied','outsider cannot mutate');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select is((select count(*)::integer from public.businesses),1,'viewer reads own business');
select throws_ok($$select public.flowledger_command('archive_business','{"business_id":"10000000-0000-0000-0000-000000000001","archived":true}')$$,'P0001','permission denied','viewer cannot archive');
select throws_ok($$update public.businesses set name='Hacked'$$,'42501',null,'direct table writes denied');
select throws_ok($$select token_hash from public.business_invitations$$,'42501',null,'invitation hash inaccessible');
select throws_ok($$select public.flowledger_save_business('update_business','{"business_id":"10000000-0000-0000-0000-000000000001","name":"Test","description":"","email":"","phone":"","address":"","currency":"LKR","timezone":"Asia/Colombo","opening_balance":"0","balance_date":"2026-11-28","business_days":[1,2,3,4,5],"country_code":"LK"}')$$,'P0001','permission denied','viewer cannot change the business country');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.flowledger_save_business('update_business','{"business_id":"10000000-0000-0000-0000-000000000001","name":"Test","description":"","email":"","phone":"","address":"","currency":"LKR","timezone":"Asia/Colombo","opening_balance":"0","balance_date":"2026-11-28","business_days":[1,2,3,4,5],"country_code":"LK"}')$$,'owner can set a business country');
select is((select country_code from public.businesses where id='10000000-0000-0000-0000-000000000001'),'LK','country is persisted');
select lives_ok($$select public.flowledger_command('update_business','{"business_id":"10000000-0000-0000-0000-000000000001","name":"Test","description":"","email":"","phone":"","address":"","currency":"LKR","timezone":"Asia/Colombo","opening_balance":"0","balance_date":"2026-11-28","business_days":[1,2,3,4,5]}')$$,'older client can update business settings');
select is((select country_code from public.businesses where id='10000000-0000-0000-0000-000000000001'),'LK','older client preserves the saved country');
select throws_ok($$select public.flowledger_save_business('update_business','{"business_id":"10000000-0000-0000-0000-000000000001","name":"Test","description":"","email":"","phone":"","address":"","currency":"LKR","timezone":"Asia/Colombo","opening_balance":"0","balance_date":"2026-11-28","business_days":[1,2,3,4,5],"country_code":"LKA"}')$$,'P0001','invalid business country','invalid country is rejected');
select lives_ok($$select public.flowledger_command('remove_viewer','{"business_id":"10000000-0000-0000-0000-000000000001","user_id":"00000000-0000-0000-0000-000000000001"}')$$,'owner removal is harmless');
select is((select count(*)::integer from public.business_members where role='owner'),1,'owner membership preserved');
select lives_ok($$select public.flowledger_command('archive_business','{"business_id":"10000000-0000-0000-0000-000000000001","archived":true}')$$,'owner may archive');
select * from finish();
rollback;
