-- Supprime les doublons de la table startups (chaque startup existe actuellement
-- en 2 exemplaires — le script de seed a probablement été exécuté deux fois lors
-- de la mise en place initiale). On garde la ligne la plus ancienne (id le plus
-- petit) pour chaque nom et on supprime le doublon plus récent.
-- A executer une seule fois dans Supabase > SQL Editor (Run without RLS)

delete from startups
where id in (
  select id from (
    select id, row_number() over (partition by name order by id) as rn
    from startups
  ) t
  where t.rn > 1
);
