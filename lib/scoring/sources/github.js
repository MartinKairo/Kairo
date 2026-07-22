// Signal bonus "Activité GitHub" — voir lib/scoring/config.js pour son rôle dans la formule.
//
// Ce signal n'est OFFERT en bonus que lorsqu'il est pertinent (repo public actif).
// Il ne doit jamais pénaliser une startup dont le secteur ne produit pas ce signal.
//
// Retourne un objet { applicable, score } :
//   - applicable: true  -> repo trouvé, score calculé normalement (0-100)
//   - applicable: false -> pas d'org GitHub, ou org sans repo public : signal absent du calcul
//   - applicable: "error" -> l'API a échoué (quota, réseau...) : l'appelant doit garder
//     la dernière valeur connue plutôt que de supposer une absence ou un score neutre
//
// Quand applicable est true, le score combine deux mesures 0-100 :
//   - popularité : nombre d'étoiles (échelle logarithmique, plafonnée à 5000 étoiles)
//   - fraîcheur : nombre de jours depuis le dernier push (100 = aujourd'hui, 0 = 180+ jours)

const STARS_CAP = 5000;
const STALE_AFTER_DAYS = 180;

export async function getGithubScore(githubOrg) {
  if (!githubOrg) return { applicable: false, score: null };

  try {
    const repos = await fetchOrgRepos(githubOrg);
    if (!repos.length) return { applicable: false, score: null };

    const primary = repos.reduce((best, repo) =>
      repo.stargazers_count > best.stargazers_count ? repo : best
    );

    const popularity =
      Math.min(100, (Math.log10(primary.stargazers_count + 1) / Math.log10(STARS_CAP)) * 100);

    const daysSincePush = (Date.now() - new Date(primary.pushed_at).getTime()) / 86_400_000;
    const freshness = Math.max(0, 100 - (daysSincePush / STALE_AFTER_DAYS) * 100);

    return { applicable: true, score: Math.round(popularity * 0.5 + freshness * 0.5) };
  } catch (err) {
    console.error(`[github score] échec pour l'org "${githubOrg}":`, err.message);
    return { applicable: "error", score: null };
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
