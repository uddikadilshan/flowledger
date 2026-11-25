-- Phase 2C: incoming funds only; settlements are a later migration.
create table public.fund_entries (
 id uuid primary key, business_id uuid not null references public.businesses(id),
 kind text not null check(kind in ('collection','external')),
 amount_minor bigint not null check(amount_minor between 1 and 99999999999999),
 received_on date not null, note text not null default '' check(length(note)<=500),
 version integer not null default 1, reversed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(business_id,id)
);
create index fund_entries_calendar on public.fund_entries(business_id,received_on,id);
create table public.fund_history (
 id bigint generated always as identity primary key,
 business_id uuid not null, entry_id uuid not null,
 actor_id uuid not null references auth.users(id),
 action text not null check(action in ('create','correct','reverse','restore')),
 before_record jsonb, after_record jsonb not null, reason text not null,
 created_at timestamptz not null default now(),
 foreign key(business_id,entry_id) references public.fund_entries(business_id,id)
);
create index fund_history_entity on public.fund_history(business_id,entry_id,id);
alter table public.fund_entries enable row level security;
alter table public.fund_history enable row level security;
revoke all on public.fund_entries,public.fund_history from public,anon,authenticated;
grant select on public.fund_entries,public.fund_history to authenticated;
create policy fund_entries_read on public.fund_entries for select to authenticated using(private.can_read(business_id));
create policy fund_history_read on public.fund_history for select to authenticated using(private.is_owner(business_id));
create function private.fund_business_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.fund_entries where business_id=old.id) then
  if new.currency<>old.currency then raise exception 'Currency cannot change after financial records exist'; end if;
  if new.balance_date<>old.balance_date then raise exception 'Opening balance date cannot change after incoming funds are recorded'; end if;
 end if;
 return new;
end $$;
revoke all on function private.fund_business_guard() from public,anon,authenticated;
create trigger fund_business_guard before update of currency,balance_date on public.businesses for each row execute function private.fund_business_guard();
create function private.fund_command(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); bid uuid:=(payload->>'business_id')::uuid; eid uuid:=(payload->>'id')::uuid;
 b public.businesses; prior public.fund_entries; saved public.fund_entries;
 minor bigint; received date; entry_kind text; memo text; why text:=trim(coalesce(payload->>'reason',''));
begin
 if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then raise exception 'permission denied'; end if;
 select * into b from public.businesses where id=bid for update;
 if b.id is null or b.owner_id<>uid or b.archived_at is not null then raise exception 'permission denied'; end if;
 if action is null or action not in ('create','correct','reverse','restore') or eid is null then raise exception 'invalid command'; end if;
 select * into prior from public.fund_entries where id=eid and business_id=bid for update;
 if action='create' then
  if prior.id is not null then return to_jsonb(eid); end if;
 else
  if prior.id is null then raise exception 'permission denied'; end if;
  if (payload->>'version')::integer is distinct from prior.version then raise exception 'record changed; refresh and retry'; end if;
  if length(why) not between 1 and 500 then raise exception 'correction reason required'; end if;
 end if;
 if action in ('create','correct') then
  if prior.reversed_at is not null then raise exception 'Restore the entry before correcting'; end if;
  if coalesce(payload->>'amount','') !~ '^\d{1,12}(\.\d{1,2})?$' then raise exception 'invalid amount'; end if;
  minor:=((payload->>'amount')::numeric*100)::bigint;
  received:=(payload->>'received_on')::date; entry_kind:=payload->>'kind'; memo:=trim(coalesce(payload->>'note',''));
  if minor<1 or minor>99999999999999 or entry_kind is null or entry_kind not in ('collection','external') or length(memo)>500 then raise exception 'invalid entry'; end if;
  if received is null or received<greatest(b.balance_date,date '2000-01-01') or received>least((now() at time zone b.timezone)::date,date '2100-12-31') then raise exception 'Entry date must be between opening balance date and today'; end if;
  if action='create' then
   insert into public.fund_entries(id,business_id,kind,amount_minor,received_on,note) values(eid,bid,entry_kind,minor,received,memo);
  else
   update public.fund_entries set kind=entry_kind,amount_minor=minor,received_on=received,note=memo,version=version+1,updated_at=now() where id=eid;
  end if;
 else
  if (action='reverse' and prior.reversed_at is not null) or (action='restore' and prior.reversed_at is null) then raise exception 'invalid entry state'; end if;
  update public.fund_entries set reversed_at=case when action='reverse' then now() else null end,version=version+1,updated_at=now() where id=eid;
 end if;
 select * into saved from public.fund_entries where id=eid;
 insert into public.fund_history(business_id,entry_id,actor_id,action,before_record,after_record,reason)
 values(bid,eid,uid,action,case when action='create' then null else to_jsonb(prior) end,to_jsonb(saved),why);
 return to_jsonb(eid);
end $$;
revoke all on function private.fund_command(text,jsonb) from public,anon;
grant execute on function private.fund_command(text,jsonb) to authenticated;
create function public.fund_command(action text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.fund_command(action,payload);$$;
revoke all on function public.fund_command(text,jsonb) from public,anon;
grant execute on function public.fund_command(text,jsonb) to authenticated;
-- RLS remains active inside this invoker function. Text totals avoid JSON number precision loss.
create function public.fund_totals(bid uuid,from_date date,to_date date) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'collection',coalesce(sum(amount_minor) filter(where kind='collection'),0)::text,
 'external',coalesce(sum(amount_minor) filter(where kind='external'),0)::text)
 from public.fund_entries where business_id=bid and reversed_at is null and received_on between from_date and to_date;
$$;
revoke all on function public.fund_totals(uuid,date,date) from public,anon;
grant execute on function public.fund_totals(uuid,date,date) to authenticated;
