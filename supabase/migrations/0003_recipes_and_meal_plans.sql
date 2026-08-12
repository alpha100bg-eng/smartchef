-- Phase 3: recipes, recipe_ingredients, meal_plans, meal_plan_entries (F2)
-- Note: recipes gets a profile_id (not in spec §5) to enable per-user RLS.

create type meal_slot as enum ('breakfast', 'lunch', 'dinner', 'snack');

create table recipes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  instructions text,
  prep_time_min int,
  servings int,
  macros jsonb,
  generated_by_ai boolean not null default true,
  created_at timestamptz not null default now()
);

create table recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  name text not null,
  quantity numeric,
  unit text
);

create table meal_plans (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  week_start date not null,
  budget_target numeric,
  estimated_cost numeric,
  created_at timestamptz not null default now()
);

create table meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null references meal_plans(id) on delete cascade,
  day date not null,
  slot meal_slot not null,
  recipe_id uuid not null references recipes(id) on delete cascade
);

create index recipes_profile_idx on recipes (profile_id);
create index meal_plans_profile_idx on meal_plans (profile_id);
create index meal_plan_entries_plan_idx on meal_plan_entries (meal_plan_id);

alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;
alter table meal_plans enable row level security;
alter table meal_plan_entries enable row level security;

create policy "recipes_own" on recipes
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy "recipe_ingredients_own" on recipe_ingredients
  for all using (exists (
    select 1 from recipes r where r.id = recipe_id and r.profile_id = auth.uid()
  )) with check (exists (
    select 1 from recipes r where r.id = recipe_id and r.profile_id = auth.uid()
  ));

create policy "meal_plans_own" on meal_plans
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy "meal_plan_entries_own" on meal_plan_entries
  for all using (exists (
    select 1 from meal_plans m where m.id = meal_plan_id and m.profile_id = auth.uid()
  )) with check (exists (
    select 1 from meal_plans m where m.id = meal_plan_id and m.profile_id = auth.uid()
  ));
