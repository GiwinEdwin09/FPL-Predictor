-- Private saved selections. Match/player IDs are scoped to their source season.
-- Match data stays in the forecasting pipeline; only user-owned scenarios live here.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create function private.valid_lineup_ids(ids integer[])
returns boolean language sql immutable security invoker set search_path = ''
as $$
  select coalesce(array_ndims(ids) = 1 and cardinality(ids) = 11
    and (select count(distinct n) = 11 and min(n) > 0 from unnest(ids) n), false);
$$;
revoke all on function private.valid_lineup_ids(integer[]) from public;
grant execute on function private.valid_lineup_ids(integer[]) to authenticated;

create table public.lineup_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  season text not null check (season ~ '^[0-9]{4}-[0-9]{4}$'),
  match_id text not null check (char_length(match_id) between 1 and 120),
  home_team_name text not null check (char_length(home_team_name) between 1 and 100),
  away_team_name text not null check (char_length(away_team_name) between 1 and 100),
  home_player_ids integer[] not null check (private.valid_lineup_ids(home_player_ids)),
  away_player_ids integer[] not null check (private.valid_lineup_ids(away_player_ids)),
  home_player_names text[] not null check (cardinality(home_player_names) = 11 and array_position(home_player_names, null) is null),
  away_player_names text[] not null check (cardinality(away_player_names) = 11 and array_position(away_player_names, null) is null),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  version integer not null default 1,
  constraint bounded_lineup_names check (
    octet_length(home_player_names::text) <= 4096 and octet_length(away_player_names::text) <= 4096
  )
);
create index lineup_scenarios_owner_recent_idx on public.lineup_scenarios(user_id, updated_at desc, id);

alter table public.lineup_scenarios enable row level security;
create policy "Owners read their scenarios" on public.lineup_scenarios for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Owners create their scenarios" on public.lineup_scenarios for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Owners update their scenarios" on public.lineup_scenarios for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Explicit grants also work on projects where new tables are not exposed automatically.
revoke all on public.lineup_scenarios from anon, authenticated;
grant select on public.lineup_scenarios to authenticated;
grant insert (id, name, season, match_id, home_team_name, away_team_name,
  home_player_ids, away_player_ids, home_player_names, away_player_names)
  on public.lineup_scenarios to authenticated;
grant update (name, archived_at) on public.lineup_scenarios to authenticated;
-- No DELETE grant or policy: the product archives/restores instead of erasing saves.

create function private.touch_lineup_scenario()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  new.version := old.version + 1;
  return new;
end;
$$;
revoke all on function private.touch_lineup_scenario() from public;
create trigger touch_lineup_scenario before update on public.lineup_scenarios
  for each row execute function private.touch_lineup_scenario();
