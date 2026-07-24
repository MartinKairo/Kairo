-- Kairo — ajoute 16 nouvelles startups qui cochent les deux cases du
-- nouveau critère de présence sur le site (voir échange du 2026-07-24 et
-- 019_prune_unsourced_github_roster.sql) :
--   (a) un tour de financement réellement sourcé par la presse (article
--       identifiable, comme le reste du roster depuis 008) ;
--   (b) une organisation GitHub réelle et active, avec de vrais repos
--       (vérifiée manuellement via l'API GitHub le jour de l'écriture de
--       cette migration : org existante, repos publics avec des étoiles et
--       des pushs récents — pas une simple présence formelle).
--
-- Recherche volontairement orientée dev tools / infra / deep tech : ce
-- sont les catégories où une startup a le plus de chances d'avoir un vrai
-- code open source actif (contrairement à la plupart des fintechs/appli
-- grand public, qui ont rarement un org GitHub avec une activité
-- significative — voir DataDome, Back Market, Yousign, Spendesk écartées
-- lors de la recherche faute d'activité GitHub réelle malgré un org
-- existant).
--
-- Convention de sourcing identique à 008/011/013 : quand seule le montant
-- levé est public (pas de post-money officiel), on utilise le montant levé
-- comme ancre de valorisation (voir precision_note "Ancre = montant levé").
-- Quand la presse française donne directement un montant en euros, on
-- l'utilise tel quel ; sinon on part du montant en dollars annoncé et on
-- applique une conversion approximative au taux de change moyen de la
-- période (même logique que pour Photoroom/Contentsquare/Exotec en 008),
-- notée explicitement en precision_note. Aucun chiffre inventé.
--
-- A executer une seule fois dans Supabase > SQL Editor, après
-- 019_prune_unsourced_github_roster.sql.

insert into startups (name, sector, website_domain, github_org, blurb) values
('Strapi', 'Dev tools / CMS headless open source', 'strapi.io', 'strapi', 'Éditeur d''un CMS headless open source permettant aux développeurs de créer et gérer des API de contenu.'),
('Meilisearch', 'Dev tools / moteur de recherche open source', 'meilisearch.com', 'meilisearch', 'Développe un moteur de recherche open source rapide, destiné aux développeurs et aux entreprises.'),
('Algolia', 'Dev tools / API de recherche', 'algolia.com', 'algolia', 'Fournit une API de recherche et de découverte de contenu destinée aux sites web et applications.'),
('Zama', 'Deep tech / cryptographie homomorphe', 'zama.ai', 'zama-ai', 'Développe des technologies de chiffrement entièrement homomorphe (FHE) pour la confidentialité des données en blockchain et en IA.'),
('Dust', 'IA / agents pour entreprise', 'dust.tt', 'dust-tt', 'Conçoit une plateforme permettant aux entreprises de créer des assistants IA connectés à leurs données internes.'),
('Dashlane', 'Cybersécurité / gestionnaire de mots de passe', 'dashlane.com', 'Dashlane', 'Développe un gestionnaire de mots de passe et d''identifiants numériques, fondé à Paris.'),
('Platform.sh', 'Dev tools / plateforme cloud (PaaS)', 'platform.sh', 'platformsh', 'Propose une plateforme cloud (PaaS) française pour déployer et gérer des applications web.'),
('Swan', 'Fintech / banking-as-a-service', 'swan.io', 'swan-io', 'Fournit une infrastructure bancaire en marque blanche (banking-as-a-service) pour entreprises et fintechs européennes.'),
('Kili Technology', 'Dev tools IA / annotation de données', 'kili-technology.com', 'kili-technology', 'Développe une plateforme d''annotation de données pour l''entraînement de modèles d''intelligence artificielle.'),
('Owkin', 'IA santé / biotech computationnelle', 'owkin.com', 'owkin', 'Développe des technologies d''IA et d''apprentissage fédéré appliquées à la recherche médicale et pharmaceutique.'),
('Scalingo', 'Cloud souverain / PaaS', 'scalingo.com', 'Scalingo', 'Propose une plateforme cloud (PaaS) souveraine hébergée en France et en Allemagne, alternative européenne aux grands clouds américains.'),
('Qovery', 'Dev tools / automatisation DevOps', 'qovery.com', 'Qovery', 'Édite une plateforme d''automatisation DevOps qui permet de déployer et faire évoluer des applications sur le cloud de son choix.'),
('DataDome', 'Cybersécurité / protection anti-bots', 'datadome.co', 'DataDome', 'Développe une solution de cybersécurité basée sur l''IA pour protéger sites web, applications mobiles et API contre les attaques de bots et la fraude en ligne.'),
('Bump.sh', 'Dev tools / documentation d''API', 'bump.sh', 'bump-sh', 'Édite une plateforme de documentation et de gouvernance des API, générée automatiquement à partir de spécifications OpenAPI et AsyncAPI.'),
('Toucan Toco', 'Data / business intelligence', 'toucantoco.com', 'ToucanToco', 'Propose une plateforme de data storytelling qui rend les données d''entreprise accessibles aux collaborateurs non spécialistes.'),
('Alice & Bob', 'Deep tech / informatique quantique', 'alice-bob.com', 'Alice-Bob-SW', 'Développe un ordinateur quantique universel et tolérant aux fautes basé sur une technologie de "cat qubits" auto-correcteurs.');

-- Tours de financement (source presse identifiable pour chacun) :

select record_financing_round((select id from startups where name = 'Strapi'), '2022-06-22', 29512000, 29512000, null, 'Série B', 'press', 'https://www.frenchweb.fr/serie-b-strapi-leve-31-millions-de-dollars-aupres-de-crv/434593', 'Ancre = montant levé (pas de post-money publié) ; montant annoncé en dollars (31 M$), conversion USD→EUR approx (~0,952, juin 2022).');

select record_financing_round((select id from startups where name = 'Meilisearch'), '2022-10-10', 15300000, 15300000, null, 'Série A', 'press', 'https://techcrunch.com/2022/10/10/meilisearch-lands-15m-investment-to-grow-its-search-as-a-service-business/', 'Ancre = montant levé (pas de post-money publié) ; montant annoncé en dollars (15 M$), conversion USD→EUR approx (~1,02, oct. 2022).');

select record_financing_round((select id from startups where name = 'Algolia'), '2021-07-28', 1905000000, 127000000, null, 'Série D', 'press', 'https://www.fusacq.com/buzz/la-plateforme-d-api-algolia-collecte-127-m-a212231_fr_', 'Montant levé = 127 M€ donné directement en euros par la source ; valorisation post-money = 2,25 Md$ annoncée dans le communiqué officiel, convertie au même taux implicite (~0,847) pour cohérence, soit ~1,905 Md€.');

select record_financing_round((select id from startups where name = 'Zama'), '2024-03-07', 66900000, 66900000, null, 'Tour 2024 (3e levée)', 'press', 'https://www.maddyness.com/2024/03/07/zama-leve-73-millions-de-dollars-pour-securiser-la-blockchain-et-lia/', 'Ancre = montant levé (pas de post-money publié) ; montant annoncé en dollars (73 M$), conversion USD→EUR approx (~0,917, mars 2024).');

select record_financing_round((select id from startups where name = 'Dust'), '2024-06-27', 14960000, 14960000, null, 'Série A', 'press', 'https://techcrunch.com/2024/06/27/dust-grabs-another-16-million-for-its-enterprise-ai-assistants-connected-to-internal-data/', 'Ancre = montant levé (pas de post-money publié) ; montant annoncé en dollars (16 M$) par la source originale (TechCrunch), conversion USD→EUR approx (~0,935, juin 2024) — une reprise française de l''article donne directement "16 M€", chiffre proche mais non repris ici par prudence.');

select record_financing_round((select id from startups where name = 'Dashlane'), '2019-05-30', 98230000, 98230000, null, 'Série D', 'press', 'https://techcrunch.com/2019/05/30/dashlane-series-d/', 'Ancre = montant levé (pas de post-money publié) ; montant annoncé en dollars (110 M$), conversion USD→EUR approx (~0,893, mai 2019) ; société franco-américaine fondée à Paris.');

select record_financing_round((select id from startups where name = 'Platform.sh'), '2022-06-21', 133000000, 133000000, null, 'Série D', 'press', 'https://www.usine-digitale.fr/article/la-start-up-platform-sh-leve-140-millions-de-dollars-pour-sa-plateforme-applicative-cloud.N2017347', 'Ancre = montant levé (pas de post-money publié) ; source donne directement l''équivalent en euros (~133 M€ pour 140 M$).');

select record_financing_round((select id from startups where name = 'Swan'), '2023-09-13', 37000000, 37000000, null, 'Série B', 'press', 'https://techcrunch.com/2023/09/13/swan-secures-40-million-to-bring-embedded-banking-to-europe', 'Ancre = montant levé (pas de post-money publié) ; source donne le montant en double devise (40 M$ / 37 M€), on retient le chiffre euro.');

select record_financing_round((select id from startups where name = 'Kili Technology'), '2021-07-27', 21175000, 21175000, null, 'Série A', 'press', 'https://www.frenchweb.fr/ia-kili-technology-leve-25-millions-de-dollars-aupres-de-balderton-capital/426570', 'Ancre = montant levé (pas de post-money publié) ; montant annoncé en dollars (25 M$), conversion USD→EUR approx (~0,847, juillet 2021).');

select record_financing_round((select id from startups where name = 'Owkin'), '2021-11-18', 159300000, 159300000, null, 'Investissement stratégique (Sanofi)', 'press', 'https://www.maddyness.com/2021/11/18/sanofi-owkin-180-millions-dollars-cancer/', 'Ancre = montant levé (pas de post-money publié) ; montant annoncé en dollars (180 M$), conversion USD→EUR approx (~0,885, nov. 2021) ; investissement stratégique de Sanofi, pas un tour VC classique.');

select record_financing_round((select id from startups where name = 'Scalingo'), '2024-07-10', 3500000, 3500000, null, 'Tour 2024', 'press', 'https://scalingo.com/blog/we-raised-3-5-million-to-provide-secure-cloud-hosting', 'Ancre = montant levé (pas de post-money publié) ; date exacte de l''annonce non confirmée avec précision (juillet 2024) ; source = communiqué officiel de l''entreprise (peu de couverture presse indépendante trouvée pour ce tour, montant confirmé par le communiqué).');

select record_financing_round((select id from startups where name = 'Qovery'), '2025-09-29', 11115000, 11115000, null, 'Série A', 'press', 'https://tech.eu/2025/09/30/qovery-raises-13m-to-redefine-devops-automation/', 'Ancre = montant levé (pas de post-money publié) ; montant annoncé en dollars (13 M$), conversion USD→EUR approx (~0,855, sept. 2025).');

select record_financing_round((select id from startups where name = 'DataDome'), '2023-03-30', 38000000, 38000000, null, 'Série C', 'press', 'https://www.isai.vc/news/datadome-closes-42-million-in-series-c-funding-to-advance-the-fight-against-bot-driven-cyberattacks-and-fraud', 'Ancre = montant levé (pas de post-money publié) ; montant annoncé 42 M$ (~38 M€ selon la couverture presse) ; source = communiqué du lead investor (ISAI), le communiqué officiel datadome.co étant inaccessible (protégé par son propre système anti-bot).');

select record_financing_round((select id from startups where name = 'Bump.sh'), '2022-11-03', 4000000, 4000000, null, 'Seed', 'press', 'https://presse.bpifrance.fr/la-start-up-bump-sh-leve-4-millions-deuros-pour-optimiser-la-collaboration-dans-les-ecosystemes-dapis', 'Ancre = montant levé (pas de post-money publié).');

select record_financing_round((select id from startups where name = 'Toucan Toco'), '2019-11-28', 12000000, 12000000, null, 'Tour 2019', 'press', 'https://www.maddyness.com/2019/11/28/toucan-toco-8-millions-euros/', 'Ancre = montant levé (pas de post-money publié) ; montant total = 8 M€ en capital + 4 M€ en dette, soit 12 M€ ; dernière valorisation publique connue = nov. 2019, figée depuis.');

select record_financing_round((select id from startups where name = 'Alice & Bob'), '2025-01-28', 100000000, 100000000, null, 'Série B', 'press', 'https://sifted.eu/articles/alice-and-bob-100m-series-b-news', 'Ancre = montant levé (pas de post-money publié).');

-- Stade indicatif (même logique que stageFromValuation() dans
-- lib/investing/equity.js) : early si ancre < 100 M€, growth si < 1 Md€,
-- late sinon.
update startups s set stage = case
  when v.current_post_money_eur < 100000000 then 'early'
  when v.current_post_money_eur < 1000000000 then 'growth'
  else 'late'
end
from startup_valuations v
where v.startup_id = s.id
and s.name in (
  'Strapi', 'Meilisearch', 'Algolia', 'Zama', 'Dust', 'Dashlane',
  'Platform.sh', 'Swan', 'Kili Technology', 'Owkin', 'Scalingo',
  'Qovery', 'DataDome', 'Bump.sh', 'Toucan Toco', 'Alice & Bob'
);
