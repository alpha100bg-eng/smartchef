-- Phase 0: profiles + allergies, RLS, account deletion (RGPD)

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  budget_weekly numeric,
  time_per_meal_min int,
  diet_type text,
  goals text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table allergies (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  label text not null
);

alter table profiles enable row level security;
alter table allergies enable row level security;

create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id);
create policy "profiles_delete_own" on profiles
  for delete using (auth.uid() = id);

create policy "allergies_select_own" on allergies
  for select using (auth.uid() = profile_id);
create policy "allergies_insert_own" on allergies
  for insert with check (auth.uid() = profile_id);
create policy "allergies_update_own" on allergies
  for update using (auth.uid() = profile_id);
create policy "allergies_delete_own" on allergies
  for delete using (auth.uid() = profile_id);

-- Auto-create an empty profile row when a new auth user signs up.
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- RGPD: full account deletion. Deletes the profile row (cascades to allergies)
-- and the underlying auth.users row. Called via service-role key from the
-- FastAPI /profiles/me DELETE endpoint, not directly by the client.
create function public.delete_own_account(target_id uuid)
returns void as $$
begin
  delete from auth.users where id = target_id;
end;
$$ language plpgsql security definer;
