-- Additive Phase 2A: categories, finite monthly schedules, expense history.
create table public.expense_categories (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id),
 name text not null check(length(trim(name)) between 1 and 60), version integer not null default 1,
 deleted_at timestamptz, created_at timestamptz not null default now(), unique(business_id,id)
);
create unique index expense_categories_name on public.expense_categories(business_id,lower(trim(name))) where deleted_at is null;
create table public.expense_schedules (
 id uuid primary key, business_id uuid not null references public.businesses(id),
 frequency text not null check(frequency in ('once','monthly')), first_due date not null, last_due date not null,
 created_at timestamptz not null default now(), unique(business_id,id), check(last_due>=first_due)
);
create table public.expenses (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id),
 category_id uuid not null, schedule_id uuid not null, occurrence integer not null,
 title text not null check(length(trim(title)) between 1 and 100), description text not null default '' check(length(description)<=1000),
 amount_minor bigint not null check(amount_minor between 1 and 99999999999999), due_date date not null,
 version integer not null default 1, deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(business_id,category_id) references public.expense_categories(business_id,id),
 foreign key(business_id,schedule_id) references public.expense_schedules(business_id,id), unique(schedule_id,occurrence)
);
create index expenses_calendar on public.expenses(business_id,due_date,id);
create index expenses_category on public.expenses(business_id,category_id);
create table public.expense_history (
 id bigint generated always as identity primary key, business_id uuid not null references public.businesses(id),
 entity_id uuid not null, entity_type text not null, actor_id uuid not null references auth.users(id),
 action text not null, before_record jsonb, after_record jsonb, created_at timestamptz not null default now()
);
create index expense_history_entity on public.expense_history(business_id,entity_id,id);
alter table public.expense_categories enable row level security;
alter table public.expense_schedules enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_history enable row level security;
revoke all on public.expense_categories,public.expense_schedules,public.expenses,public.expense_history from public,anon,authenticated;
grant select on public.expense_categories,public.expense_schedules,public.expenses,public.expense_history to authenticated;
create policy categories_read on public.expense_categories for select to authenticated using(private.can_read(business_id));
create policy schedules_read on public.expense_schedules for select to authenticated using(private.can_read(business_id));
create policy expenses_read on public.expenses for select to authenticated using(private.can_read(business_id));
create policy history_read on public.expense_history for select to authenticated using(private.is_owner(business_id));
create function private.expense_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'permission denied'; end if;
 insert into public.expense_history(business_id,entity_id,entity_type,actor_id,action,before_record,after_record)
 values(new.business_id,new.id,tg_table_name,auth.uid(),case when tg_op='INSERT' then 'created' when old.deleted_at is null and new.deleted_at is not null then 'deleted' when old.deleted_at is not null and new.deleted_at is null then 'restored' else 'edited' end,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
revoke all on function private.expense_audit() from public,anon,authenticated;
create trigger expense_audit after insert or update on public.expenses for each row execute function private.expense_audit();
create trigger category_audit after insert or update on public.expense_categories for each row execute function private.expense_audit();
create function private.prevent_expense_currency_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.currency<>old.currency and exists(select 1 from public.expenses where business_id=old.id) then raise exception 'Currency cannot change after expenses are recorded'; end if;
 return new;
end $$;
revoke all on function private.prevent_expense_currency_change() from public,anon,authenticated;
create trigger expense_currency_guard before update of currency on public.businesses for each row execute function private.prevent_expense_currency_change();
create function private.expense_command(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); bid uuid:=(payload->>'business_id')::uuid; eid uuid; cid uuid; sid uuid; b public.businesses; e public.expenses; c public.expense_categories;
 first_date date; end_date date; next_date date; freq text; minor bigint; seq integer:=0; result_count integer:=0;
begin
 if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then raise exception 'permission denied'; end if;
 -- Serializes owner mutations per business, including category changes and archive.
 select * into b from public.businesses where id=bid for update;
 if b.id is null or b.owner_id<>uid or b.archived_at is not null then raise exception 'permission denied'; end if;
 if action='category_create' then
  insert into public.expense_categories(business_id,name) values(bid,trim(payload->>'name')) returning id into cid;
  return to_jsonb(cid);
 elsif action in ('category_update','category_delete','category_restore') then
  cid:=(payload->>'id')::uuid;
  select * into c from public.expense_categories where id=cid and business_id=bid for update;
  if c.id is null then raise exception 'permission denied'; end if;
  if (payload->>'version')::integer is distinct from c.version then raise exception 'record changed; refresh and retry'; end if;
  if action='category_delete' and exists(select 1 from public.expenses where business_id=bid and category_id=cid and deleted_at is null) then raise exception 'category is in use'; end if;
  update public.expense_categories set name=case when action='category_update' then trim(payload->>'name') else name end,deleted_at=case when action='category_delete' then now() when action='category_restore' then null else deleted_at end,version=version+1 where id=cid;
  return to_jsonb(cid);
 elsif action in ('create','update') then
  cid:=(payload->>'category_id')::uuid;
  if not exists(select 1 from public.expense_categories where id=cid and business_id=bid and deleted_at is null) then raise exception 'Choose an active category'; end if;
  if coalesce(payload->>'amount','') !~ '^\d{1,12}(\.\d{1,2})?$' then raise exception 'invalid amount'; end if;
  minor:=((payload->>'amount')::numeric*100)::bigint;
  if minor<1 or minor>99999999999999 then raise exception 'invalid amount'; end if;
  first_date:=(payload->>'due_date')::date;
  if first_date is null or first_date<'2000-01-01' or first_date>'2100-12-31' then raise exception 'invalid date'; end if;
  if action='create' then
   sid:=(payload->>'request_id')::uuid;
   if exists(select 1 from public.expense_schedules where id=sid and business_id=bid) then return to_jsonb(sid); end if;
   freq:=payload->>'frequency';
   end_date:=case when freq='once' then first_date else (payload->>'end_date')::date end;
   if end_date is null or end_date<first_date or end_date>(first_date+interval '5 years')::date or end_date>'2100-12-31' then raise exception 'invalid recurrence end date'; end if;
   insert into public.expense_schedules(id,business_id,frequency,first_due,last_due) values(sid,bid,freq,first_date,end_date);
   next_date:=first_date;
   while next_date<=end_date loop
    insert into public.expenses(business_id,category_id,schedule_id,occurrence,title,description,amount_minor,due_date) values(bid,cid,sid,seq,trim(payload->>'title'),coalesce(payload->>'description',''),minor,next_date);
    exit when freq='once';
    seq:=seq+1;
    -- Always anchor to original date: Jan 31 -> Feb 28 -> Mar 31.
    next_date:=(first_date+make_interval(months=>seq))::date;
   end loop;
   return to_jsonb(sid);
  end if;
 end if;
 if action in ('update','delete','restore') then
  eid:=(payload->>'id')::uuid;
  select * into e from public.expenses where id=eid and business_id=bid for update;
  if e.id is null then raise exception 'permission denied'; end if;
  if (payload->>'version')::integer is distinct from e.version then raise exception 'record changed; refresh and retry'; end if;
  if action='update' and e.deleted_at is not null then raise exception 'Restore this expense before editing'; end if;
  if action='restore' and not exists(select 1 from public.expense_categories where id=e.category_id and deleted_at is null) then raise exception 'Restore the category first'; end if;
  update public.expenses set title=case when action='update' then trim(payload->>'title') else title end,description=case when action='update' then coalesce(payload->>'description','') else description end,amount_minor=case when action='update' then minor else amount_minor end,category_id=case when action='update' then cid else category_id end,due_date=case when action='update' then first_date else due_date end,deleted_at=case when action='delete' then now() when action='restore' then null else deleted_at end,version=version+1,updated_at=now() where id=eid;
  return to_jsonb(eid);
 end if;
 raise exception 'unknown action';
end $$;
revoke all on function private.expense_command(text,jsonb) from public,anon;
grant execute on function private.expense_command(text,jsonb) to authenticated;
create function public.expense_command(action text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.expense_command(action,payload);$$;
revoke all on function public.expense_command(text,jsonb) from public,anon;
grant execute on function public.expense_command(text,jsonb) to authenticated;
