-- Run once in Supabase SQL Editor, then configure the single owner as in README.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete cascade
);
revoke all on private.owner from public, anon, authenticated;

create function private.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt()->>'aal', '') = 'aal2'
    and exists (select 1 from private.owner where user_id = auth.uid());
$$;
revoke all on function private.is_owner() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_owner() to authenticated;

create function public.owner_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_owner();
$$;
revoke all on function public.owner_access() from public, anon;
grant execute on function public.owner_access() to authenticated;

create table public.vaults (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  version integer not null check (version > 0),
  updated_at timestamptz not null default now()
);
alter table public.vaults enable row level security;
alter table public.vaults force row level security;
revoke all on public.vaults from public, anon, authenticated;
grant select on public.vaults to authenticated;
create policy owner_read on public.vaults for select to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_owner()));

-- Restrict the payload to the versioned encryption envelope. No arbitrary
-- metadata, financial fields, or uploaded files are accepted by the data API.
create function private.valid_box(box jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(
    jsonb_typeof(box) = 'object'
    and (select count(*) from jsonb_object_keys(box)) = 2
    and box->>'iv' ~ '^[A-Za-z0-9+/]{16}$'
    and box->>'ciphertext' ~ '^[A-Za-z0-9+/]+={0,2}$'
    and length(box->>'ciphertext') >= 24, false);
$$;
revoke all on function private.valid_box(jsonb) from public, anon, authenticated;

create function public.save_vault(encrypted_payload jsonb, expected_version integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare next_version integer;
begin
  if not private.is_owner() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if expected_version is null or expected_version < 0 or expected_version >= 2147483647 then
    raise exception 'INVALID_VERSION' using errcode = '22023';
  end if;
  if jsonb_typeof(encrypted_payload) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(encrypted_payload)) <> 6
    or encrypted_payload->>'format' is distinct from 'money-tracker-v1'
    or encrypted_payload->>'iterations' is distinct from '600000'
    or coalesce(encrypted_payload->>'salt', '') !~ '^[A-Za-z0-9+/]{22}==$'
    or not private.valid_box(encrypted_payload->'wrappedKey')
    or not private.valid_box(encrypted_payload->'recoveryWrappedKey')
    or not private.valid_box(encrypted_payload->'data')
    or octet_length(encrypted_payload::text) > 20000000 then
    raise exception 'INVALID_ENCRYPTED_PAYLOAD' using errcode = '22023';
  end if;
  if expected_version = 0 then
    insert into public.vaults (owner_id, payload, version)
      values (auth.uid(), encrypted_payload, 1)
      on conflict (owner_id) do nothing returning version into next_version;
  else
    update public.vaults set payload = encrypted_payload, version = version + 1, updated_at = now()
      where owner_id = auth.uid() and version = expected_version
      returning version into next_version;
  end if;
  if next_version is null then
    raise exception 'VERSION_CONFLICT' using errcode = '40001';
  end if;
  return next_version;
end;
$$;
revoke all on function public.save_vault(jsonb, integer) from public, anon;
grant execute on function public.save_vault(jsonb, integer) to authenticated;
