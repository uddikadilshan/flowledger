-- Phase 2B: contractual loan balances, not payment transactions.
create table public.loans (
 id uuid primary key, business_id uuid not null references public.businesses(id),
 title text not null check(length(trim(title)) between 1 and 100),
 lender text not null default '' check(length(lender)<=150),
 total_minor bigint not null check(total_minor between 1 and 99999999999999),
 prior_minor bigint not null check(prior_minor>=0 and prior_minor<=total_minor),
 monthly_minor bigint not null check(monthly_minor between 1 and 99999999999999),
 start_date date not null, first_due date not null, end_date date not null,
 version integer not null default 1, deleted_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(business_id,id), check(start_date<=first_due and first_due<=end_date)
);
create table public.loan_instalments (
 id uuid primary key default gen_random_uuid(), business_id uuid not null,
 loan_id uuid not null, occurrence integer not null, due_date date not null,
 amount_minor bigint not null check(amount_minor>0),
 foreign key(business_id,loan_id) references public.loans(business_id,id),
 unique(loan_id,occurrence)
);
create table public.loan_history (
 id bigint generated always as identity primary key, business_id uuid not null references public.businesses(id),
 loan_id uuid not null references public.loans(id), actor_id uuid not null references auth.users(id),
 action text not null, before_record jsonb, after_record jsonb not null, created_at timestamptz not null default now()
);
create index loans_business on public.loans(business_id,id);
create index loan_instalments_due on public.loan_instalments(business_id,due_date);
create index loan_history_entity on public.loan_history(business_id,loan_id,id);
alter table public.loans enable row level security;
alter table public.loan_instalments enable row level security;
alter table public.loan_history enable row level security;
revoke all on public.loans,public.loan_instalments,public.loan_history from public,anon,authenticated;
grant select on public.loans,public.loan_instalments,public.loan_history to authenticated;
create policy loans_read on public.loans for select to authenticated using(private.can_read(business_id));
create policy loan_instalments_read on public.loan_instalments for select to authenticated using(private.can_read(business_id));
create policy loan_history_read on public.loan_history for select to authenticated using(private.is_owner(business_id));
create function private.loan_currency_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.currency<>old.currency and exists(select 1 from public.loans where business_id=old.id) then raise exception 'Currency cannot change after loans are recorded'; end if;
 return new;
end $$;
revoke all on function private.loan_currency_guard() from public,anon,authenticated;
create trigger loan_currency_guard before update of currency on public.businesses for each row execute function private.loan_currency_guard();
create function private.loan_command(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); bid uuid:=(payload->>'business_id')::uuid;
 lid uuid:=(payload->>'id')::uuid; b public.businesses; oldrow public.loans; newrow public.loans;
 total bigint; prior bigint; monthly bigint; remaining bigint; part bigint;
 started date; first_date date; last_date date; due date; seq integer:=0; k text;
 before_state jsonb; after_state jsonb;
begin
 if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then raise exception 'permission denied'; end if;
 select * into b from public.businesses where id=bid for update;
 if b.id is null or b.owner_id<>uid or b.archived_at is not null then raise exception 'permission denied'; end if;
 if action not in ('create','update','delete','restore') or lid is null then raise exception 'invalid command'; end if;
 select * into oldrow from public.loans where id=lid and business_id=bid for update;
 if action='create' then
  if oldrow.id is not null then return to_jsonb(lid); end if;
 else
  if oldrow.id is null then raise exception 'permission denied'; end if;
  if (payload->>'version')::integer is distinct from oldrow.version then raise exception 'record changed; refresh and retry'; end if;
  before_state:=jsonb_build_object('loan',to_jsonb(oldrow),'instalments',(select coalesce(jsonb_agg(to_jsonb(i) order by occurrence),'[]'::jsonb) from public.loan_instalments i where loan_id=lid));
 end if;
 if action in ('create','update') then
  if oldrow.deleted_at is not null then raise exception 'Restore the loan before editing'; end if;
  foreach k in array array['total','prior','monthly'] loop
   if coalesce(payload->>k,'') !~ '^\d{1,12}(\.\d{1,2})?$' then raise exception 'invalid amount'; end if;
  end loop;
  total:=((payload->>'total')::numeric*100)::bigint;
  prior:=((payload->>'prior')::numeric*100)::bigint;
  monthly:=((payload->>'monthly')::numeric*100)::bigint;
  started:=(payload->>'start_date')::date; first_date:=(payload->>'first_due')::date; last_date:=(payload->>'end_date')::date;
  if total<1 or prior>total or monthly<1 then raise exception 'invalid loan amounts'; end if;
  if started is null or first_date is null or last_date is null or started<'2000-01-01' or started>first_date or first_date>last_date or last_date>'2100-12-31' or last_date>(first_date+interval '30 years')::date then raise exception 'invalid loan dates'; end if;
  if action='create' then
   insert into public.loans(id,business_id,title,lender,total_minor,prior_minor,monthly_minor,start_date,first_due,end_date)
   values(lid,bid,trim(payload->>'title'),trim(coalesce(payload->>'lender','')),total,prior,monthly,started,first_date,last_date);
  else
   update public.loans set title=trim(payload->>'title'),lender=trim(coalesce(payload->>'lender','')),total_minor=total,prior_minor=prior,monthly_minor=monthly,start_date=started,first_due=first_date,end_date=last_date,version=version+1,updated_at=now() where id=lid;
   delete from public.loan_instalments where loan_id=lid;
  end if;
  remaining:=total-prior;
  while remaining>0 loop
   due:=(first_date+make_interval(months=>seq))::date;
   if due>last_date or seq>=361 then raise exception 'Instalments do not fit within the loan end date'; end if;
   part:=least(monthly,remaining);
   insert into public.loan_instalments(business_id,loan_id,occurrence,due_date,amount_minor) values(bid,lid,seq,due,part);
   remaining:=remaining-part; seq:=seq+1;
  end loop;
 else
  if (action='delete' and oldrow.deleted_at is not null) or (action='restore' and oldrow.deleted_at is null) then raise exception 'invalid loan state'; end if;
  update public.loans set deleted_at=case when action='delete' then now() else null end,version=version+1,updated_at=now() where id=lid;
 end if;
 select * into newrow from public.loans where id=lid;
 after_state:=jsonb_build_object('loan',to_jsonb(newrow),'instalments',(select coalesce(jsonb_agg(to_jsonb(i) order by occurrence),'[]'::jsonb) from public.loan_instalments i where loan_id=lid));
 insert into public.loan_history(business_id,loan_id,actor_id,action,before_record,after_record) values(bid,lid,uid,action,before_state,after_state);
 return to_jsonb(lid);
end $$;
revoke all on function private.loan_command(text,jsonb) from public,anon;
grant execute on function private.loan_command(text,jsonb) to authenticated;
create function public.loan_command(action text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.loan_command(action,payload);$$;
revoke all on function public.loan_command(text,jsonb) from public,anon;
grant execute on function public.loan_command(text,jsonb) to authenticated;
