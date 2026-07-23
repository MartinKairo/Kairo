-- Kairo — mise à jour du roster pour le modèle "capital + dilution"
-- (voir 007_equity_model.sql) : retrait des startups sans valorisation
-- publique exploitable, traitement de Shine en "exit", ajout de 5
-- remplaçantes, et enregistrement du dernier tour de financement connu
-- (sourcé publiquement — presse) pour les 20 startups affichées.
--
-- Sources et méthodologie : recherche dédiée, chaque tour vient d'un article
-- de presse identifiable (source_ref). Aucun chiffre inventé/estimé sans
-- source. Conversions USD→EUR approximatives selon le taux de la période
-- (précisé en precision_note quand pertinent) — l'ordre de grandeur et le
-- classement relatif entre startups priment sur la précision au centime,
-- voir brief.
--
-- A executer une seule fois dans Supabase > SQL Editor, après 007_equity_model.sql.

-- 1) Retrait des startups sans valorisation publique exploitable trouvée
-- (aucun tour de financement avec valorisation sourcée).
delete from startups where name in ('Dust', 'Poolside', 'Comet ML', 'Lucca');

-- 2) Shine : traitée en "exit" (rachat par Société Générale, ~juillet 2020)
-- plutôt que simplement retirée, pour illustrer ce mécanisme dans le
-- simulateur. Montant ~100 M€ repris par la presse (TechCrunch en premier),
-- jamais officiellement confirmé par les deux parties.
select settle_exit(
  (select id from startups where name = 'Shine'),
  100000000,
  50000,
  '2020-07-01'
);

-- 3) Nouvelles startups (remplaçantes). Signaux de momentum (score/press/
-- trends/github) à leurs valeurs par défaut : recalculés normalement par les
-- routes /api/refresh-* comme pour les startups existantes.
insert into startups (name, sector, website_domain, github_org, blurb) values
('Malt', 'Marketplace freelances', 'malt.fr', null, 'Plateforme de mise en relation entre freelances et entreprises, présente dans plusieurs pays européens'),
('Exotec', 'Robotique logistique', 'exotec.com', null, 'Première licorne industrielle française, robots de préparation de commandes en entrepôt'),
('ManoMano', 'E-commerce bricolage', 'manomano.fr', null, 'Marketplace spécialisée bricolage, jardinage et animalerie'),
('Younited', 'Crédit à la consommation', 'younited-credit.com', null, 'Plateforme de crédit à la consommation 100% en ligne, agréée établissement de crédit'),
('Vestiaire Collective', 'Mode seconde main', 'vestiairecollective.com', null, 'Marketplace de mode de seconde main haut de gamme');

-- 4) Dernier tour de financement connu pour chacune des 20 startups
-- affichées (sert de base au calcul du % de capital obtenu à l'achat, voir
-- lib/investing/equity.js).
select record_financing_round((select id from startups where name = 'Mistral AI'), '2025-09-09', 11700000000, 1700000000, null, 'Série C', 'press', 'https://www.maddyness.com/2025/09/09/mistral-ai-leve-17-milliard-deuros-et-devient-une-decacorne/', null);
select record_financing_round((select id from startups where name = 'Photoroom'), '2024-03-01', 462000000, 39700000, null, 'Série B', 'press', 'https://phototrend.fr/2024/03/photoroom-editeur-photo-par-ia-levee-de-fonds/', 'Conversion USD→EUR approx (~0,925, fév-mars 2024)');
select record_financing_round((select id from startups where name = 'Pennylane'), '2026-01-20', 3500000000, 175000000, null, '7e tour', 'press', 'https://www.maddyness.com/2026/01/20/pennylane-nouvelle-levee-de-fonds-de-175-millions-deuros-pour-la-licorne-francaise/', null);
select record_financing_round((select id from startups where name = 'Payfit'), '2022-01-01', 1820000000, 254000000, null, 'Série E', 'press', 'https://presse.bpifrance.fr/levee-de-fonds-record-dans-les-rh-payfit-leve-254-me', 'Dernier tour public sourcé = janvier 2022 ; un chiffre à 5,8 Md€ circule en ligne mais non corroboré par une source fiable, écarté');
select record_financing_round((select id from startups where name = 'Alan'), '2025-06-01', 5500000000, 480000000, null, 'Série G', 'press', 'https://www.argusdelassurance.com/assurance-de-personnes/sante/complementaire-sante/alan-annonce-une-levee-de-fonds-record-de-480-millions-deuros-lassureur-sante-est-desormais-valorise-55-milliards-deuros.A24URBJBGNDUJOW2Q5Y72PTJ3Y.html', null);
select record_financing_round((select id from startups where name = 'Qonto'), '2022-01-01', 4400000000, 486000000, null, 'Série D', 'press', 'https://www.jaimelesstartups.fr/news/qonto-effectue-une-levee-de-fonds-record-de-486-millions-deuros/', 'Dernier tour public sourcé = janvier 2022 ; vente secondaire ~5 Md€ évoquée en 2024-2025 mais pas confirmée comme finalisée, écartée');
select record_financing_round((select id from startups where name = 'Ledger'), '2023-03-31', 1300000000, 100000000, null, 'Série C (complément)', 'press', 'https://siecledigital.fr/2023/03/31/ledger-conserve-sa-valorisation-grace-a-une-nouvelle-levee-de-fonds/', 'Montant = complément uniquement (total cumulé 456 M€) ; écart de sources entre 1,3 et 1,4 Md€ selon conversion USD/EUR');
select record_financing_round((select id from startups where name = 'Swile'), '2021-10-12', 860000000, 172000000, null, 'Tour licorne', 'press', 'https://siecledigital.fr/2021/10/12/swile-licorne-levee-fonds-200-millions/', 'Dernière valorisation publique connue = octobre 2021, figée depuis');
select record_financing_round((select id from startups where name = 'Contentsquare'), '2022-07-21', 5500000000, 588000000, null, 'Série F', 'press', 'https://www.maddyness.com/2022/07/21/contentsquare-levee-de-fonds-600-millions/', 'Montant levé inclut 200 M$ de dette ; conversion USD→EUR approx (~0,98, juillet 2022)');
select record_financing_round((select id from startups where name = 'Aircall'), '2021-06-01', 820000000, 98000000, null, 'Série D', 'press', 'https://www.frenchweb.fr/aircall-devient-une-licorne-a-loccasion-dune-levee-de-120-millions-de-dollars-et-vise-une-entree-en-bourse-au-nasdaq/424792', 'Dernière valorisation publique connue = juin 2021, figée depuis');
select record_financing_round((select id from startups where name = 'Blablacar'), '2021-04-21', 1660000000, 95000000, null, 'Tour de croissance', 'press', 'https://www.maddyness.com/2021/04/21/blablacar-est-desormais-valorisee-2-milliards-de-dollars/', 'Dernière valorisation publique connue = avril 2021 ; ligne de crédit de 100 M€ obtenue en 2024 (pas une levée en fonds propres, pas de nouvelle valo communiquée)');
select record_financing_round((select id from startups where name = 'Sorare'), '2021-09-01', 3650000000, 580000000, null, 'Série B', 'press', 'https://www.frenchweb.fr/sorare-signe-la-plus-grosse-levee-de-fonds-de-la-french-tech-avec-une-serie-b-de-680-millions-de-dollars/', 'Plus grosse Série B européenne à l''époque ; dernière valorisation publique connue = sept. 2021, figée depuis');
select record_financing_round((select id from startups where name = 'Pigment'), '2024-04-04', 930000000, 135000000, null, 'Série D', 'press', 'https://techcrunch.com/2024/04/04/business-planning-startup-pigment-raises-145-million-round-in-rare-french-tech-megaround/', 'Valorisation exacte non précisée publiquement au-delà de ">1 Md$", chiffre arrondi');
select record_financing_round((select id from startups where name = 'Doctolib'), '2023-03-01', 5800000000, 500000000, null, 'Tour (fonds propres + dette)', 'press', 'https://www.frenchweb.fr/doctolib-leve-500-millions-deuros-pour-une-valorisation-record-de-58-milliards-deuros/432937', 'Dernière valorisation publique connue = mars 2023, figée depuis');
select record_financing_round((select id from startups where name = 'Back Market'), '2022-01-01', 5100000000, 450000000, null, 'Série E', 'press', 'https://www.usine-digitale.fr/article/back-market-leve-450-millions-d-euros-pour-renforcer-sa-position-sur-le-secteur-du-reconditionne.N1175172', 'Dernière valorisation publique connue = janvier 2022, confirmée stable jusqu''en 2025 par le PDG');
select record_financing_round((select id from startups where name = 'Malt'), '2021-06-01', 410000000, 80000000, null, 'Série C', 'press', 'https://www.frenchweb.fr/malt-leve-80-millions-deuros-aupres-de-goldman-sachs-eurazeo-isai-et-serena/423184', 'Extension de 60 M€ en nov. 2022 sans valorisation divulguée, non utilisée');
select record_financing_round((select id from startups where name = 'Exotec'), '2022-01-01', 1770000000, 296000000, null, 'Série D', 'press', 'https://presse.bpifrance.fr/exotec-leve-335-millions-de-dollars-et-devient-la-premiere-licorne-industrielle-francaise', 'Conversion USD→EUR approx (~0,885, janvier 2022)');
select record_financing_round((select id from startups where name = 'ManoMano'), '2021-10-01', 2240000000, 305000000, null, 'Série F', 'press', 'https://www.frenchweb.fr/manomano-voit-sa-valorisation-senvoler-a-26-milliards-de-dollars-apres-un-nouveau-tour-de-table/425611', 'Dernière valorisation publique connue = octobre 2021, figée depuis');
select record_financing_round((select id from startups where name = 'Younited'), '2022-12-01', 1100000000, 60000000, null, 'Tour interne', 'press', 'https://presse.bpifrance.fr/younited-poursuit-son-developpement-en-signant-des-resultats-solides-pour-2022-et-annocne-une-levee-de-fonds-de-60-me', 'Réinvestissement des 4 actionnaires historiques, pas de nouveaux investisseurs');
select record_financing_round((select id from startups where name = 'Vestiaire Collective'), '2024-01-01', 1100000000, null, null, 'Tour 2024 (down round)', 'press', 'https://fr.fashionnetwork.com/news/Apres-sa-derniere-levee-de-fonds-vestiaire-collective-valorisee-a-1-7-milliard-de-dollars,1336476.html', 'Montant total levé non chiffré publiquement ; down round vs valorisation 2021 (1,45 Md€)');

-- 5) Stade indicatif (early/growth/late) déduit de la valorisation courante —
-- même logique que stageFromValuation() dans lib/investing/equity.js (utilisée
-- côté JS pour les startups ajoutées plus tard hors pipeline SQL).
update startups s set stage = case
  when v.current_post_money_eur < 100000000 then 'early'
  when v.current_post_money_eur < 1000000000 then 'growth'
  else 'late'
end
from startup_valuations v
where v.startup_id = s.id;
