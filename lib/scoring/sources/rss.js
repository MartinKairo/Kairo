// Récupération partagée des flux RSS de presse tech française, utilisée par
// deux signaux universels : presse (lib/scoring/sources/press.js) et funding
// (lib/scoring/sources/funding.js). Les deux se basent sur les mêmes articles
// (Maddyness, TechCrunch France, FrenchWeb couvrent aussi bien le "buzz"
// général que les annonces de levées de fonds), donc on ne fait qu'un seul
// fetch réutilisé par les deux signaux plutôt que de dupliquer les requêtes.
//
// Chaque route (refresh-press, refresh-funding) appelle fetchFeeds() une seule
// fois par rafraîchissement (pas une fois par startup), comme pour l'ancien
// fetchPressFeeds().

import Parser from "rss-parser";

export const FEEDS = [
  "https://www.maddyness.com/feed/",
  "https://techcrunch.com/tag/france/feed/",
  "https://www.frenchweb.fr/feed",
];

const parser = new Parser();

export async function fetchFeeds() {
  const results = await Promise.all(
    FEEDS.map(async (url) => {
      try {
        const feed = await parser.parseURL(url);
        return feed.items ?? [];
      } catch (err) {
        console.error(`[rss feeds] échec du flux "${url}":`, err.message);
        return null;
      }
    })
  );
  return results.filter((items) => items !== null);
}
