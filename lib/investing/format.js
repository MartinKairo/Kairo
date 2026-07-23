// Petits formatteurs d'affichage pour le modèle "capital + dilution"
// (lib/investing/equity.js) — séparés du calcul pur pour rester réutilisables
// sans dépendre de React.

import { EUR_PER_KC } from "./equity";

// Valorisation affichée dans la monnaie fictive du jeu (K¢) plutôt qu'en €
// réels, pour rester cohérent avec le reste de l'UI (positions, cash, etc.
// déjà toutes affichées en K¢) — voir EUR_PER_KC dans lib/investing/equity.js.
export function formatKc(valueEur) {
  if (valueEur === null || valueEur === undefined) return "—";
  const valueKc = valueEur / EUR_PER_KC;
  const abs = Math.abs(valueKc);
  // Mêmes paliers que formatEur, appliqués à valueKc (déjà divisé par
  // EUR_PER_KC) — attention à ne PAS répéter le bug précédent où le palier
  // ">= 1_000" était étiqueté "M K¢" alors qu'on ne divisait que par 1 000
  // (donnant un affichage 1000x trop grand). Un bon test de non-régression :
  // formatKc(50_000 * 233_000) doit afficher "233 000 K¢", pas "233 M K¢".
  if (abs >= 1_000_000_000) {
    return `${(valueKc / 1_000_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} Md K¢`;
  }
  if (abs >= 1_000_000) {
    return `${(valueKc / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} M K¢`;
  }
  return `${valueKc.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} K¢`;
}

export function formatEur(value) {
  if (value === null || value === undefined) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} Md€`;
  }
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} M€`;
  }
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;
}

// maxDecimals = précision "normale" (2 décimales suffisent pour la plupart
// des positions). Depuis l'abaissement du capital de départ à 100 000 €
// (voir EUR_PER_KC/STARTING_CASH), une position all-in sur une licorne
// valorisée plusieurs milliards peut représenter une fraction de %
// minuscule (ex: 0,00085%) — avec seulement 2 décimales, ça s'affichait
// "0,00 %", ce qui donne l'impression fausse que la position est nulle. On
// augmente donc automatiquement la précision (jusqu'à 6 décimales) tant que
// la valeur arrondirait encore à zéro à la précision courante.
export function formatPct(fraction, maxDecimals = 2) {
  if (fraction === null || fraction === undefined) return "—";
  const pct = fraction * 100;
  const abs = Math.abs(pct);

  let decimals = maxDecimals;
  while (decimals < 6 && abs > 0 && abs < 1 / 10 ** decimals) {
    decimals += 1;
  }

  return `${pct.toLocaleString("fr-FR", { maximumFractionDigits: decimals })} %`;
}

export const STAGE_LABELS = {
  early: "Early stage",
  growth: "Growth",
  late: "Late stage",
};

export const LIFECYCLE_LABELS = {
  exited: "Racheté (exit)",
  defunct: "Activité cessée",
};
