-- Annule le pivot "recrutement" : on revient à Google Trends comme 3e signal
-- universel obligatoire (funding 40%, presse 20%, trends 20% = 80%), le bonus
-- GitHub sectoriel (jusqu'à +20 pts) reste inchangé.
-- A executer une seule fois dans Supabase > SQL Editor (Run without RLS)

alter table startups rename column signal_hiring to signal_trends;
