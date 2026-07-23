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
const BUZZ_POSITIVE_RANGE = [0.06, 0.15]; // bon buzz : +6% à +15%
const BUZZ_NEGATIVE_RANGE = [0.09, 0.22]; // mauvais buzz : -9% à -22% (volontairement plus fort)

// -- Amortissement / bornes --
const DAILY_DECAY = 0.9; // l'écart courant se réduit d'~10%/jour (le buzz "retombe")
const OFFSET_CLAMP = 0.4; // ±40% autour de l'ancre, infranchissable sans nouvelle levée réelle

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
export function computeNextOffset({ oldOffsetPct, today, priorHistory, recentHistoryWithToday }) {
  const decayed = oldOffsetPct * DAILY_DECAY;
  const trendIncrement = computeTrend(recentHistoryWithToday);
  const buzzJump = computeBuzz(priorHistory, today);

  const raw = decayed + trendIncrement + buzzJump;
  const clamped = Math.max(-OFFSET_CLAMP, Math.min(OFFSET_CLAMP, raw));

  return { newOffsetPct: clamped, trendIncrement, buzzJump };
}

export const MOMENTUM_CONSTANTS = {
  TREND_WINDOW_DAYS,
  TREND_MIN_DAYS,
  BUZZ_MIN_HISTORY_DAYS,
};
