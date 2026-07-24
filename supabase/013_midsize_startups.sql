-- Kairo — comble le "trou" de valorisation entre les 10 petites startups
-- seed/pré-seed ajoutées en 011 (toutes < 6 M€) et les 20 licornes/scale-ups
-- historiques (la plus petite étant Malt, ancre à 410 M€ — voir
-- 008_roster_v2.sql). Résultat visible avant cette migration : une "falaise"
-- entre Rivage (Paie) à 2,6 M€ et Malt à 410 M€, sans aucune startup entre
-- les deux dans la liste triée par valorisation (voir échange du
-- 2026-07-24). Sept startups réelles, sourcées presse, avec des levées
-- allant de 10 M€ à 200 M€, pour lisser la progression.
--
-- Méthodologie identique à 011 : ancre = montant levé (aucune de ces sept
-- levées ne publie de post-money explicite dans la presse consultée), jamais
-- de chiffre inventé — voir precision_note de chaque ligne pour la source et
-- la date exactes.
--
-- A executer une seule fois dans Supabase > SQL Editor, après 012_lower_starting_cash.sql.

insert into startups (name, sector, website_domain, github_org, blurb) values
('Papernest', 'Services administratifs / déménagement', 'papernest.com', null, 'Plateforme qui délègue les démarches administratives (énergie, internet, assurance) lors d''un déménagement, pour le compte des particuliers.'),
('Karos', 'Mobilité / covoiturage domicile-travail', 'karos.fr', null, 'Application de covoiturage du quotidien (trajets domicile-travail), avec incitations financières et partenariats entreprises/collectivités.'),
('Yousign', 'SaaS / signature électronique', 'yousign.com', null, 'Solution française de signature électronique destinée aux PME, alternative européenne aux offres américaines.'),
('Lifen', 'Healthtech / interopérabilité des données de santé', 'lifen.fr', null, 'Plateforme d''échange de données médicales entre hôpitaux, professionnels de santé et patients, premier opérateur MSSanté en France.'),
('Ornikar', 'Mobilité / auto-école en ligne', 'ornikar.com', null, 'Auto-école en ligne et assurance auto nouvelle génération, formation au code de la route et à la conduite.'),
('Bionyra Pharma', 'Biotech / biothérapies', 'bionyra.com', null, 'Biotech parisienne qui développe des anticorps de nouvelle génération contre les maladies inflammatoires sévères (dermatite atopique, eczéma).'),
('Skello', 'SaaS RH / gestion des plannings', 'skello.io', null, 'Logiciel SaaS de gestion des plannings et des données RH pour le commerce, la restauration et l''hôtellerie.');

select record_financing_round((select id from startups where name = 'Papernest'), '2017-10-17', 10000000, 10000000, null, 'Tour 2017', 'press', 'https://www.journaldunet.com/economie/immobilier/1203839-souscritoo-devient-papernest-et-leve-10-millions-d-euros/', 'Ancre = montant levé (pas de post-money publié) ; à l''époque encore sous le nom Souscritoo.');
select record_financing_round((select id from startups where name = 'Karos'), '2023-11-27', 17000000, 17000000, null, 'Tour 2023', 'press', 'https://journalauto.com/services/karos-mobility-leve-17-millions-deuros-pour-accelerer-son-internationalisation/', 'Ancre = montant levé (pas de post-money publié) ; 30 M€ levés au total depuis la création selon l''article.');
select record_financing_round((select id from startups where name = 'Yousign'), '2021-06-10', 30000000, 30000000, null, 'Série A', 'press', 'https://www.frenchweb.fr/signature-electronique-yousign-leve-30-millions-deuros/423941', 'Ancre = montant levé (pas de post-money publié).');
select record_financing_round((select id from startups where name = 'Lifen'), '2021-11-16', 50000000, 50000000, null, 'Tour 2021', 'press', 'https://www.beaboss.fr/Thematique/start-up-1271/levee-fonds-2074/Breves/Lifen-leve-millions-euros-integrer-sante-numerique-hopitaux-366598.htm', 'Ancre = montant levé (pas de post-money publié).');
select record_financing_round((select id from startups where name = 'Ornikar'), '2021-04-22', 100000000, 100000000, null, 'Série C', 'press', 'https://presse.bpifrance.fr/ornikar-leve-100-millions-deuros-serie-c-pour-devenir-un-leader-mondial-de-la-securite-routiere', 'Ancre = montant levé (pas de post-money publié) ; porte le total levé depuis la création à 146 M€.');
select record_financing_round((select id from startups where name = 'Bionyra Pharma'), '2026-06-22', 143000000, 143000000, null, 'Série A', 'press', 'https://www.usinenouvelle.com/sante-pharma/ancien-de-chez-sanofi-molecules-chinoises-et-soutien-des-fonds-francais-comment-la-toute-jeune-biotech-bionyra-pharma-est-parvenue-a-seduire-les-investisseurs-et-a-lever-143-millions-deuros.UDF2RBNBPNAHDLE3EUUDPQDDWE.html', 'Ancre = montant levé (pas de post-money publié) ; présentée comme la plus grosse série A jamais réalisée par une biotech française. Chiffre en dollars (165 M$) converti par la presse elle-même à ~143 M€.');
select record_financing_round((select id from startups where name = 'Skello'), '2026-06-07', 200000000, 200000000, null, 'Tour 2026 (Bridgepoint)', 'press', 'https://www.frenchweb.fr/skello-leve-200-millions-deuros-la-french-tech-entre-dans-lere-des-consolidateurs-europeens/462695', 'Ancre = montant levé (pas de post-money publié) ; Bridgepoint devient actionnaire minoritaire principal, Skello déjà rentable (+50 M€ d''ARR) à ce stade.');

-- Stade indicatif (même logique que stageFromValuation() dans lib/investing/equity.js) :
-- early si ancre < 100 M€, growth sinon (aucune de ces sept ne dépasse 1 Md€).
update startups set stage = case
  when name in ('Papernest', 'Karos', 'Yousign', 'Lifen') then 'early'
  when name in ('Ornikar', 'Bionyra Pharma', 'Skello') then 'growth'
  else stage
end
where name in ('Papernest', 'Karos', 'Yousign', 'Lifen', 'Ornikar', 'Bionyra Pharma', 'Skello');
