-- Kairo — colonne pour afficher une flèche (hausse/baisse/stable) + le % à
-- côté de chaque startup sur le site, correspondant au mouvement du jour de
-- sa valorisation (pas le score momentum interne, la vraie valorisation
-- affichée en K¢ — voir app/page.js > currentPostMoneyEur).
--
-- Aucune table n'enregistrait jusqu'ici la valorisation de la veille par
-- startup (signal_history ne loggue que mentions/sentiment presse — voir
-- 011_relative_valuation.sql — et portfolio_snapshots est par utilisateur,
-- pas par startup — voir 016_portfolio_snapshots.sql), donc impossible de
-- calculer une variation jour/jour côté frontend sans nouvelle donnée.
--
-- Plutôt qu'un historique complet (plus lourd, pas nécessaire pour un simple
-- indicateur du jour), on stocke directement le % de variation calculé par
-- le cron au moment où il fait bouger valuation_offset_pct (voir
-- app/api/refresh-valuations/route.js, Phase 2) : comme l'ancre ne bouge pas
-- dans cette phase (elle ne bouge que sur une vraie levée détectée, Phase 1),
-- la variation de la valorisation affichée entre avant/après ce passage du
-- cron est exactement (nouvel_écart - ancien_écart) / (1 + ancien_écart).
--
-- A executer une seule fois dans Supabase > SQL Editor, après
-- 020_new_signal_backed_roster.sql.

alter table startups
  add column if not exists daily_change_pct numeric not null default 0;
