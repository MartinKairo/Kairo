-- Kairo — pseudo public + classement, prérequis avant "clubs/championnats"
-- (voir échange du 2026-07-24 : pas d'identité publique aujourd'hui — seul
-- l'email est connu côté serveur — et RLS sur portfolio/positions bloque
-- tout accès aux données des autres joueurs, donc pas de classement
-- possible sans une brique dédiée).
--
-- IMPORTANT — pourquoi une nouvelle table "public_profiles" plutôt que
-- "profiles" : une table "profiles" existe déjà (voir
-- 010_notifications.sql), mais elle sert à un usage totalement différent —
-- dupliquer l'EMAIL (privé) pour les notifications, avec une policy de
-- lecture restreinte à auth.uid() = user_id (using (auth.uid() = user_id),
-- donc PRIVÉE). Réutiliser cette même table pour le pseudo aurait forcé soit
-- (a) une collision de schéma (elle n'a pas de colonne display_name, d'où
-- l'erreur "column display_name does not exist" lors du premier essai de
-- cette migration), soit (b) si on avait ajouté display_name + une policy
-- SELECT "using (true)" dessus : comme les policies RLS permissives d'une
-- même table sont combinées en OR, ça aurait rendu TOUTE la table lisible
-- par tout le monde, colonne email comprise -> fuite de l'email de tous les
-- joueurs. D'où une table séparée, dédiée exclusivement au pseudo public,
-- qui ne contient et n'a jamais accès à l'email.
--
-- Trois briques, dans l'ordre :
--   1. public_profiles : un pseudo public par utilisateur (jamais l'email,
--      qui reste dans la table privée profiles/auth.users). Lecture ouverte
--      à tous (un pseudo n'a rien de sensible), écriture réservée à son
--      propre profil.
--   2. portfolio_values : valeur totale du portefeuille (cash + positions à
--      la valorisation courante, ancre × (1+valuation_offset_pct) — voir
--      011_relative_valuation.sql) calculée côté SQL, pas dans le
--      navigateur de chacun.
--   3. leaderboard : assemble les deux, mais n'expose QUE pseudo + valeur
--      totale — jamais le cash ni le détail des positions de quelqu'un
--      d'autre, qui restent privés.
--
-- Comme les autres vues du projet (startup_valuations en 007), ces vues sont
-- créées par le rôle utilisé dans l'éditeur SQL Supabase (postgres), qui a
-- l'attribut BYPASSRLS : elles peuvent donc lire toutes les lignes de
-- portfolio/positions (normalement restreintes par RLS à auth.uid() =
-- user_id) pour construire l'agrégat, tout en ne RETOURNANT elles-mêmes que
-- les colonnes volontairement choisies ci-dessous. C'est le mécanisme
-- standard Postgres/Supabase pour exposer un agrégat public à partir de
-- données par ailleurs privées — voir aussi les fonctions security definer
-- existantes (handle_new_user, settle_exit...) qui reposent sur le même
-- principe.
--
-- A executer une seule fois dans Supabase > SQL Editor, après 013_midsize_startups.sql.
-- (Si le tout premier essai de cette migration a échoué sur l'insert de
-- backfill à cause de la collision "profiles" décrite ci-dessus, ce fichier
-- corrigé peut être exécuté tel quel : toutes les commandes ci-dessous sont
-- idempotentes / rejouables sans risque.)

-- 1) Pseudo public — table dédiée, distincte de "profiles" (privée, email).
create table if not exists public_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  updated_at timestamptz not null default now()
);
alter table public_profiles enable row level security;

drop policy if exists "Tout le monde peut lire les pseudos" on public_profiles;
create policy "Tout le monde peut lire les pseudos"
  on public_profiles for select
  using (true);

drop policy if exists "Chacun cree son propre profil public" on public_profiles;
create policy "Chacun cree son propre profil public"
  on public_profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "Chacun modifie son propre pseudo" on public_profiles;
create policy "Chacun modifie son propre pseudo"
  on public_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Pseudo par défaut = partie locale de l'email (avant le @), modifiable
-- ensuite par l'utilisateur (voir policy update ci-dessus). Trigger séparé de
-- handle_new_user (005/006/012, qui crée les lignes portfolio/profiles)
-- plutôt que fusionné dedans, pour garder chaque trigger responsable d'une
-- seule table.
create or replace function public.handle_new_user_public_profile()
returns trigger as $$
begin
  insert into public.public_profiles (user_id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created_public_profile on auth.users;
create trigger on_auth_user_created_public_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_public_profile();

-- Backfill pour les comptes déjà inscrits (le trigger ne joue que pour les
-- FUTURS inscrits) : contrairement au cash (012_lower_starting_cash.sql,
-- volontairement pas rétroactif car ça touche de l'argent fictif engagé), un
-- pseudo par défaut n'a aucun impact financier -> on peut backfiller sans
-- risque. Chacun pourra le personnaliser ensuite.
insert into public.public_profiles (user_id, display_name)
select id, split_part(email, '@', 1)
from auth.users
on conflict (user_id) do nothing;

-- 2) Valorisation courante d'une startup EN TENANT COMPTE de l'oscillation du
-- jour (startup_valuations, en 007, ne donne que l'ancre brute). Même formule
-- que app/page.js : anchor * (1 + valuation_offset_pct).
create or replace view startup_current_valuations as
select
  sv.startup_id,
  sv.current_post_money_eur as anchor_post_money_eur,
  s.valuation_offset_pct,
  sv.current_post_money_eur * (1 + s.valuation_offset_pct) as current_post_money_eur
from startup_valuations sv
join startups s on s.id = sv.startup_id;

-- Valeur totale du portefeuille de chaque utilisateur, en K¢. Le taux de
-- conversion (100, voir EUR_PER_KC dans lib/investing/equity.js) est
-- volontairement écrit en dur ici comme il l'est déjà dans STARTING_CASH côté
-- SQL (012) : si EUR_PER_KC change un jour, cette vue devra être mise à jour
-- en même temps.
create or replace view portfolio_values as
select
  p.user_id,
  p.cash,
  coalesce(sum(pos.equity_pct * scv.current_post_money_eur), 0) / 100 as positions_value_kc,
  p.cash + coalesce(sum(pos.equity_pct * scv.current_post_money_eur), 0) / 100 as total_value_kc
from portfolio p
left join positions pos on pos.user_id = p.user_id and pos.equity_pct > 0
left join startup_current_valuations scv on scv.startup_id = pos.startup_id
group by p.user_id, p.cash;

-- 3) Classement public : uniquement pseudo + valeur totale, jamais le cash ni
-- le détail des positions de quelqu'un d'autre.
create or replace view leaderboard as
select
  pr.display_name,
  pv.total_value_kc
from portfolio_values pv
join public_profiles pr on pr.user_id = pv.user_id
order by pv.total_value_kc desc;
