-- Kairo — retire du site les startups qui n'ont pas de signal réel et
-- récurrent (voir échange du 2026-07-24 sur le risque « le jeu devient de
-- la chance » + le risque juridique de faire bouger une valorisation à
-- partir de rien pour une entreprise réelle et identifiable).
--
-- Nouveau critère de présence sur le site : une startup doit avoir À LA
-- FOIS (a) un tour de financement réellement sourcé par la presse
-- (déjà le cas pour toutes, voir 008/011/013) ET (b) un signal GitHub
-- exploitable (github_org réel, avec des repos actifs — voir
-- lib/scoring/sources/github.js), qui sert de donnée de fond pour faire
-- bouger la valorisation même les jours sans actualité presse.
--
-- Les 22 startups ci-dessous n'ont jamais eu de github_org renseigné
-- (colonne NULL depuis leur insertion en 008/011/013) : sans lui, leur
-- valorisation ne bougeait qu'au bruit de marché synthétique (voir
-- 018_market_noise.sql), c'est-à-dire un vrai 50/50 aléatoire non ancré
-- dans une donnée réelle — exactement le problème soulevé.
--
-- Suppression simple (pas de settle_exit) : au moment de l'exécution,
-- l'auteur du site est le seul utilisateur, donc aucune position réelle
-- à liquider/rembourser. Toutes les tables qui référencent startup_id
-- (positions, financing_rounds, valuation_signals, signal_history,
-- club_holdings, etc.) utilisent "on delete cascade" (voir 005, 006, 007,
-- 009, 011), donc la suppression est propre.
--
-- A executer une seule fois dans Supabase > SQL Editor, après
-- 018_market_noise.sql.

delete from startups
where name in (
  'Malt',
  'Exotec',
  'ManoMano',
  'Younited',
  'Vestiaire Collective',
  'Dploy',
  'Orakle Weather',
  'Kacentric Optics',
  'W Platform',
  'K-Ren',
  'Objow',
  'Ellipse Bikes',
  'Rivage (Proptech)',
  'Rivage (Paie)',
  'Twinsight',
  'Papernest',
  'Karos',
  'Yousign',
  'Lifen',
  'Ornikar',
  'Bionyra Pharma',
  'Skello'
);
