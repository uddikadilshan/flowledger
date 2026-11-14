create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create extension if not exists pgcrypto with schema extensions;
create table public.businesses (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 name text not null check(length(trim(name)) between 1 and 80), description text not null default '' check(length(description)<=500),
 email text not null default '', phone text not null default '' check(length(phone)<=40), address text not null default '' check(length(address)<=300),
 currency text not null check(currency ~ '^[A-Z]{3}$'), timezone text not null,
 opening_balance numeric(14,2) not null check(opening_balance>=0), balance_date date not null,
 business_days integer[] not null check(cardinality(business_days) between 1 and 7 and business_days <@ array[0,1,2,3,4,5,6]),
 logo_path text, archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.business_members (
 business_id uuid not null references public.businesses on delete cascade, user_id uuid not null references auth.users,
 role text not null check(role in ('owner','viewer')), created_at timestamptz not null default now(), primary key(business_id,user_id)
);
create index members_user on public.business_members(user_id,business_id);
create table public.business_invitations (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses on delete cascade,
 email text not null, token_hash text not null unique, expires_at timestamptz not null default now()+interval '7 days',
 accepted_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now()
);
create index invitations_business on public.business_invitations(business_id);
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.business_invitations enable row level security;
create function private.can_read(bid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.business_members where business_id=bid and user_id=(select auth.uid()));
$$;
create function private.is_owner(bid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.businesses where id=bid and owner_id=(select auth.uid()));
$$;
revoke all on function private.can_read(uuid),private.is_owner(uuid) from public,anon;
grant execute on function private.can_read(uuid),private.is_owner(uuid) to authenticated;
revoke all on public.businesses,public.business_members,public.business_invitations from anon,authenticated;
grant select on public.businesses,public.business_members to authenticated;
grant select(id,business_id,email,expires_at,accepted_at,revoked_at,created_at) on public.business_invitations to authenticated;
create policy businesses_read on public.businesses for select to authenticated using(private.can_read(id));
create policy members_read on public.business_members for select to authenticated using(private.is_owner(business_id) or user_id=(select auth.uid()));
create policy invitations_read on public.business_invitations for select to authenticated using(private.is_owner(business_id));
create function private.command(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); bid uuid; b public.businesses; inv public.business_invitations; raw_token text; target_email text; verified boolean; workdays integer[];
begin
 if uid is null then raise exception 'permission denied'; end if;
 select lower(email),email_confirmed_at is not null into target_email,verified from auth.users where id=uid;
 if not coalesce(verified,false) then raise exception 'email not confirmed'; end if;
 if action='accept_invitation' then
  select business_id into bid from public.business_invitations where token_hash=encode(extensions.digest(payload->>'token','sha256'),'hex');
  select * into b from public.businesses where id=bid for update;
  select * into inv from public.business_invitations where token_hash=encode(extensions.digest(payload->>'token','sha256'),'hex') for update;
  if inv.id is null or inv.email<>target_email or inv.accepted_at is not null or inv.revoked_at is not null or inv.expires_at<=now() or b.archived_at is not null then raise exception 'invitation invalid'; end if;
  insert into public.business_members(business_id,user_id,role) values(bid,uid,'viewer') on conflict do nothing;
  update public.business_invitations set accepted_at=now() where id=inv.id;
  return to_jsonb(bid);
 end if;
 if action<>'create_business' then
  bid:=(payload->>'business_id')::uuid;
  select * into b from public.businesses where id=bid for update;
  if b.id is null or b.owner_id<>uid then raise exception 'permission denied'; end if;
  if b.archived_at is not null and action not in ('archive_business','members') then raise exception 'permission denied: archived business'; end if;
 end if;
 if action in ('create_business','update_business') then
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=payload->>'timezone') then raise exception 'invalid timezone'; end if;
  if (payload->>'opening_balance') !~ '^\d{1,12}(\.\d{1,2})?$' then raise exception 'invalid amount'; end if;
  select array_agg(distinct value::integer) into workdays from jsonb_array_elements_text(payload->'business_days');
  if workdays is null then raise exception 'invalid business days'; end if;
  if action='create_business' then
   insert into public.businesses(owner_id,name,description,email,phone,address,currency,timezone,opening_balance,balance_date,business_days)
   values(uid,trim(payload->>'name'),payload->>'description',payload->>'email',payload->>'phone',payload->>'address',payload->>'currency',payload->>'timezone',(payload->>'opening_balance')::numeric,(payload->>'balance_date')::date,workdays) returning id into bid;
   insert into public.business_members(business_id,user_id,role) values(bid,uid,'owner');
  else
   update public.businesses set name=trim(payload->>'name'),description=payload->>'description',email=payload->>'email',phone=payload->>'phone',address=payload->>'address',currency=payload->>'currency',timezone=payload->>'timezone',opening_balance=(payload->>'opening_balance')::numeric,balance_date=(payload->>'balance_date')::date,business_days=workdays,updated_at=now() where id=bid;
  end if;
  return to_jsonb(bid);
 elsif action='members' then
  return coalesce((select jsonb_agg(jsonb_build_object('business_id',m.business_id,'user_id',m.user_id,'role',m.role,'created_at',m.created_at,'email',u.email)) from public.business_members m join auth.users u on u.id=m.user_id where m.business_id=bid),'[]'::jsonb);
 elsif action='archive_business' then
  update public.businesses set archived_at=case when (payload->>'archived')::boolean then now() else null end,updated_at=now() where id=bid;
 elsif action='set_logo' then
  if split_part(payload->>'path','/',1)<>bid::text or not exists(select 1 from storage.objects where bucket_id='business-logos' and name=payload->>'path') then raise exception 'invalid logo'; end if;
  update public.businesses set logo_path=payload->>'path',updated_at=now() where id=bid;
 elsif action='invite_viewer' then
  target_email:=lower(trim(payload->>'email'));
  if target_email is null or length(target_email)>254 or target_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid email'; end if;
  if exists(select 1 from public.business_members m join auth.users u on m.user_id=u.id where m.business_id=bid and lower(u.email)=target_email) then raise exception 'already a member'; end if;
  if exists(select 1 from public.business_invitations where business_id=bid and email=target_email and accepted_at is null and revoked_at is null and expires_at>now()) then raise exception 'duplicate invitation'; end if;
  raw_token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into public.business_invitations(business_id,email,token_hash) values(bid,target_email,encode(extensions.digest(raw_token,'sha256'),'hex'));
  return to_jsonb(raw_token);
 elsif action='revoke_invitation' then
  update public.business_invitations set revoked_at=now() where id=(payload->>'invitation_id')::uuid and business_id=bid and accepted_at is null;
 elsif action='remove_viewer' then
  delete from public.business_members where business_id=bid and user_id=(payload->>'user_id')::uuid and role='viewer';
 else raise exception 'unknown action'; end if;
 return 'true'::jsonb;
end;
$$;
revoke all on function private.command(text,jsonb) from public,anon;
grant execute on function private.command(text,jsonb) to authenticated;
create function public.flowledger_command(action text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select private.command(action,payload); $$;
revoke all on function public.flowledger_command(text,jsonb) from public,anon;
grant execute on function public.flowledger_command(text,jsonb) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('business-logos','business-logos',false,512000,array['image/png','image/jpeg','image/webp']);
create function private.logo_owner(path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.businesses where id::text=split_part(path,'/',1) and owner_id=(select auth.uid()) and archived_at is null);
$$;
create function private.logo_reader(path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.business_members where business_id::text=split_part(path,'/',1) and user_id=(select auth.uid()));
$$;
revoke all on function private.logo_owner(text),private.logo_reader(text) from public,anon;
grant execute on function private.logo_owner(text),private.logo_reader(text) to authenticated;
create policy logo_read on storage.objects for select to authenticated using(bucket_id='business-logos' and private.logo_reader(name));
create policy logo_insert on storage.objects for insert to authenticated with check(bucket_id='business-logos' and private.logo_owner(name));
create policy logo_delete on storage.objects for delete to authenticated using(bucket_id='business-logos' and private.logo_owner(name));
