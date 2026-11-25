-- Phase 2D: immutable payment allocations, reversible by audit event.
create table public.settlements (
 id uuid primary key, business_id uuid not null references public.businesses(id),
 expense_id uuid references public.expenses(id), instalment_id uuid references public.loan_instalments(id),
 target_label text not null, due_date date not null,
 business_minor bigint not null check(business_minor between 0 and 99999999999999),
 external_minor bigint not null check(external_minor between 0 and 99999999999999),
 paid_on date not null, note text not null check(length(note)<=500),
 actor_id uuid not null references auth.users(id), created_at timestamptz not null default now(),
 reversed_at timestamptz, reversed_by uuid references auth.users(id), reversal_reason text,
 check(num_nonnulls(expense_id,instalment_id)=1),
 check(business_minor+external_minor between 1 and 99999999999999)
);
create index settlements_business_date on public.settlements(business_id,paid_on,id);
create index settlements_expense on public.settlements(expense_id);
create index settlements_instalment on public.settlements(instalment_id);
alter table public.settlements enable row level security;
revoke all on public.settlements from public,anon,authenticated;
grant select on public.settlements to authenticated;
create policy settlements_read on public.settlements for select to authenticated using(private.can_read(business_id));

-- Check both funding pools on every day, including historical corrections.
create function private.assert_funded(bid uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(
  with movements as (
   select balance_date d,opening_balance*100 b,0::numeric e from public.businesses where id=bid
   union all select received_on,case when kind='collection' then amount_minor else 0 end,case when kind='external' then amount_minor else 0 end from public.fund_entries where business_id=bid and reversed_at is null
   union all select paid_on,-business_minor,-external_minor from public.settlements where business_id=bid and reversed_at is null
  ), daily as (select d,sum(b) b,sum(e) e from movements group by d),
  running as (select sum(b) over(order by d) b,sum(e) over(order by d) e from daily)
  select 1 from running where b<0 or e<0
 ) then raise exception 'Insufficient funds on a payment date'; end if;
end $$;
revoke all on function private.assert_funded(uuid) from public,anon,authenticated;
create function private.settlement_funds_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='businesses' then
  if new.balance_date<>old.balance_date and exists(select 1 from public.settlements where business_id=new.id) then raise exception 'Opening balance date locked by settlement history'; end if;
  perform private.assert_funded(new.id);
 else
  perform private.assert_funded(case when tg_op='DELETE' then old.business_id else new.business_id end);
 end if;
 return null;
end $$;
revoke all on function private.settlement_funds_guard() from public,anon,authenticated;
create trigger settlement_fund_guard after insert or update or delete on public.fund_entries for each row execute function private.settlement_funds_guard();
create trigger settlement_opening_guard after update of opening_balance,balance_date on public.businesses for each row execute function private.settlement_funds_guard();
create function private.settlement_target_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='expenses' then
  if exists(select 1 from public.settlements where expense_id=old.id) and
   (new.amount_minor is distinct from old.amount_minor or new.due_date is distinct from old.due_date or new.deleted_at is distinct from old.deleted_at)
  then raise exception 'Expense amount, date and archive state locked by settlement history'; end if;
 else
  if new.deleted_at is distinct from old.deleted_at and exists(select 1 from public.settlements s join public.loan_instalments i on i.id=s.instalment_id where i.loan_id=old.id)
  then raise exception 'Loan archive state locked by settlement history'; end if;
 end if;
 return new;
end $$;
revoke all on function private.settlement_target_guard() from public,anon,authenticated;
create trigger settlement_expense_guard before update on public.expenses for each row execute function private.settlement_target_guard();
create trigger settlement_loan_guard before update on public.loans for each row execute function private.settlement_target_guard();

create function private.settlement_command(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); bid uuid:=(payload->>'business_id')::uuid; sid uuid:=(payload->>'id')::uuid;
 b public.businesses; oldrow public.settlements; eid uuid; iid uuid;
 bm bigint; em bigint; limit_minor bigint; already numeric; label text; due date; paid date;
 why text:=trim(coalesce(payload->>'reason','')); memo text:=trim(coalesce(payload->>'note',''));
begin
 if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then raise exception 'permission denied'; end if;
 select * into b from public.businesses where id=bid for update;
 if b.id is null or b.owner_id<>uid or b.archived_at is not null then raise exception 'permission denied'; end if;
 if sid is null or action is null or action not in ('create','reverse') then raise exception 'invalid command'; end if;
 select * into oldrow from public.settlements where id=sid and business_id=bid;
 if action='reverse' then
  if oldrow.id is null then raise exception 'permission denied'; end if;
  if length(why) not between 1 and 500 then raise exception 'Reversal reason required'; end if;
  if oldrow.reversed_at is not null then return to_jsonb(sid); end if;
  update public.settlements set reversed_at=now(),reversed_by=uid,reversal_reason=why where id=sid;
  return to_jsonb(sid);
 end if;
 if oldrow.id is not null then return to_jsonb(sid); end if;
 eid:=(payload->>'expense_id')::uuid; iid:=(payload->>'instalment_id')::uuid;
 if num_nonnulls(eid,iid)<>1 then raise exception 'Choose one payment target'; end if;
 if coalesce(payload->>'business_amount','') !~ '^\d{1,12}(\.\d{1,2})?$' or coalesce(payload->>'external_amount','') !~ '^\d{1,12}(\.\d{1,2})?$' then raise exception 'Invalid amount'; end if;
 bm:=((payload->>'business_amount')::numeric*100)::bigint; em:=((payload->>'external_amount')::numeric*100)::bigint;
 paid:=(payload->>'paid_on')::date;
 if paid is null or paid<b.balance_date or paid>(now() at time zone b.timezone)::date then raise exception 'Payment date outside tracking period'; end if;
 if eid is not null then
  select amount_minor,title,due_date into limit_minor,label,due from public.expenses where id=eid and business_id=bid and deleted_at is null;
 else
  select i.amount_minor,l.title,i.due_date into limit_minor,label,due from public.loan_instalments i join public.loans l on l.id=i.loan_id and l.business_id=i.business_id where i.id=iid and i.business_id=bid and l.deleted_at is null;
 end if;
 if limit_minor is null then raise exception 'Payment target unavailable'; end if;
 select coalesce(sum(business_minor+external_minor),0) into already from public.settlements where business_id=bid and reversed_at is null and (expense_id=eid or instalment_id=iid);
 if bm+em<1 or bm+em>limit_minor-already then raise exception 'Payment exceeds remaining amount or is zero'; end if;
 insert into public.settlements(id,business_id,expense_id,instalment_id,target_label,due_date,business_minor,external_minor,paid_on,note,actor_id)
 values(sid,bid,eid,iid,label,due,bm,em,paid,memo,uid);
 perform private.assert_funded(bid);
 return to_jsonb(sid);
end $$;
revoke all on function private.settlement_command(text,jsonb) from public,anon;
grant execute on function private.settlement_command(text,jsonb) to authenticated;
create function public.settlement_command(action text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.settlement_command(action,payload);$$;
revoke all on function public.settlement_command(text,jsonb) from public,anon;
grant execute on function public.settlement_command(text,jsonb) to authenticated;

create function public.settlement_balance(bid uuid,as_of date) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'business', (coalesce((select opening_balance*100 from public.businesses where id=bid and balance_date<=as_of),0)+coalesce((select sum(amount_minor) from public.fund_entries where business_id=bid and kind='collection' and reversed_at is null and received_on<=as_of),0)-coalesce((select sum(business_minor) from public.settlements where business_id=bid and reversed_at is null and paid_on<=as_of),0))::bigint::text,
 'external', (coalesce((select sum(amount_minor) from public.fund_entries where business_id=bid and kind='external' and reversed_at is null and received_on<=as_of),0)-coalesce((select sum(external_minor) from public.settlements where business_id=bid and reversed_at is null and paid_on<=as_of),0))::bigint::text);
$$;
revoke all on function public.settlement_balance(uuid,date) from public,anon;
grant execute on function public.settlement_balance(uuid,date) to authenticated;
create function public.settlement_targets(bid uuid,from_date date,to_date date) returns table(id uuid,kind text,label text,due_date date,amount_minor text,paid_minor text) language sql stable security invoker set search_path='' as $$
 with targets as (
 select e.id,'expense'::text kind,e.title label,e.due_date,e.amount_minor from public.expenses e where e.business_id=bid and e.deleted_at is null and e.due_date between from_date and to_date
 union all select i.id,'loan',l.title,i.due_date,i.amount_minor from public.loan_instalments i join public.loans l on l.id=i.loan_id where i.business_id=bid and l.deleted_at is null and i.due_date between from_date and to_date
 ), payments as (
 select case when expense_id is not null then 'expense' else 'loan' end kind,coalesce(expense_id,instalment_id) id,sum(business_minor+external_minor) paid from public.settlements where business_id=bid and reversed_at is null group by 1,2
 )
 select t.id,t.kind,t.label,t.due_date,t.amount_minor::text,coalesce(p.paid,0)::text from targets t left join payments p on p.id=t.id and p.kind=t.kind order by t.due_date,t.kind,t.id;
$$;
revoke all on function public.settlement_targets(uuid,date,date) from public,anon;
grant execute on function public.settlement_targets(uuid,date,date) to authenticated;
