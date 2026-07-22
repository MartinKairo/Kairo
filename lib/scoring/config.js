// Formule du score de momentum (V2)
//
// Deux catégories de signaux, pour ne jamais pénaliser une startup dont le secteur
// ne produit pas naturellement un signal donné (ex : une fintech n'a pas de raison
// d'avoir un repo GitHub actif comme une startup IA) :
//
// 1. Signaux universels obligatoires (80% du score) — calculés pour TOUTE startup :
//    - funding : levées de fonds récentes
//    - hiring  : recrutement (offres actives, rythme d'embauche)
//    - press   : mentions presse / buzz réseaux sociaux
//
// 2. Signal bonus sectoriel (jusqu'à 20% du score) — ajouté seulement s'il est
//    disponible et pertinent pour la startup :
//    - github  : activité GitHub (repo public actif)
//
// Si le signal bonus n'est pas applicable (pas de repo public pertinent), il est
// simplement ABSENT du calcul plutôt que compté comme faible : le score se
// recalcule alors sur 100% à partir des seuls signaux universels, en conservant
// les mêmes proportions entre eux (funding 50%, hiring 25%, press 25%).
// Résultat : le score maximum atteignable est le même, avec ou sans bonus GitHub.
//
// Pour ajouter un futur signal bonus (ex: classement App Store), ajoute-le ici
// suivant le même principe : jamais soustrait, jamais compté comme faible si absent.
export const UNIVERSAL_WEIGHTS = {
  funding: 0.4,
  hiring: 0.2,
  press: 0.2,
};

export const GITHUB_BONUS_MAX_POINTS = 20; // sur 100, uniquement si applicable

export function computeMomentumScore({ funding, hiring, press, github }) {
  const universalScore =
    funding * UNIVERSAL_WEIGHTS.funding +
    hiring * UNIVERSAL_WEIGHTS.hiring +
    press * UNIVERSAL_WEIGHTS.press;

  const isGithubApplicable = github !== null && github !== undefined;

  if (!isGithubApplicable) {
    const universalWeightSum =
      UNIVERSAL_WEIGHTS.funding + UNIVERSAL_WEIGHTS.hiring + UNIVERSAL_WEIGHTS.press;
    return round1(universalScore / universalWeightSum);
  }

  const githubBonus = (github / 100) * GITHUB_BONUS_MAX_POINTS;
  return round1(universalScore + githubBonus);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
