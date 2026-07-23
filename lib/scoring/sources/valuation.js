// Pipeline de valorisation automatisé — voir supabase/009_valuation_pipeline.sql
// pour le schéma/les fonctions SQL appelées par app/api/refresh-valuations/route.js,
// et le brief v2 (simplification post-Pappers) pour le contexte produit complet.
//
// Principe : au lieu de recalculer une valorisation depuis des données
// juridiques (prix par action × nombre d'actions, via Pappers/INPI/BODACC —
// jugé trop complexe pour ce qu'on en a besoin), on récupère directement le
// dernier chiffre de valorisation publié en presse. Un ordre de grandeur
// correct suffit. Réutilise les mêmes flux RSS que les signaux presse/funding
// (voir lib/scoring/sources/rss.js), mais avec un objectif différent :
// extraire un ÉVÉNEMENT structuré (type + montant), pas un score.
//
// Comme le pipeline s'exécute entièrement automatiquement (pas de validation
// humaine avant application — voir brief "je préfèrerais quelque chose qui
// s'automatise directement"), la classification doit être prudente : en cas de
// doute, on classe "insufficient" et on n'écrit rien de plus qu'une ligne
// d'audit dans valuation_signals plutôt que de risquer une mise à jour fausse.
//
// Limites assumées (mêmes esprit honnête que funding.js/press.js) : c'est de
// l'extraction par mots-clés + regex sur du texte journalistique, pas du NLP.
// Un article ambigu ou mal formaté peut être classé "insufficient" à tort
// (raté, mais sans danger) ou, plus rarement, mal classé (risque assumé en
// échange de l'automatisation complète demandée — voir AGENTS.md/brief).

import { fetchFeeds } from "./rss";

export const fetchValuationFeeds = fetchFeeds;

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Négociation en cours / chiffre non confirmé -> ne doit JAMAIS déclencher de
// mise à jour, quel que soit le montant détecté par ailleurs dans l'article.
const RUMOR_KEYWORDS =
  /\b(pourrait|serait en (?:n[ée]gociation|discussion)s?|envisage(?:rait)?|selon nos informations|en pourparlers|discussions? en cours|rumeur|proche de boucler|serait sur le point|en passe de|n[ée]gocierait|[ée]ventuelle levée|boucle(?:rait)? bient[oô]t)\b/i;

// Marché secondaire (ex: cas Doctolib) : des actionnaires existants revendent
// leurs parts à un nouveau prix, sans capital neuf créé -> pas dilutif.
const SECONDARY_KEYWORDS =
  /\b(march[ée] secondaire|op[ée]ration secondaire|cession d['’]actions? existantes?|vente d['’]actions? existantes?|rachat d['’]actions? existantes?|rachat de titres existants|sans lever de nouveaux fonds|actionnaires? (?:historiques?|existants?) (?:revend(?:ent)?|c[èe]d(?:ent)?))\b/i;

// Levée de fonds (tour dilutif) — même famille de mots-clés que funding.js.
const FINANCING_KEYWORDS =
  /\b(l[eè]ve|l[eè]vent|lev[ée]e de fonds|lev[ée]e|raises?|funding round|tour de table|financement|s[ée]rie [abc]|series [abc])\b/i;

// Contexte indiquant qu'un montant détecté est une VALORISATION (post-money),
// pas un montant levé. Pas de \b final : le \b de JS ne traite pas les
// lettres accentuées (à, é...) comme des caractères de mot, donc un \b juste
// après "à" (ex: "valorisée à ") ne matcherait jamais — piège vérifié par
// test avant de fixer cette regex.
const VALUATION_CONTEXT =
  /\b(valoris[ée]e? [àa]|valorisation (?:de|post-money)|post-money de|vaut d[ée]sormais|d[ée]sormais valoris[ée]e?|pesant|valued at)/i;

// Contexte indiquant qu'un montant détecté est un MONTANT LEVÉ, pas une
// valorisation.
const RAISED_CONTEXT =
  /\b(l[eè]ve|l[eè]vent|lev[ée]e de|lev[ée]e|obtient|r[ée]colte|s[ée]curise|boucle un tour de)\b/i;

// Montant + unité, en gérant à la fois les millions ET les milliards (contrairement
// à funding.js::extractAmount, qui ne gère que les millions) — un article annonçant
// "valorisée à 1,2 milliard d'euros" est un cas courant pour ce signal.
const AMOUNT_RE =
  /(\d+(?:[.,]\d+)?)\s*(milliards?|mds?\b|millions?|m)\s*(?:d['’]?)?(?:€|euros?|\$|dollars?)?/gi;

function unitMultiplier(unit) {
  return /^(milliards?|mds?)$/i.test(unit) ? 1_000_000_000 : 1_000_000;
}

// Repère chaque montant chiffré du texte et le classe "levé" ou "valorisation"
// selon les mots-clés qui le précèdent immédiatement (fenêtre de ~60
// caractères). Retourne le plus gros montant trouvé de chaque catégorie
// (un article peut par exemple citer l'ancienne ET la nouvelle valorisation ;
// on garde la plus grande, généralement la plus récente/pertinente).
function extractFinancialFigures(text) {
  let raisedAmountEur = null;
  let valuationAmountEur = null;

  for (const match of text.matchAll(AMOUNT_RE)) {
    const rawValue = parseFloat(match[1].replace(",", "."));
    if (Number.isNaN(rawValue)) continue;

    const amountEur = rawValue * unitMultiplier(match[2]);
    const contextBefore = text.slice(Math.max(0, match.index - 60), match.index);

    if (VALUATION_CONTEXT.test(contextBefore)) {
      if (valuationAmountEur === null || amountEur > valuationAmountEur) {
        valuationAmountEur = amountEur;
      }
    } else if (RAISED_CONTEXT.test(contextBefore)) {
      if (raisedAmountEur === null || amountEur > raisedAmountEur) {
        raisedAmountEur = amountEur;
      }
    }
  }

  return { raisedAmountEur, valuationAmountEur };
}

// Classe un article (déjà confirmé pertinent pour une startup donnée) en un
// des 4 types. Ne fait AUCUN accès réseau/DB ici (fonction pure), pour rester
// facile à tester et cohérente avec lib/investing/equity.js.
//
// Retour : { detectedType, extractedAmountEur, extractedPostMoneyEur }
export function classifyValuationEvent(text) {
  const { raisedAmountEur, valuationAmountEur } = extractFinancialFigures(text);

  // La rumeur prime sur tout le reste : un article qui mentionne un montant
  // mais reste au conditionnel/non confirmé ne doit jamais déclencher d'écriture.
  if (RUMOR_KEYWORDS.test(text)) {
    return {
      detectedType: "rumor",
      extractedAmountEur: raisedAmountEur,
      extractedPostMoneyEur: valuationAmountEur,
    };
  }

  if (SECONDARY_KEYWORDS.test(text) && valuationAmountEur !== null) {
    return {
      detectedType: "secondary_market",
      extractedAmountEur: raisedAmountEur,
      extractedPostMoneyEur: valuationAmountEur,
    };
  }

  // Il faut une valorisation post-money exploitable pour agir : le montant
  // levé seul ne suffit pas (record_financing_round exige p_post_money_eur).
  if (FINANCING_KEYWORDS.test(text) && valuationAmountEur !== null) {
    return {
      detectedType: "financing_round",
      extractedAmountEur: raisedAmountEur,
      extractedPostMoneyEur: valuationAmountEur,
    };
  }

  return {
    detectedType: "insufficient",
    extractedAmountEur: raisedAmountEur,
    extractedPostMoneyEur: valuationAmountEur,
  };
}

// Repère, pour une startup donnée, tous les articles des flux qui la
// mentionnent (mot entier, comme les signaux presse/funding) et renvoie leur
// classification + une clé de dédoublonnage stable (lien, ou titre si pas de
// lien) — utilisée par la route pour peupler valuation_signals sans retraiter
// un même article à chaque rafraîchissement.
export function findValuationSignals(startupName, feeds) {
  const namePattern = new RegExp(`\\b${escapeRegExp(startupName)}\\b`, "i");
  const signals = [];

  for (const items of feeds) {
    for (const item of items) {
      const haystack = `${item.title ?? ""} ${item.contentSnippet ?? ""}`;
      if (!namePattern.test(haystack)) continue;

      const { detectedType, extractedAmountEur, extractedPostMoneyEur } =
        classifyValuationEvent(haystack);

      signals.push({
        articleKey: item.link || item.title,
        articleTitle: item.title ?? null,
        articleUrl: item.link ?? null,
        publishedAt: item.isoDate ?? item.pubDate ?? null,
        detectedType,
        extractedAmountEur,
        extractedPostMoneyEur,
      });
    }
  }

  return signals;
}
