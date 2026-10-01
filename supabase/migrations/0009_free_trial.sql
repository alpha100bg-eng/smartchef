-- Essai gratuit de 7 jours, tout ouvert.
--
-- Le palier gratuit ferme totalement le plan de repas : un nouvel utilisateur
-- ne pouvait donc jamais voir la fonctionnalité la plus convaincante de l'app.
-- On ne peut pas vouloir ce qu'on n'a jamais vu.
--
-- L'essai donne les quotas Premium pendant 7 jours, puis l'utilisateur retombe
-- au gratuit — avec, cette fois, une idée précise de ce qu'il perd.

alter table profiles
  add column trial_ends_at timestamptz not null default now() + interval '7 days';

-- Les comptes existants n'en avaient pas : ils commencent leur essai
-- maintenant plutôt que de le voir déjà expiré.
update profiles set trial_ends_at = now() + interval '7 days';

-- La date de fin d'essai rejoint les champs de facturation : sans cela,
-- n'importe qui pourrait repousser sa propre échéance indéfiniment avec sa
-- seule clé publishable.
create or replace function public.forbid_self_upgrade()
returns trigger as $$
begin
  -- auth.uid() est null quand la clé de service agit (webhook Stripe) :
  -- dans ce cas on laisse passer.
  if auth.uid() is not null and (
       new.plan is distinct from old.plan
    or new.premium_until is distinct from old.premium_until
    or new.trial_ends_at is distinct from old.trial_ends_at
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.stripe_subscription_id is distinct from old.stripe_subscription_id
  ) then
    raise exception 'billing fields are not user-writable';
  end if;
  return new;
end;
$$ language plpgsql security definer;
