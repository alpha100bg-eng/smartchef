-- Daily per-user quota on AI endpoints (spec §9 — coût IA / freemium).
-- Without this, any authenticated account can loop on /meal-plan/generate
-- (~5-8 cents a call) with no ceiling.

create table ai_usage (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  day date not null default current_date,
  kind text not null,
  count int not null default 0,
  unique (profile_id, day, kind)
);

create index ai_usage_profile_day_idx on ai_usage (profile_id, day);

alter table ai_usage enable row level security;

-- Read-only for the owner (so the app can show "3 scans left today").
-- Writes go exclusively through the SECURITY DEFINER function below.
create policy "ai_usage_select_own" on ai_usage
  for select using (auth.uid() = profile_id);

-- Atomic consume: increments only if under the limit, in a single statement.
-- Returns true when the call is allowed. A plain read-then-write would let two
-- concurrent requests both pass the check.
create function public.consume_ai_quota(
  p_profile_id uuid,
  p_kind text,
  p_limit int
)
returns boolean as $$
declare
  allowed int;
begin
  insert into ai_usage (profile_id, day, kind, count)
  values (p_profile_id, current_date, p_kind, 1)
  on conflict (profile_id, day, kind)
  do update set count = ai_usage.count + 1
    where ai_usage.count < p_limit
  returning 1 into allowed;

  return allowed is not null;
end;
$$ language plpgsql security definer;
