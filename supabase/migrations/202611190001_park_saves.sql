-- A private, manually saved park snapshot per authenticated account.
-- Apply as the project's database owner. Reapplying this file preserves saved rows.
begin;

create table if not exists public.park_saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint park_saves_payload_size check (
    pg_catalog.jsonb_typeof(payload) = 'object'
    and pg_catalog.octet_length(payload::text) <= 2097152
  )
);

alter table public.park_saves enable row level security;

-- Defaults differ between Supabase projects. Explicit grants keep this table read-only
-- through the Data API; the narrowly scoped RPC below is its only client write path.
revoke all privileges on table public.park_saves from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on table public.park_saves to authenticated;

drop policy if exists park_saves_read_own on public.park_saves;
create policy park_saves_read_own
  on public.park_saves
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create or replace function public.save_park(
  p_payload jsonb,
  p_expected_revision bigint default null
)
returns table (revision bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := auth.uid();
  exported_at_text text;
  exported_at_value timestamptz;
  allowed_keys constant text[] := array[
    'spriggan.pond.v1',
    'spriggan.farm.v1',
    'spriggan.dumplings.v1',
    'spriggan.slots.v1',
    'spriggan.claw.v1',
    'spriggan.fishing.guide.v1',
    'spriggan.hex.totals.v1',
    'spriggan.timer.v1',
    'spriggan.farm.timer.v1',
    'spriggan.dumplings.timer.v1',
    'spriggan.hex.timer.v1',
    'spriggan.fishing.timer.v1',
    'spriggan.farm.music.v1',
    'spriggan.farm.rain.v1',
    'spriggan.hex.rain.v1',
    'spriggan.hex.moonlight',
    'spriggan.fishing.settings.v1',
    'spriggan.park.v1'
  ];
begin
  -- SECURITY DEFINER bypasses the caller's table privileges. Never accept a user ID
  -- from the browser: both insertion and update always use the verified JWT subject.
  if actor is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'INVALID_BACKUP';
  end if;
  if pg_catalog.octet_length(p_payload::text) > 2097152 then
    raise exception using errcode = '22001', message = 'BACKUP_TOO_LARGE';
  end if;
  if p_payload ->> 'format' is distinct from 'spriggan-park'
    or p_payload -> 'version' is distinct from '1'::jsonb
    or pg_catalog.jsonb_typeof(p_payload -> 'exportedAt') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_payload -> 'entries') is distinct from 'object'
    or exists (
      select 1 from pg_catalog.jsonb_object_keys(p_payload) as fields(name)
      where fields.name not in ('format', 'version', 'exportedAt', 'entries')
    ) then
    raise exception using errcode = '22023', message = 'INVALID_BACKUP';
  end if;

  exported_at_text := p_payload ->> 'exportedAt';
  if exported_at_text !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' then
    raise exception using errcode = '22023', message = 'INVALID_BACKUP';
  end if;
  begin
    exported_at_value := exported_at_text::timestamptz;
    if pg_catalog.to_char(exported_at_value at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') is distinct from exported_at_text then
      raise exception using errcode = '22023', message = 'INVALID_BACKUP';
    end if;
  exception when datetime_field_overflow or invalid_datetime_format then
    raise exception using errcode = '22023', message = 'INVALID_BACKUP';
  end;

  -- Backup entries deliberately contain the original localStorage text. Their full
  -- game-specific schemas are checked by SprigganSaves before cloud save and restore.
  if exists (
    select 1 from pg_catalog.jsonb_each(p_payload -> 'entries') as entry(key, value)
    where not (entry.key = any (allowed_keys))
      or pg_catalog.jsonb_typeof(entry.value) is distinct from 'string'
  ) then
    raise exception using errcode = '22023', message = 'INVALID_BACKUP';
  end if;

  if p_expected_revision is null then
    -- First save is insert-only. Two devices racing here cannot replace each other.
    begin
      return query
        insert into public.park_saves as saved (user_id, payload, revision, updated_at)
        values (actor, p_payload, 1, pg_catalog.clock_timestamp())
        returning saved.revision, saved.updated_at;
    exception when unique_violation then
      raise exception using errcode = 'P0001', message = 'SAVE_CONFLICT';
    end;
    return;
  end if;

  -- PostgreSQL rechecks this predicate after waiting for a concurrent row lock.
  -- Exactly one writer with the current revision can advance the account snapshot.
  return query
    update public.park_saves as saved
    set payload = p_payload,
        revision = saved.revision + 1,
        updated_at = pg_catalog.clock_timestamp()
    where saved.user_id = actor
      and saved.revision = p_expected_revision
      and saved.revision < 9223372036854775807
    returning saved.revision, saved.updated_at;
  if not found then
    raise exception using errcode = 'P0001', message = 'SAVE_CONFLICT';
  end if;
end;
$function$;

-- Function EXECUTE is commonly granted to PUBLIC on creation. Revoke it explicitly,
-- including direct grants inherited from project defaults, before granting one role.
revoke all privileges on function public.save_park(jsonb, bigint) from public, anon, authenticated;
grant execute on function public.save_park(jsonb, bigint) to authenticated;

comment on table public.park_saves is 'Private manual Spriggan park backup per account; clients read their own row and write through save_park only.';
comment on function public.save_park(jsonb, bigint) is 'Insert-only for NULL expected revision; compare-and-swap update otherwise. P0001 SAVE_CONFLICT preserves the newer snapshot.';

commit;
