-- Kairo — historique quotidien de la valeur du portefeuille, prérequis pour
-- un futur classement "du mois"/"de la semaine" (voir échange du 2026-07-24 :
-- "snapshots historiques pour un classement 'du mois'"). Sans ça, le
-- leaderboard (014) ne connaît que la valeur COURANTE de chaque portefeuille
-- — impossible de calculer une progression sur une période sans un point de
-- départ enregistré chaque jour.
--
-- Portée de cette migration : uniquement l'infrastructure (table + capture).
-- Pas de nouvel onglet UI "classement du mois" pour l'instant — ça viendra
-- une fois l'historique accumulé sur quelques jours (un classement de
-- progression sur un seul jour de données n'aurait pas grand sens).
--
-- A executer une seule fois dans Supabase > SQL Editor, après 015_clubs.sql.

-- 1) Un instantané par utilisateur et par jour (upsert si rejoué le même
-- jour — voir capture_portfolio_snapshots ci-dessous). Colonnes alignées sur
-- la vue portfolio_values (014) dont cette table est un instantané figé dans
-- le temps.
create table if not exists portfolio_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null,
  cash numeric not null,
  positions_value_kc numeric not null,
  total_value_kc numeric not null,
  created_at timestamptz not null default now(),
  primary key (user_id, snapshot_date)
);
alter table portfolio_snapshots enable row level security;

-- Historique privé : comme portfolio/positions, seul le propriétaire voit sa
-- propre progression (pas d'agrégat public prévu pour l'instant — voir
-- portée ci-dessus).
drop policy if exists "Chacun lit son propre historique" on portfolio_snapshots;
create policy "Chacun lit son propre historique"
  on portfolio_snapshots for select
  using (auth.uid() = user_id);

-- 2) Capture du jour pour tout le monde en un seul appel, réutilisée par le
-- cron quotidien (app/api/refresh-valuations/route.js, après la Phase 2
-- momentum). security definer car portfolio_values (vue BYPASSRLS, voir 014)
-- agrège déjà toutes les lignes ; cette fonction se contente d'écrire un
-- instantané par utilisateur, jamais de fuite vers un appelant non habilité
-- puisqu'elle n'est déclenchée que par le cron (côté serveur), pas exposée
-- dans l'UI.
create or replace function public.capture_portfolio_snapshots()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.portfolio_snapshots (user_id, snapshot_date, cash, positions_value_kc, total_value_kc)
  select user_id, current_date, cash, positions_value_kc, total_value_kc
  from public.portfolio_values
  on conflict (user_id, snapshot_date) do update
    set cash = excluded.cash,
        positions_value_kc = excluded.positions_value_kc,
        total_value_kc = excluded.total_value_kc;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
