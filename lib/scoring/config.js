// Formule du score de momentum (V1)
//
// Le score de momentum d'une startup est une moyenne pondérée de 4 signaux,
// chacun normalisé entre 0 et 100 par sa propre fonction (voir lib/scoring/sources/).
//
// Pour ajuster l'importance d'un signal, change uniquement les valeurs ci-dessous.
export const MOMENTUM_WEIGHTS = {
  funding: 0.35, // Levées / funding récent
  github: 0.25, // Activité GitHub (stars, fraîcheur des commits/releases)
  trends: 0.25, // Tendance de recherche (Google Trends)
  press: 0.15, // Mentions presse récentes
};

export function computeMomentumScore({ funding, github, trends, press }) {
  const score =
    funding * MOMENTUM_WEIGHTS.funding +
    github * MOMENTUM_WEIGHTS.github +
    trends * MOMENTUM_WEIGHTS.trends +
    press * MOMENTUM_WEIGHTS.press;
  return Math.round(score * 10) / 10;
}
