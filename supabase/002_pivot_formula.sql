-- Pivot de la formule de score : GitHub devient un bonus sectoriel optionnel,
-- et le signal "recrutement" remplace "tendance de recherche" (abandonné) comme
-- signal universel obligatoire.
-- A executer une seule fois dans Supabase > SQL Editor (Run without RLS)

alter table startups rename column signal_trends to signal_hiring;

-- signal_github doit pouvoir etre NULL = "non applicable" (pas de repo public pertinent),
-- au lieu d'une valeur neutre par defaut qui faussait le calcul.
alter table startups alter column signal_github drop not null;
alter table startups alter column signal_github drop default;
