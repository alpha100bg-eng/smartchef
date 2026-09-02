-- Avis des utilisateurs, saisis depuis l'app.
--
-- Sans ce canal, un testeur qui trouve l'app pénible n'a aucun moyen simple de
-- le dire : il faudrait qu'il pense à envoyer un message. Le recueillir dans
-- l'app, au moment où la chose est ressentie, change complètement le taux de
-- réponse.

create table feedback (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  -- 1 à 5. Contraint ici plutôt que côté client : le front n'est pas une
  -- barrière, n'importe qui peut appeler l'API avec la clé publishable.
  rating int not null check (rating between 1 and 5),
  liked text,
  missing text,
  -- Permet de savoir si un avis porte sur une version déjà corrigée.
  app_version text,
  created_at timestamptz not null default now()
);

create index feedback_created_idx on feedback (created_at desc);

alter table feedback enable row level security;

-- Chacun écrit et relit ses propres avis. La lecture globale se fait avec la
-- clé de service, qui contourne la RLS — pas depuis l'app.
create policy "feedback_own" on feedback
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
