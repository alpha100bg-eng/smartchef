-- Abonnement Premium : palier sur le profil + quotas mensuels.
--
-- Le coût mesuré est de ~1 €/mois par utilisateur régulier, sans revenus en
-- face : la croissance était donc une facture. Les quotas quotidiens bornaient
-- mal ce coût (2 plans/jour = 60/mois) — d'où le passage au mois.

-- ── Palier ──────────────────────────────────────────────────────────
alter table profiles
  add column plan text not null default 'free'
    check (plan in ('free', 'premium')),
  -- Fin de la période payée. Une résiliation laisse l'accès jusqu'au terme,
  -- donc on ne repasse pas `plan` à 'free' immédiatement.
  add column premium_until timestamptz,
  -- Identifiants Stripe, écrits uniquement par le webhook (clé de service).
  add column stripe_customer_id text,
  add column stripe_subscription_id text;

create index profiles_stripe_customer_idx on profiles (stripe_customer_id);

-- L'utilisateur lit son palier (pour afficher « Premium » et les quotas
-- restants) mais ne doit surtout pas pouvoir se l'attribuer : la politique
-- d'update existante autorise n'importe quelle colonne.
create or replace function public.forbid_self_upgrade()
returns trigger as $$
begin
  -- auth.uid() est null quand la clé de service agit (webhook Stripe) :
  -- dans ce cas on laisse passer.
  if auth.uid() is not null and (
       new.plan is distinct from old.plan
    or new.premium_until is distinct from old.premium_until
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.stripe_subscription_id is distinct from old.stripe_subscription_id
  ) then
    raise exception 'billing fields are not user-writable';
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger profiles_forbid_self_upgrade
  before update on profiles
  for each row execute function public.forbid_self_upgrade();

-- ── Quotas mensuels ─────────────────────────────────────────────────
-- Même table `ai_usage` : pour un quota mensuel on range le compteur sous le
-- premier jour du mois, ce qui réutilise la contrainte d'unicité existante.
create or replace function public.consume_ai_quota_period(
  p_profile_id uuid,
  p_kind text,
  p_limit int,
  p_monthly boolean default true
)
returns boolean as $$
declare
  allowed int;
  bucket date;
begin
  if p_limit <= 0 then
    return false;  -- fonctionnalité fermée à ce palier
  end if;

  bucket := case when p_monthly
                 then date_trunc('month', current_date)::date
                 else current_date end;

  insert into ai_usage (profile_id, day, kind, count)
  values (p_profile_id, bucket, p_kind, 1)
  on conflict (profile_id, day, kind)
  do update set count = ai_usage.count + 1
    where ai_usage.count < p_limit
  returning 1 into allowed;

  return allowed is not null;
end;
$$ language plpgsql security definer;

-- Consommation du mois en cours, pour afficher « il te reste 2 scans ».
create or replace function public.ai_usage_this_month(p_profile_id uuid)
returns table (kind text, used int) as $$
  select kind, count
  from ai_usage
  where profile_id = p_profile_id
    and day = date_trunc('month', current_date)::date;
$$ language sql security definer;
