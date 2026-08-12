-- Phase 1: inventory_items table + private fridge-photos storage bucket (F1)

-- ── inventory_items ────────────────────────────────────────────────
create type item_source as enum ('photo', 'manual');

create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  quantity numeric,
  unit text,
  brand text,
  expiry_date date,
  source item_source not null default 'manual',
  created_at timestamptz not null default now()
);

create index inventory_items_profile_idx on inventory_items (profile_id);

alter table inventory_items enable row level security;

create policy "inventory_select_own" on inventory_items
  for select using (auth.uid() = profile_id);
create policy "inventory_insert_own" on inventory_items
  for insert with check (auth.uid() = profile_id);
create policy "inventory_update_own" on inventory_items
  for update using (auth.uid() = profile_id);
create policy "inventory_delete_own" on inventory_items
  for delete using (auth.uid() = profile_id);

-- ── fridge-photos storage bucket (private) ─────────────────────────
-- Photos are stored at path "{profile_id}/{uuid}.jpg". RGPD: minimisation —
-- photos are deleted after inventory validation; no photo URL is kept in the DB.
insert into storage.buckets (id, name, public)
values ('fridge-photos', 'fridge-photos', false)
on conflict (id) do nothing;

create policy "fridge_photos_select_own" on storage.objects
  for select using (
    bucket_id = 'fridge-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "fridge_photos_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'fridge-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "fridge_photos_update_own" on storage.objects
  for update using (
    bucket_id = 'fridge-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "fridge_photos_delete_own" on storage.objects
  for delete using (
    bucket_id = 'fridge-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
