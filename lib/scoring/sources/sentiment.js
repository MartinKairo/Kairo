// Signal quotidien "tendance + buzz" — voir supabase/011_relative_valuation.sql
// pour le schéma (signal_history) et app/api/refresh-valuations/route.js pour
// la logique qui consomme ce module chaque jour.
//
// Contrairement à press.js (qui ne compte QUE le volume de mentions) et à
// valuation.js (qui cherche un ÉVÉNEMENT structuré tour/valorisation), ce
// module classe le TON de chaque article qui mentionne la startup, pour
// nourrir deux dimensions distinctes (voir brief du 2026-07-23, "modèle A") :
//   - la TENDANCE de fond (moyenne glissante du sentiment sur ~14 jours),
//   - le BUZZ (écart anormal du volume/sentiment du jour vs. l'historique
//     propre de la startup, détecté ailleurs via un z-score sur
//     signal_history — ce module ne fait que produire le signal du jour).
//
// Comme pour funding.js/press.js/valuation.js : classification par mots-clés
// français, pas de NLP. Un article neutre/ambigu (aucun mot-clé positif ou
// négatif détecté) ne compte pas comme signal négatif — il est simplement
// exclu de la moyenne du jour, pour ne pas polluer la tendance avec du bruit
// (silence de ton, pas silence médiatique : le compte de mentions, lui,
// inclut tous les articles trouvés, classés ou non).

import { fetchFeeds } from "./rss";

export const fetchSentimentFeeds = fetchFeeds;

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Mots-clés de presse économique française signalant une actualité
// favorable pour une startup — croissance, réussite, reconnaissance.
const POSITIVE_KEYWORDS =
  /\b(l[eè]ve|l[eè]vent|lev[ée]e de fonds|croissance|succ[eè]s|record|licorne|d[ée]collage|explose|forte progression|recrute|embauche|s['’]impose|leader|primé[e]?|r[ée]compens[ée]?|nomm[ée]e?|s['’]allie|partenariat|lance (?:une|un)|acc[ée]l[èe]re|rentable|profitable|ipo|entr[ée]e en bourse|d[ée]ploie|s['’]internationalise|conquiert|d[ée]coll[ée]?)\b/i;

// Mots-clés signalant une actualité défavorable — difficultés, échec,
// controverse. Volontairement plus large que le positif : un scandale ou un
// licenciement massif doit être détecté même formulé sobrement, cohérent
// avec le principe "une mauvaise nouvelle doit faire plus mal" (voir 011).
const NEGATIVE_KEYWORDS =
  /\b(licenci|plan social|red[ée]ploiement|liquidation|redressement judiciaire|faillite|cessation d['’]activit[ée]|ferme(?:ture)?|d[ée]p[oô]t de bilan|scandale|pol[ée]mique|enqu[eê]te|perquisition|sanctionn[ée]e?|amende|proc[eè]s|litige|plainte|d[ée]mission (?:du|de la|des)|d[ée]part (?:du|de la)|difficult[ée]s?|en difficult[ée]|chute|baisse|recul|d[ée]gringole|perte[s]? (?:nette|de)|d[ée]ficit|suppression[s]? de postes?|rachet[ée]e? pour un montant symbolique|cesse ses activit[ée]s)\b/i;

// Classe un article déjà confirmé pertinent (mention du nom de la startup)
// en +1 (positif), -1 (négatif) ou 0 (neutre/ambigu — pas de mot-clé net, ou
// les deux catégories présentes à la fois, ex. "malgré la crise, la startup
// rebondit"). Fonction pure, pas d'accès réseau/DB.
export function classifySentiment(text) {
  const hasPositive = POSITIVE_KEYWORDS.test(text);
  const hasNegative = NEGATIVE_KEYWORDS.test(text);
  if (hasPositive && !hasNegative) return 1;
  if (hasNegative && !hasPositive) return -1;
  return 0;
}

// Pour une startup donnée, agrège tous les articles des flux qui la
// mentionnent (mot entier, comme press.js/valuation.js) en un signal du jour :
// le nombre total de mentions (indépendamment du ton) et la moyenne des tons
// classés (null si aucun article classé positif/négatif, càd silence ou
// 100% neutre — distinct de 0, qui signifierait "positif et négatif
// s'annulent").
export function getDailySentiment(startupName, feeds) {
  const namePattern = new RegExp(`\\b${escapeRegExp(startupName)}\\b`, "i");
  let mentionsCount = 0;
  const scores = [];

  for (const items of feeds) {
    for (const item of items) {
      const haystack = `${item.title ?? ""} ${item.contentSnippet ?? ""}`;
      if (!namePattern.test(haystack)) continue;

      mentionsCount += 1;
      const tone = classifySentiment(haystack);
      if (tone !== 0) scores.push(tone);
    }
  }

  const sentimentScore = scores.length
    ? scores.reduce((sum, s) => sum + s, 0) / scores.length
    : null;

  return { mentionsCount, sentimentScore };
}
