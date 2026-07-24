// Calcul du "momentum" quotidien (tendance + buzz) d'une startup, à partir de
// son historique de signal presse (signal_history — voir
// supabase/011_relative_valuation.sql). Consommé par
// app/api/refresh-valuations/route.js, une fois par jour, pour chaque
// startup, APRÈS que le signal du jour a été inséré dans signal_history.
//
// Deux dimensions cumulatives (voir brief du 2026-07-23, "modèle A") :
//   1. Tendance (lente) : moyenne glissante du sentiment sur ~14 jours ->
//      dérive douce, seulement si assez d'historique ET si le sentiment
//      moyen dépasse un seuil de bruit (sinon une moyenne quasi nulle, ex.
//      0.03, ferait dériver la valo pour rien).
//   2. Buzz (rapide) : écart anormal du VOLUME de mentions du jour par
//      rapport à l'historique propre de la startup (z-score), avec une
//      direction donnée par le TON du jour. Asymétrique : une mauvaise
//      nouvelle fait plus mal qu'une bonne ne fait du bien (montants "mauvais
//      buzz" plus élevés que "bon buzz"), comme demandé explicitement.
// Les deux se cumulent, puis l'écart total est amorti (retour vers 0/l'ancre)
// et plafonné, pour ne jamais dériver indéfiniment tant qu'aucune levée
// réelle ne vient déplacer l'ancre elle-même (voir record_financing_round).

// -- Tendance --
const TREND_WINDOW_DAYS = 14; // fenêtre de la moyenne glissante
const TREND_MIN_DAYS = 7; // historique minimum pour oser calculer une tendance
const TREND_NOISE_THRESHOLD = 0.15; // sentiment moyen en dessous de ça = bruit, ignoré
const TREND_MAX_DAILY_DRIFT = 0.003; // ±0,3%/jour max

// -- Buzz --
const BUZZ_MIN_HISTORY_DAYS = 10; // historique minimum pour établir une "habitude"
const BUZZ_Z_THRESHOLD = 2; // écart-type à partir duquel un pic est "anormal"
const BUZZ_Z_SATURATION = 5; // au-delà, l'amplitude n'augmente plus (évite un choc démesuré sur un seul article viral)
const BUZZ_POSITIVE_RANGE = [0.06, 0.08]; // bon buzz : +6% à +8% (voir échange du 2026-07-24, bornes abaissées)
const BUZZ_NEGATIVE_RANGE = [0.09, 0.1]; // mauvais buzz : -9% à -10% (toujours volontairement plus fort que le bon buzz)

// -- Amortissement / bornes --
const DAILY_DECAY = 0.9; // l'écart courant se réduit d'~10%/jour (le buzz "retombe")
const OFFSET_CLAMP = 0.4; // ±40% autour de l'ancre, infranchissable sans nouvelle levée réelle

// -- Bruit de marché --
// Garantit qu'une valorisation bouge un minimum CHAQUE JOUR, même pour les
// startups qui n'ont pas d'événement presse assez fort aujourd'hui pour
// franchir les seuils de tendance/buzz ci-dessus (voir échange du
// 2026-07-24 : sur 42 startups, seules ~10 apparaissent dans un snapshot de
// nos 3 flux). Chaque startup a un régime persistant (croissance /
// stagnation / décroissance, stocké dans startups.momentum_regime — voir
// supabase/018_market_noise.sql) qui biaise un petit pas quotidien.
//
// Important (voir échange du 2026-07-24, suite) : CE régime n'est plus tiré
// au hasard. Il est déduit chaque jour de vraies données déjà collectées par
// le cron (voir deriveMomentumRegime plus bas) : une levée de fonds détectée
// dans la presse aujourd'hui, ou un ton d'article net (positif/négatif),
// fait basculer le régime dans le sens correspondant ; en l'absence de tout
// signal réel le jour même, le régime déjà en place est simplement conservé
// (silence médiatique ≠ arrêt de la dynamique déjà identifiée). Seule
// l'AMPLITUDE du pas du jour (magnitude + variation exacte à l'intérieur de
// la fourchette du régime) reste tirée aléatoirement — c'est la différence
// entre "la startup va bien/mal" (réel, déduit) et "de combien exactement
// aujourd'hui" (un aléa raisonnable, comme n'importe quel marché réel).
// Comme le reste de valuation_offset_pct, ça ne touche jamais l'ANCRE
// (dernière levée réelle sourcée) — uniquement l'oscillation autour.
//
// Le tirage de l'amplitude reste déterministe (seed = startup_id + date),
// pas Math.random() brut : un rejeu du cron le même jour (retry Vercel...)
// doit retomber sur exactement le même résultat plutôt que de re-tirer un
// nouveau pas à chaque appel.
const REGIMES = ["croissance", "stagnation", "decroissance"];

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

// Déduit le régime du jour à partir de vraies données déjà collectées par le
// cron (voir commentaire "Bruit de marché" plus haut) — fonction pure,
// aucun aléa ici.
//
// fundingScoreToday : score funding.js du jour (0 = aucune levée détectée
// dans la presse aujourd'hui pour cette startup ; > 0 = une levée a été
// détectée) — une levée est toujours traitée comme un signal positif net.
// sentimentToday : ton moyen des articles du jour classés par sentiment.js
// (voir getDailySentiment), même valeur que today.sentimentScore utilisé par
// computeBuzz — null si aucun article classé positif/négatif aujourd'hui.
//
// Priorité : une levée détectée l'emporte toujours (signal de croissance
// fort et non ambigu) ; sinon un ton net (au-delà du même seuil de bruit que
// la tendance, TREND_NOISE_THRESHOLD) tranche ; sinon, pas de signal réel
// aujourd'hui -> on conserve le régime déjà en place plutôt que de le
// réinitialiser arbitrairement à "stagnation".
export function deriveMomentumRegime({ currentRegime, fundingScoreToday = 0, sentimentToday = null }) {
  if (fundingScoreToday > 0) return "croissance";
  if (sentimentToday !== null) {
    if (sentimentToday >= TREND_NOISE_THRESHOLD) return "croissance";
    if (sentimentToday <= -TREND_NOISE_THRESHOLD) return "decroissance";
  }
  return REGIMES.includes(currentRegime) ? currentRegime : "stagnation";
}

// Pas du jour, toujours non nul, borné par régime.
export function computeMarketNoise({ startupId, dateStr, regime }) {
  const rng = mulberry32(hashSeed(`${startupId}|${dateStr}|noise`));
  const { min, max, positiveBias } = NOISE_RANGE[regime] ?? NOISE_RANGE.stagnation;
  const magnitude = min + rng() * (max - min);
  const sign = rng() < positiveBias ? 1 : -1;
  return sign * magnitude;
}

function mean(values) {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stddev(values, avg) {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// history : lignes signal_history de la startup, ANTÉRIEURES au jour courant,
// triées peu importe l'ordre — { mentionsCount, sentimentScore } (sentimentScore
// peut être null = jour neutre/silencieux, exclu des moyennes de ton mais PAS
// du calcul de volume).
function computeBuzz(history, today) {
  if (history.length < BUZZ_MIN_HISTORY_DAYS) return 0;
  if (today.sentimentScore === null || today.sentimentScore === 0) return 0; // pas de direction -> pas de buzz

  const counts = history.map((h) => h.mentionsCount);
  const avgCount = mean(counts);
  const sdCount = stddev(counts, avgCount);

  let z;
  if (sdCount === 0) {
    // Historique parfaitement plat (souvent : jamais mentionnée avant) —
    // toute mention aujourd'hui au-dessus de la moyenne plate est un signal
    // fort en soi, traité comme un dépassement net du seuil.
    if (today.mentionsCount <= avgCount) return 0;
    z = BUZZ_Z_THRESHOLD + 1;
  } else {
    z = (today.mentionsCount - avgCount) / sdCount;
  }

  if (z <= BUZZ_Z_THRESHOLD) return 0;

  const intensity = Math.min((z - BUZZ_Z_THRESHOLD) / (BUZZ_Z_SATURATION - BUZZ_Z_THRESHOLD), 1);
  const [min, max] = today.sentimentScore > 0 ? BUZZ_POSITIVE_RANGE : BUZZ_NEGATIVE_RANGE;
  const magnitude = min + intensity * (max - min);

  return today.sentimentScore > 0 ? magnitude : -magnitude;
}

// recentHistory : lignes signal_history des ~TREND_WINDOW_DAYS derniers
// jours, EN INCLUANT le jour courant (déjà upserté par l'appelant) —
// { sentimentScore } uniquement nécessaire.
function computeTrend(recentHistory) {
  const scored = recentHistory.filter((h) => h.sentimentScore !== null);
  if (scored.length < TREND_MIN_DAYS) return 0;

  const avgSentiment = mean(scored.map((h) => h.sentimentScore));
  if (Math.abs(avgSentiment) < TREND_NOISE_THRESHOLD) return 0;

  // avgSentiment est dans [-1, 1] -> dérive proportionnelle, plafonnée à
  // TREND_MAX_DAILY_DRIFT (atteinte seulement si le ton est unanimement extrême).
  return avgSentiment * TREND_MAX_DAILY_DRIFT;
}

// Point d'entrée : calcule le nouvel écart (valuation_offset_pct) à partir de
// l'ancien, du signal du jour et de l'historique. Fonction pure (aucun accès
// réseau/DB), pour rester testable facilement comme le reste de lib/scoring.
//
// priorHistory : historique AVANT aujourd'hui (sert de baseline au buzz).
// recentHistoryWithToday : fenêtre glissante récente, aujourd'hui inclus
// (sert à la tendance).
export function computeNextOffset({ oldOffsetPct, today, priorHistory, recentHistoryWithToday, marketNoise = 0 }) {
  const decayed = oldOffsetPct * DAILY_DECAY;
  const trendIncrement = computeTrend(recentHistoryWithToday);
  const buzzJump = computeBuzz(priorHistory, today);

  // marketNoise (voir plus haut) garantit un mouvement même quand
  // trendIncrement et buzzJump sont tous les deux à 0 (startup sans aucun
  // signal presse détecté aujourd'hui) — seul le clamp final (déjà en place
  // avant l'ajout du bruit) peut alors empêcher un mouvement visible, si
  // l'offset est déjà saturé à ±40% et que le bruit pousse dans le même sens.
  const raw = decayed + trendIncrement + buzzJump + marketNoise;
  const clamped = Math.max(-OFFSET_CLAMP, Math.min(OFFSET_CLAMP, raw));

  return { newOffsetPct: clamped, trendIncrement, buzzJump, marketNoise };
}

export const MOMENTUM_CONSTANTS = {
  TREND_WINDOW_DAYS,
  TREND_MIN_DAYS,
  BUZZ_MIN_HISTORY_DAYS,
};
