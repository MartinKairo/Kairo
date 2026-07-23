// Kairo v2 — moteur de calcul "capital + dilution" (voir supabase/007_equity_model.sql
// pour le schéma correspondant). Remplace le système de "score × multiplicateur"
// (lib/market.js, lib/scoring/config.js) qui fixait un prix de part arbitraire.
//
// Principe : investir X K¢ dans une startup achète un % de son capital, calculé
// à la valorisation post-money du dernier tour connu. Fonctions pures (aucun
// accès réseau/DB ici) pour rester faciles à tester et à réutiliser à la fois
// côté API (calcul qui fait foi) et côté UI (aperçu avant confirmation).

// 1 K¢ fictif = 100 € de pouvoir d'investissement réel simulé. Avec les
// 1 000 K¢ de départ (voir lib/market.js STARTING_CASH et
// supabase/012_lower_starting_cash.sql), ça donne un pouvoir d'investissement
// total de 100 000 € par utilisateur — volontairement modeste face à des
// startups valorisées plusieurs milliards d'euros, pour ne prendre qu'une
// position minoritaire même en misant tout sur une seule (voir brief
// 2026-07-24 : abaissé depuis 10 000 K¢/500 M€, en passant par une étape
// intermédiaire à 50 000 €/K¢ jamais déployée, écartée car elle aurait
// donné un capital de départ ridiculement bas en K¢ affichés — 2 K¢ — pour
// représenter 100 000 €).
export const EUR_PER_KC = 100;

// Un utilisateur ne peut pas détenir plus de 20% du capital d'une startup au
// total (cumulé sur tous ses achats), même si son solde le permettrait —
// sinon un joueur pourrait mécaniquement racheter la quasi-totalité d'une
// petite startup en y mettant tout son budget, ce qui casse le réalisme (il y
// a toujours d'autres actionnaires en vrai). Voir brief "Règle de plafonnement".
export const MAX_STAKE_PCT_PER_STARTUP = 0.2;

// % de capital obtenu en investissant amountKc dans une startup valorisée
// currentPostMoneyEur (post-money du dernier tour connu, voir la vue SQL
// startup_valuations). Retourne une fraction (0.054 = 5.4%), pas un pourcentage.
export function equityPctForInvestment(amountKc, currentPostMoneyEur) {
  if (!currentPostMoneyEur || currentPostMoneyEur <= 0) return 0;
  const amountEur = amountKc * EUR_PER_KC;
  return amountEur / currentPostMoneyEur;
}

// Valeur actuelle en K¢ d'une position (equityPct détenu, à la valorisation
// courante) — sert à afficher la valeur du portefeuille ET à calculer combien
// de K¢ un utilisateur récupère en vendant equityPct.
export function kcValueOfEquity(equityPct, currentPostMoneyEur) {
  if (!currentPostMoneyEur || currentPostMoneyEur <= 0) return 0;
  return (equityPct * currentPostMoneyEur) / EUR_PER_KC;
}

// Combien un utilisateur peut encore investir (en K¢) dans une startup avant
// d'atteindre le plafond de 20% de capital détenu, compte tenu de ce qu'il
// détient déjà (existingEquityPct).
export function maxInvestableKc(existingEquityPct, currentPostMoneyEur) {
  const remainingPct = Math.max(0, MAX_STAKE_PCT_PER_STARTUP - existingEquityPct);
  return kcValueOfEquity(remainingPct, currentPostMoneyEur);
}

// Nouveau % détenu après un nouveau tour à newPostMoneyEur, sachant que
// l'utilisateur détenait oldEquityPct à l'ancienne valorisation oldPostMoneyEur
// (dilution proportionnelle, sans clause anti-dilution — cas simple retenu
// pour le MVP). Répliqué ici en JS pour les previews côté UI ; le calcul qui
// fait foi côté serveur est la fonction SQL record_financing_round.
export function dilutedEquityPct(oldEquityPct, oldPostMoneyEur, newPostMoneyEur) {
  if (!oldPostMoneyEur || !newPostMoneyEur || newPostMoneyEur <= 0) return oldEquityPct;
  return oldEquityPct * (oldPostMoneyEur / newPostMoneyEur);
}

// Stade indicatif d'une startup à partir de sa valorisation courante, pour
// affichage uniquement (early = plus volatile/gros %, late = plus stable/petit
// %). Seuils volontairement simples pour un MVP, à ajuster si besoin.
export function stageFromValuation(currentPostMoneyEur) {
  if (!currentPostMoneyEur) return null;
  if (currentPostMoneyEur < 100_000_000) return "early";
  if (currentPostMoneyEur < 1_000_000_000) return "growth";
  return "late";
}
