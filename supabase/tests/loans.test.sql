begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(12);
create temporary table ctx(bid uuid,lid uuid);
grant all on ctx to authenticated;
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-0000-0000-000000000031','loan-owner@test.invalid',now()),
 ('00000000-0000-0000-0000-000000000032','loan-viewer@test.invalid',now()),
 ('00000000-0000-0000-0000-000000000033','loan-outsider@test.invalid',now());
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000031',true);
insert into ctx select (public.flowledger_command('create_business','{"name":"Loan test","description":"","email":"","phone":"","address":"","currency":"LKR","timezone":"Asia/Colombo","opening_balance":"0","balance_date":"2026-01-01","business_days":[1,2,3,4,5]}') #>> '{}')::uuid,gen_random_uuid();
select public.loan_command('create',jsonb_build_object('business_id',bid,'id',lid,'title','Loan','total','1000','prior','100','monthly','400','start_date','2027-01-01','first_due','2027-01-31','end_date','2027-03-31')) from ctx;
select is((select count(*)::int from public.loan_instalments where loan_id=(select lid from ctx)),3,'three instalments');
select is((select sum(amount_minor)::bigint from public.loan_instalments where loan_id=(select lid from ctx)),90000::bigint,'exact remaining amount');
select is((select string_agg(due_date::text,',' order by occurrence) from public.loan_instalments where loan_id=(select lid from ctx)),'2027-01-31,2027-02-28,2027-03-31','month end anchoring');
select is((select amount_minor from public.loan_instalments where loan_id=(select lid from ctx) and occurrence=2),10000::bigint,'partial final instalment');
select public.loan_command('create',jsonb_build_object('business_id',bid,'id',lid,'title','Loan','total','1000','prior','100','monthly','400','start_date','2027-01-01','first_due','2027-01-31','end_date','2027-03-31')) from ctx;
select is((select count(*)::int from public.loan_instalments where loan_id=(select lid from ctx)),3,'retry does not duplicate');
select throws_ok($$update public.loans set title='forged'$$,'42501',null,'direct writes denied');
select public.loan_command('delete',jsonb_build_object('business_id',bid,'id',lid,'version',1)) from ctx;
select public.loan_command('restore',jsonb_build_object('business_id',bid,'id',lid,'version',2)) from ctx;
select is((select count(*)::int from public.loan_history where loan_id=(select lid from ctx)),3,'archive and restore audited');
reset role;
insert into public.business_members(business_id,user_id,role) select bid,'00000000-0000-0000-0000-000000000032','viewer' from ctx;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000032',true);
select is((select count(*)::int from public.loans where business_id=(select bid from ctx)),1,'viewer can read');
select throws_ok($$select public.loan_command('delete',jsonb_build_object('business_id',bid,'id',lid,'version',3)) from ctx$$,'P0001','permission denied','viewer cannot archive');
select is((select count(*)::int from public.loan_history where business_id=(select bid from ctx)),0,'viewer cannot read history');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000033',true);
select is((select count(*)::int from public.loans where business_id=(select bid from ctx)),0,'outsider cannot read');
select throws_ok($$select public.loan_command('delete',jsonb_build_object('business_id',bid,'id',lid,'version',3)) from ctx$$,'P0001','permission denied','outsider cannot mutate');
select * from finish();
rollback;
