alter table public.businesses
  add column country_code text
  constraint businesses_country_code_format check (country_code ~ '^[A-Z]{2}$');

-- Delegate to the existing command so identity, ownership, and archive checks
-- run before the country is written in the same transaction.
create function private.save_business_with_country(action text, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  region text;
begin
  if action is null or action not in ('create_business', 'update_business') then
    raise exception 'invalid business action';
  end if;

  result := private.command(action, payload);

  if payload ? 'country_code' then
    region := payload->>'country_code';
    if region is not null and region !~ '^[A-Z]{2}$' then
      raise exception 'invalid business country';
    end if;

    update public.businesses
    set country_code = region
    where id = (result #>> '{}')::uuid
      and owner_id = (select auth.uid())
      and archived_at is null;
    if not found then
      raise exception 'permission denied';
    end if;
  end if;

  return result;
end;
$$;

revoke all on function private.save_business_with_country(text, jsonb) from public, anon;
grant execute on function private.save_business_with_country(text, jsonb) to authenticated;

create function public.flowledger_save_business(action text, payload jsonb default '{}')
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.save_business_with_country(action, payload);
$$;

revoke all on function public.flowledger_save_business(text, jsonb) from public, anon;
grant execute on function public.flowledger_save_business(text, jsonb) to authenticated;
