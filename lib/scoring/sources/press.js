// Signal universel obligatoire "Mentions presse / buzz" — voir lib/scoring/config.js
// pour son rôle dans la formule (20% du score, avec funding et Google Trends).
//
// Combine plusieurs flux RSS gratuits et publics de presse tech française
// (Maddyness, TechCrunch France, FrenchWeb — Les Echos Start bloque les requêtes
// automatisées, donc remplacé par FrenchWeb) et compte les mentions du nom de la
// startup dans les titres/résumés des articles les plus récents.
//
// Limite connue : un flux RSS n'expose que ses articles les plus récents (pas un
// historique complet), donc ce signal reflète le "buzz" du moment plutôt qu'une
// fenêtre fixe de X jours. La plupart des startups auront 0 mention la plupart
// du temps — c'est une mesure honnête du silence médiatique, pas un défaut du
// système. La recherche se fait sur des mots entiers (pas de sous-chaîne dans un
// mot plus long, ex: "Dust" ne matche plus "industrielle"), mais reste une simple
// correspondance de texte (pas de NLP) : un nom très courant (prénom, mot usuel)
// peut encore produire de faux positifs occasionnels.
//
// Contrairement au bonus GitHub, ce signal est UNIVERSEL et doit toujours avoir
// une valeur : en cas d'échec d'un flux, on utilise les flux qui ont répondu ; si
// TOUS échouent, l'appelant doit garder la dernière valeur connue en base.

import { fetchFeeds } from "./rss";

const MENTIONS_CAP = 3; // 3 mentions ou plus sur les flux récents = score max (100)

// Récupère les articles de tous les flux en un seul passage, à appeler UNE FOIS
// par rafraîchissement (pas une fois par startup) pour ne pas multiplier les
// requêtes vers ces services gratuits. Partagé avec le signal funding (voir
// lib/scoring/sources/rss.js) : mêmes flux, un seul fetch pour les deux.
export const fetchPressFeeds = fetchFeeds;

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getPressScore(startupName, feeds) {
  if (!feeds.length) return { ok: false, score: null };

  // Correspondance sur mot(s) entier(s) : \b évite qu'un nom court comme "Dust"
  // matche à l'intérieur d'un mot plus long comme "industrielle".
  const pattern = new RegExp(`\\b${escapeRegExp(startupName)}\\b`, "i");
  let mentions = 0;

  for (const items of feeds) {
    for (const item of items) {
      const haystack = `${item.title ?? ""} ${item.contentSnippet ?? ""}`;
      if (pattern.test(haystack)) mentions += 1;
    }
  }

  const score = Math.round((Math.min(mentions, MENTIONS_CAP) / MENTIONS_CAP) * 100);
  return { ok: true, score };
}
