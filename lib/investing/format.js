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

export function formatPct(fraction, maxDecimals = 2) {
  if (fraction === null || fraction === undefined) return "—";
  return `${(fraction * 100).toLocaleString("fr-FR", { maximumFractionDigits: maxDecimals })} %`;
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
