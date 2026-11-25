-- Per-user notification preferences and durable daily alert inbox.
create table public.notification_preferences (
 business_id uuid not null references public.businesses(id), user_id uuid not null references auth.users(id),
 upcoming boolean not null default true, overdue boolean not null default true, targets boolean not null default true,
 lead_days integer not null default 3 check(lead_days between 1 and 14),
 primary key(business_id,user_id)
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id),
 user_id uuid not null references auth.users(id), alert_key text not null, kind text not null check(kind in ('upcoming','overdue','target','funding','funded')),
 title text not null, detail text not null, amount_minor numeric not null check(amount_minor>=0),
 alert_date date not null, created_at timestamptz not null default now(), read_at timestamptz,dismissed_at timestamptz,
 unique(business_id,user_id,alert_key)
);
create index notification_inbox on public.notifications(business_id,user_id,created_at desc);
alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;
revoke all on public.notification_preferences,public.notifications from public,anon,authenticated;
grant select,insert,update on public.notification_preferences to authenticated;
grant select on public.notifications to authenticated;
grant update(read_at,dismissed_at) on public.notifications to authenticated;
create policy prefs_read on public.notification_preferences for select to authenticated using(user_id=auth.uid() and private.can_read(business_id));
create policy prefs_insert on public.notification_preferences for insert to authenticated with check(user_id=auth.uid() and private.can_read(business_id));
create policy prefs_update on public.notification_preferences for update to authenticated using(user_id=auth.uid() and private.can_read(business_id)) with check(user_id=auth.uid() and private.can_read(business_id));
create policy alerts_read on public.notifications for select to authenticated using(user_id=auth.uid() and private.can_read(business_id));
create policy alerts_update on public.notifications for update to authenticated using(user_id=auth.uid() and private.can_read(business_id)) with check(user_id=auth.uid() and private.can_read(business_id));

-- Internal generator; never callable by authenticated clients directly.
create function private.generate_notifications(bid uuid,uid uuid) returns integer language plpgsql security definer set search_path='' as $$
declare b public.businesses; p public.notification_preferences; day date; lastday date; inserted integer; n integer:=0;
 cash numeric; required numeric; rate numeric; gap numeric; wd integer;
begin
 select * into b from public.businesses where id=bid and archived_at is null;
 if b.id is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then return 0; end if;
 if b.owner_id<>uid and not exists(select 1 from public.business_members where business_id=bid and user_id=uid) then return 0; end if;
 select * into p from public.notification_preferences where business_id=bid and user_id=uid;
 day:=(now() at time zone b.timezone)::date;
 lastday:=(date_trunc('month',day)+interval '1 month - 1 day')::date;
 insert into public.notifications(business_id,user_id,alert_key,kind,title,detail,amount_minor,alert_date)
 select bid,uid,t.kind||':'||t.id||':'||day,case when t.due_date<day then 'overdue' else 'upcoming' end,
 case when t.due_date<day then 'Overdue payment' else 'Upcoming payment' end,
 t.label||' · Due '||t.due_date, t.amount_minor::numeric-t.paid_minor::numeric,day
 from public.settlement_targets(bid,'2000-01-01',day+coalesce(p.lead_days,3)) t
 where t.amount_minor::numeric>t.paid_minor::numeric and ((t.due_date<day and coalesce(p.overdue,true)) or (t.due_date>=day and coalesce(p.upcoming,true)))
 on conflict(business_id,user_id,alert_key) do nothing;
 get diagnostics inserted=row_count;n:=n+inserted;
 if coalesce(p.targets,true) then
  select (v->>'business')::numeric+(v->>'external')::numeric into cash from (select public.settlement_balance(bid,day) v) x;
  with grouped as (
   select greatest(due_date,day) d,sum(amount_minor::numeric-paid_minor::numeric) amount
   from public.settlement_targets(bid,'2000-01-01',lastday) where amount_minor::numeric>paid_minor::numeric group by 1
  ), deadlines as (
   select d,sum(amount) over(order by d) cumulative,
   (select count(*) from generate_series(day::timestamp,d::timestamp,interval '1 day') s where extract(dow from s)::integer=any(b.business_days)) days
   from grouped
  ), gaps as (
   select days,greatest(0,cumulative-cash) shortfall from deadlines
  )
  select coalesce(max(shortfall),0),coalesce(max(shortfall) filter(where days=0),0) into required,gap from gaps;
  with grouped as (
   select greatest(due_date,day) d,sum(amount_minor::numeric-paid_minor::numeric) amount
   from public.settlement_targets(bid,'2000-01-01',lastday) where amount_minor::numeric>paid_minor::numeric group by 1
  ), deadlines as (
   select d,sum(amount) over(order by d) cumulative,
   (select count(*) from generate_series(day::timestamp,d::timestamp,interval '1 day') s where extract(dow from s)::integer=any(b.business_days)) days from grouped
  )
  select coalesce(max(ceil(greatest(0,cumulative-cash-gap)/nullif(days,0))),0) into rate from deadlines;
  wd:=extract(dow from day)::integer;
  if gap>0 then
   insert into public.notifications(business_id,user_id,alert_key,kind,title,detail,amount_minor,alert_date) values(bid,uid,'funding:'||day,'funding','Immediate funding gap','No working day remains before a payment deadline.',gap,day) on conflict do nothing;
   get diagnostics inserted=row_count;n:=n+inserted;
  end if;
  if rate>0 and wd=any(b.business_days) then
   insert into public.notifications(business_id,user_id,alert_key,kind,title,detail,amount_minor,alert_date) values(bid,uid,'target:'||day,'target','Additional collection required','Remaining daily target at time of alert.',rate,day) on conflict do nothing;
   get diagnostics inserted=row_count;n:=n+inserted;
  elsif required=0 and exists(select 1 from public.notifications where business_id=bid and user_id=uid and alert_key='target:'||day) then
   insert into public.notifications(business_id,user_id,alert_key,kind,title,detail,amount_minor,alert_date) values(bid,uid,'funded:'||day,'funded','Collection requirement cleared','Current funds cover remaining obligations through month end.',0,day) on conflict do nothing;
   get diagnostics inserted=row_count;n:=n+inserted;
  end if;
 end if;
 return n;
end $$;
revoke all on function private.generate_notifications(uuid,uuid) from public,anon,authenticated;
create function private.refresh_notifications(bid uuid) returns integer language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.can_read(bid) then raise exception 'permission denied';end if;
 return private.generate_notifications(bid,auth.uid());
end $$;
revoke all on function private.refresh_notifications(uuid) from public,anon;
grant execute on function private.refresh_notifications(uuid) to authenticated;
create function public.refresh_notifications(bid uuid) returns integer language sql security invoker set search_path='' as $$select private.refresh_notifications(bid);$$;
revoke all on function public.refresh_notifications(uuid) from public,anon;
grant execute on function public.refresh_notifications(uuid) to authenticated;
create function private.run_notification_cycle() returns integer language plpgsql security definer set search_path='' as $$
declare r record;n integer:=0;
begin
 for r in select id bid,owner_id uid from public.businesses where archived_at is null
 union select b.id,m.user_id from public.businesses b join public.business_members m on m.business_id=b.id where b.archived_at is null
 loop n:=n+private.generate_notifications(r.bid,r.uid);end loop;
 return n;
end $$;
revoke all on function private.run_notification_cycle() from public,anon,authenticated;
