// Calcul du mouvement quotidien de valorisation (valuation_offset_pct) de
// chaque startup. Consommé par app/api/refresh-valuations/route.js, une fois
// par jour, pour chaque startup ayant une ancre connue (une vraie levée déjà
// sourcée — voir supabase/007_equity_model.sql).
//
// Modèle (voir échange du 2026-07-24, "je veux juste que la valorisation de
// toutes les startups bougent quotidiennement selon un signal réel commun à
// toutes les entreprises") :
//   1. Tendance (ascendant / descendant / neutre) déduite d'un signal réel
//      commun aux 31 startups actives : leur score GitHub (voir
//      lib/scoring/sources/github.js et supabase/020_new_signal_backed_roster.sql,
//      qui garantit un github_org réel pour chacune). Pas de vote presse ici :
//      les flux RSS ne couvrent qu'une poignée de startups par jour, alors que
//      GitHub donne un signal quotidien exploitable pour toutes.
//   2. Amplitude du pas du jour : aléatoire (déterministe par seed), dans une
//      fourchette qui dépend du régime — voir computeMarketNoise plus bas.
//   3. Application : COMPOSITION multiplicative, pas de retour vers 0/l'ancre
//      et pas de plafond artificiel. L'ancienne mécanique (amortissement +
//      clamp ±40%) faisait plafonner tout portefeuille en quelques semaines,
//      quel que soit le signal — voir simulations du 2026-07-24. Le but
//      explicite est que le portefeuille du joueur (1000 K¢ au départ) puisse
//      grossir en milliers, voire plus, avec le temps : seule une vraie levée
//      détectée (Phase 1 de la route, record_financing_round) déplace
//      l'ANCRE elle-même ; ce module ne fait que composer l'oscillation
//      autour, sans limite haute ni retour forcé vers 0.

// -- Bruit de marché / amplitude quotidienne --
// Chaque startup a un régime persistant (croissance / stagnation /
// décroissance, stocké dans startups.momentum_regime — voir
// supabase/018_market_noise.sql), déduit chaque jour de son score GitHub
// (voir deriveGithubRegime plus bas). Seule l'AMPLITUDE exacte du pas du jour
// à l'intérieur de la fourchette du régime reste tirée aléatoirement — c'est
// la différence entre "la startup va bien/mal" (réel, déduit du score
// GitHub) et "de combien exactement aujourd'hui" (un aléa raisonnable, comme
// n'importe quel marché réel).
//
// Le tirage de l'amplitude reste déterministe (seed = startup_id + date), pas
// Math.random() brut : un rejeu du cron le même jour (retry Vercel...) doit
// retomber sur exactement le même résultat plutôt que de re-tirer un nouveau
// pas à chaque appel.
const REGIMES = ["croissance", "stagnation", "decroissance"];

// Bandes de score GitHub (0-100, voir lib/scoring/sources/github.js) pour
// déduire le régime du jour. Seuils volontairement larges (pas de zone
// "neutre" trop étroite) : un repo qui pousse régulièrement et gagne des
// étoiles doit se traduire par une tendance ascendante la plupart du temps.
const GITHUB_REGIME_HIGH = 60; // score >= 60 -> croissance
const GITHUB_REGIME_LOW = 40; // score <= 40 -> décroissance
// entre les deux -> stagnation

// Amplitudes volontairement au-dessus du seuil de visibilité à l'affichage
// (formatKc arrondit ; même la plus petite startup du roster à ce jour,
// Dploy à 500 K€, a un "quantum" d'affichage d'environ 0,02% — ces bornes
// gardent une marge de sécurité large).
const NOISE_RANGE = {
  croissance: { min: 0.0015, max: 0.012, positiveBias: 0.82 },
  decroissance: { min: 0.0015, max: 0.012, positiveBias: 0.18 },
  stagnation: { min: 0.001, max: 0.004, positiveBias: 0.5 },
};

// PRNG déterministe (mulberry32) à partir d'une seed numérique — pas besoin
// d'être cryptographiquement sûr, juste reproductible pour une même seed.
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a, simple et suffisant pour transformer une chaîne (startup_id+date)
// en seed numérique stable.
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Déduit le régime du jour à partir du score GitHub déjà recalculé par
// l'appelant (voir route, signalGithub) — fonction pure, aucun aléa ici.
//
// signalGithub : score github.js du jour (0-100), ou null si la startup n'a
// pas (ou plus) de repo public exploitable (voir github.js, applicable:
// false) — dans ce cas on conserve le régime déjà en place plutôt que de le
// réinitialiser arbitrairement à "stagnation" (silence de signal ≠ arrêt de
// la dynamique déjà identifiée).
export function deriveGithubRegime({ currentRegime, signalGithub }) {
  if (signalGithub === null || signalGithub === undefined) {
    return REGIMES.includes(currentRegime) ? currentRegime : "stagnation";
  }
  if (signalGithub >= GITHUB_REGIME_HIGH) return "croissance";
  if (signalGithub <= GITHUB_REGIME_LOW) return "decroissance";
  return "stagnation";
}

// Pas du jour (rendement quotidien), toujours non nul, borné par régime.
export function computeMarketNoise({ startupId, dateStr, regime }) {
  const rng = mulberry32(hashSeed(`${startupId}|${dateStr}|noise`));
  const { min, max, positiveBias } = NOISE_RANGE[regime] ?? NOISE_RANGE.stagnation;
  const magnitude = min + rng() * (max - min);
  const sign = rng() < positiveBias ? 1 : -1;
  return sign * magnitude;
}

// Compose l'écart (valuation_offset_pct) du jour par capitalisation, sans
// amortissement ni plafond artificiel : nouvel_écart = (1+ancien_écart) ×
// (1+rendement_du_jour) - 1. C'est ce qui permet à une startup en croissance
// régulière de voir sa valorisation affichée s'éloigner durablement de son
// ancre (jusqu'à ce qu'une vraie levée vienne redéfinir l'ancre elle-même),
// au lieu de plafonner comme avec l'ancien modèle décroissance+clamp.
export function composeOffset({ oldOffsetPct, dailyReturn }) {
  return (1 + oldOffsetPct) * (1 + dailyReturn) - 1;
}
