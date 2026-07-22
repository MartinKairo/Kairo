// Signal universel obligatoire "Levées de fonds récentes" — voir lib/scoring/config.js
// pour son rôle dans la formule (40% du score, le plus pondéré des 3 signaux
// universels : funding, trends, press).
//
// Il n'existe plus, en 2026, d'API de données de funding structurées et
// gratuite sans limite : Crunchbase a fermé son tier gratuit (payant dès
// $49/mois), Dealroom/Tracxn/PitchBook sont payants ou sur devis. On a
// initialement essayé StartupHub.ai (clé "sk_live_..."), mais son plan gratuit
// n'expose pas le champ de montant réel (`total_funding`), seulement un score
// propriétaire, et son quota de crédits s'épuise en quelques rafraîchissements
// — abandonné.
//
// On réutilise donc les mêmes flux RSS de presse tech française que le signal
// presse (voir lib/scoring/sources/rss.js) : ces médias (Maddyness, TechCrunch
// France, FrenchWeb) annoncent systématiquement les levées de fonds
// françaises, en général avec le montant dans le titre
// ("X lève Y millions d'euros..."). Recherche sur mot(s) entier(s) du nom
// (comme le signal presse) + présence d'un mot-clé de levée dans le même
// article ; le montant est extrait par regex quand il est présent.
//
// Limites assumées, dans le même esprit honnête que le signal presse :
//  - c'est une extraction par mots-clés + regex sur du texte journalistique,
//    pas une base de données structurée : un montant mal formaté, exprimé
//    autrement ("deux millions"), ou une levée non couverte par ces 3 flux ne
//    sera pas détecté.
//  - un flux RSS n'expose que ses articles les plus récents, donc ce signal
//    reflète les levées "en ce moment" plutôt qu'une fenêtre fixe de X jours.
//  - la plupart des startups auront 0 la plupart du temps : c'est honnête (pas
//    de levée récente ≠ défaut du système), au même titre que le signal presse.
//
// Contrairement au bonus GitHub, ce signal est UNIVERSEL et doit toujours avoir
// une valeur : ok:false n'arrive que si la récupération des flux eux-mêmes a
// échoué (voir fetchFeeds dans rss.js) ; l'appelant doit alors garder la
// dernière valeur connue en base plutôt que de mettre 0.

import { fetchFeeds } from "./rss";

// Partagé avec le signal presse : mêmes flux, un seul fetch pour les deux
// (voir app/api/refresh-funding/route.js).
export const fetchFundingFeeds = fetchFeeds;

const FUNDING_KEYWORDS =
  /\b(l[eè]ve|l[eè]vent|lev[ée]e|raises?|funding round|tour de table|financement|s[ée]rie [abc]|series [abc])\b/i;

const FUNDING_FLOOR = 1_000_000; // 1M€/$ ou moins levés = score plancher (20)
const FUNDING_CAP = 100_000_000; // 100M€/$ ou plus levés = score max (100)
const FLOOR_SCORE = 20;

// Score attribué quand une levée est détectée (nom + mot-clé dans le même
// article) mais qu'aucun montant n'a pu être extrait du texte.
const DEFAULT_MENTION_SCORE = 50;

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Extrait un montant depuis un texte du type "150 millions d'euros", "150M€",
// "$45M", "45 million". Retourne le montant en unités (pas en millions), ou
// null si aucun montant exploitable n'est trouvé.
function extractAmount(text) {
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(?:m(?:illions?)?\b|m€|m\$)/i);
  if (!match) return null;
  const value = parseFloat(match[1].replace(",", "."));
  if (Number.isNaN(value)) return null;
  return value * 1_000_000;
}

function scoreFromAmount(amount) {
  if (amount >= FUNDING_CAP) return 100;
  if (amount <= FUNDING_FLOOR) return FLOOR_SCORE;

  const logScore =
    (Math.log10(amount) - Math.log10(FUNDING_FLOOR)) /
    (Math.log10(FUNDING_CAP) - Math.log10(FUNDING_FLOOR));

  return Math.round(FLOOR_SCORE + logScore * (100 - FLOOR_SCORE));
}

export function getFundingScore(startupName, feeds) {
  if (!feeds.length) return { ok: false, score: null };

  // Correspondance sur mot(s) entier(s), comme le signal presse : \b évite
  // qu'un nom court matche à l'intérieur d'un mot plus long.
  const namePattern = new RegExp(`\\b${escapeRegExp(startupName)}\\b`, "i");
  let bestScore = 0;

  for (const items of feeds) {
    for (const item of items) {
      const haystack = `${item.title ?? ""} ${item.contentSnippet ?? ""}`;
      if (!namePattern.test(haystack) || !FUNDING_KEYWORDS.test(haystack)) continue;

      const amount = extractAmount(haystack);
      const score = amount !== null ? scoreFromAmount(amount) : DEFAULT_MENTION_SCORE;
      if (score > bestScore) bestScore = score;
    }
  }

  return { ok: true, score: bestScore };
}
