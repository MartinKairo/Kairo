-- Kairo — bruit de marché quotidien, pour garantir qu'une valorisation
-- bouge (au moins un peu) CHAQUE JOUR, y compris pour les startups qui
-- n'ont jamais d'article dans nos 3 flux presse (voir échange du
-- 2026-07-24 : sur 42 startups, seules ~10 apparaissent dans un snapshot
-- des flux — la majorité des petites startups seed n'aura quasiment
-- jamais de couverture). Sans ça, valuation_offset_pct restait figé à 0%
-- pour la plupart des startups, ce qui ne donnait aucune raison de revenir
-- voir le marché tous les jours.
--
-- Principe (voir lib/scoring/sources/momentum.js) : chaque startup a un
-- régime persistant (croissance / stagnation / décroissance) qui change
-- rarement (~8% de chance par jour), et qui biaise un petit pas
-- déterministe quotidien (seed = startup_id + date, PAS un vrai tirage
-- Math.random() à chaque appel, pour rester idempotent si le cron est
-- rejoué le même jour). Ce bruit s'ADDITIONNE à la tendance/buzz presse
-- existante (qui reste le "vrai" signal quand il existe) plutôt que de la
-- remplacer, et reste soumis au même plafond ±40% autour de l'ancre.
--
-- Comme le reste de valuation_offset_pct, ce mécanisme ne touche JAMAIS
-- l'ancre (dernière levée réelle sourcée) — uniquement l'oscillation
-- synthétique autour de l'ancre, qui a toujours été un mécanisme de jeu et
-- non une donnée sourcée.
--
-- A executer une seule fois dans Supabase > SQL Editor, après
-- 017_anti_multi_account.sql.

alter table startups
  add column if not exists momentum_regime text not null default 'stagnation'
    check (momentum_regime in ('croissance', 'stagnation', 'decroissance'));
