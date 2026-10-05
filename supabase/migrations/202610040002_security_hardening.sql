-- Apply AFTER 202610040001. Also required on existing deployments.
-- Grants still forbid direct client writes. Policies and the guard trigger
-- provide owner/MFA checks beneath the explicitly checked save RPC.
create policy owner_insert on public.vaults for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select private.is_owner()));
create policy owner_update on public.vaults for update to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_owner()))
  with check (owner_id = (select auth.uid()) and (select private.is_owner()));

create or replace function private.valid_box(box jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(box) is distinct from 'object' then return false; end if;
  return (select count(*) from jsonb_object_keys(box)) = 2
    and jsonb_typeof(box->'iv') = 'string'
    and jsonb_typeof(box->'ciphertext') = 'string'
    and coalesce(box->>'iv', '') ~ '^[A-Za-z0-9+/]{16}$'
    and coalesce(box->>'ciphertext', '') ~ '^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'
    and length(box->>'ciphertext') between 24 and 20000000;
end;
$$;
revoke all on function private.valid_box(jsonb) from public, anon, authenticated;

create function private.valid_envelope(payload jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(payload) is distinct from 'object' then return false; end if;
  return (select count(*) from jsonb_object_keys(payload)) = 6
    and payload->'format' = '"money-tracker-v1"'::jsonb
    and payload->'iterations' = '600000'::jsonb
    and jsonb_typeof(payload->'salt') = 'string'
    and coalesce(payload->>'salt', '') ~ '^[A-Za-z0-9+/]{22}==$'
    and private.valid_box(payload->'wrappedKey')
    and private.valid_box(payload->'recoveryWrappedKey')
    and coalesce(payload->'wrappedKey'->>'ciphertext', '') ~ '^[A-Za-z0-9+/]{64}$'
    and coalesce(payload->'recoveryWrappedKey'->>'ciphertext', '') ~ '^[A-Za-z0-9+/]{64}$'
    and private.valid_box(payload->'data')
    and octet_length(payload::text) <= 20000000;
end;
$$;
revoke all on function private.valid_envelope(jsonb) from public, anon, authenticated;

create function private.guard_vault() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'DIRECT_DELETE_FORBIDDEN' using errcode = '42501'; end if;
  if not private.is_owner() or new.owner_id is distinct from auth.uid() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if not coalesce(private.valid_envelope(new.payload), false) then
    raise exception 'INVALID_ENCRYPTED_PAYLOAD' using errcode = '22023';
  end if;
  if (tg_op = 'INSERT' and new.version <> 1)
     or (tg_op = 'UPDATE' and (new.owner_id <> old.owner_id or new.version <> old.version + 1)) then
    raise exception 'INVALID_VERSION' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_vault() from public, anon, authenticated;
create trigger enforce_vault_boundary before insert or update or delete on public.vaults
  for each row execute function private.guard_vault();

-- Confirm no accidental grants or public execution were introduced.
revoke insert, update, delete, truncate, references, trigger on public.vaults from public, anon, authenticated;
revoke all on private.owner from public, anon, authenticated;
revoke all on function public.save_vault(jsonb, integer) from public, anon;
grant execute on function public.save_vault(jsonb, integer) to authenticated;
