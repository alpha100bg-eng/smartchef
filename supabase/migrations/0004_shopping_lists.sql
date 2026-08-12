-- Phase 4: shopping_lists + shopping_list_items (F7)

create table shopping_lists (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  meal_plan_id uuid references meal_plans(id) on delete set null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  shopping_list_id uuid not null references shopping_lists(id) on delete cascade,
  name text not null,
  quantity numeric,
  unit text,
  aisle text,
  estimated_price numeric,
  checked boolean not null default false
);

create index shopping_lists_profile_idx on shopping_lists (profile_id);
create index shopping_list_items_list_idx on shopping_list_items (shopping_list_id);

alter table shopping_lists enable row level security;
alter table shopping_list_items enable row level security;

create policy "shopping_lists_own" on shopping_lists
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy "shopping_list_items_own" on shopping_list_items
  for all using (exists (
    select 1 from shopping_lists s where s.id = shopping_list_id and s.profile_id = auth.uid()
  )) with check (exists (
    select 1 from shopping_lists s where s.id = shopping_list_id and s.profile_id = auth.uid()
  ));
