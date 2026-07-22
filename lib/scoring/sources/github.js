// Signal "Activité GitHub" — pondéré à 25% dans le score de momentum (voir lib/scoring/config.js).
//
// Principe : on regarde le dépôt le plus étoilé de l'organisation GitHub de la startup,
// et on combine deux mesures normalisées 0-100 :
//   - popularité : nombre d'étoiles (échelle logarithmique, plafonnée à 5000 étoiles)
//   - fraîcheur : nombre de jours depuis le dernier push (100 = aujourd'hui, 0 = 180+ jours)
//
// En cas d'erreur (org introuvable, API indisponible, quota dépassé...), on ne fait
// jamais planter le calcul global : on retourne une valeur neutre (50).

const NEUTRAL_SCORE = 50;
const STARS_CAP = 5000;
const STALE_AFTER_DAYS = 180;

export async function getGithubScore(githubOrg) {
  if (!githubOrg) return NEUTRAL_SCORE;

  try {
    const repos = await fetchOrgRepos(githubOrg);
    if (!repos.length) return NEUTRAL_SCORE;

    const primary = repos.reduce((best, repo) =>
      repo.stargazers_count > best.stargazers_count ? repo : best
    );

    const popularity =
      Math.min(100, (Math.log10(primary.stargazers_count + 1) / Math.log10(STARS_CAP)) * 100);

    const daysSincePush = (Date.now() - new Date(primary.pushed_at).getTime()) / 86_400_000;
    const freshness = Math.max(0, 100 - (daysSincePush / STALE_AFTER_DAYS) * 100);

    return Math.round(popularity * 0.5 + freshness * 0.5);
  } catch (err) {
    console.error(`[github score] échec pour l'org "${githubOrg}":`, err.message);
    return NEUTRAL_SCORE;
  }
}

async function fetchOrgRepos(org) {
  const res = await fetch(
    `https://api.github.com/orgs/${org}/repos?sort=pushed&per_page=15`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
      cache: "no-store",
    }
  );
  if (!res.ok) {
    throw new Error(`GitHub API a répondu ${res.status} pour l'org "${org}"`);
  }
  return res.json();
}
