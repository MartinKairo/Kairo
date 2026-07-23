// Petits formatteurs d'affichage pour le modèle "capital + dilution"
// (lib/investing/equity.js) — séparés du calcul pur pour rester réutilisables
// sans dépendre de React.

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
