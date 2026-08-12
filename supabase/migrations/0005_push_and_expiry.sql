-- Phase 5: push tokens + expiry notification tracking (F4)

-- ── push_tokens (opt-in only: a row exists only if the user granted permission)
create table push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  token text not null unique,
  platform text,
  created_at timestamptz not null default now()
);

create index push_tokens_profile_idx on push_tokens (profile_id);

alter table push_tokens enable row level security;

create policy "push_tokens_own" on push_tokens
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

-- ── anti-spam: one notification per item, per expiry date
alter table inventory_items add column expiry_notified_at timestamptz;

-- Rearm: whenever expiry_date changes (item re-bought with a new date, or the
-- user corrects it), clear the stamp so the item can be notified again. A DB
-- trigger covers every write path (front via RLS, API, manual fix).
create function public.reset_expiry_notification()
returns trigger as $$
begin
  if new.expiry_date is distinct from old.expiry_date then
    new.expiry_notified_at := null;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger on_expiry_date_change
  before update on inventory_items
  for each row execute procedure public.reset_expiry_notification();
