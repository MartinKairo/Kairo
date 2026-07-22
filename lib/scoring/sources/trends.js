// Signal universel obligatoire "Tendance de recherche" — voir lib/scoring/config.js
// pour son rôle dans la formule (20% du score, avec funding et presse).
//
// Utilise Google Trends (bibliothèque non officielle, gratuite, sans clé API) pour
// mesurer l'intérêt de recherche pour le nom de la startup sur les 3 derniers mois.
// Google Trends renvoie déjà un score 0-100 relatif au pic d'intérêt de la période.
//
// Contrairement au bonus GitHub, ce signal est UNIVERSEL et doit toujours avoir une
// valeur : en cas d'échec (API non officielle, donc instable), on garde la dernière
// valeur connue en base plutôt que de mettre 0, qui pénaliserait injustement la startup.
//
// Retourne un objet { ok, score } :
//   - ok: true  -> score calculé normalement (0-100)
//   - ok: false -> échec de l'API, l'appelant doit garder la dernière valeur connue

import googleTrends from "google-trends-api";

export async function getTrendsScore(startupName) {
  try {
    const raw = await googleTrends.interestOverTime({
      keyword: startupName,
      startTime: new Date(Date.now() - 90 * 86_400_000),
    });

    const points = JSON.parse(raw)?.default?.timelineData ?? [];
    if (!points.length) return { ok: false, score: null };

    const latest = points[points.length - 1].value?.[0];
    if (typeof latest !== "number") return { ok: false, score: null };

    return { ok: true, score: Math.round(latest) };
  } catch (err) {
    console.error(`[trends score] échec pour "${startupName}":`, err.message);
    return { ok: false, score: null };
  }
}
