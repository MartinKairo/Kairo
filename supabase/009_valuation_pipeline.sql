-- Kairo — pipeline de valorisation automatisé (remplace l'idée initiale de
-- pipeline Pappers/actes légaux, jugée trop complexe pour ce qu'on en a
-- besoin — voir brief v2). Nouvelle méthode : on ne recalcule plus une
-- valorisation depuis des données juridiques (prix par action × nombre
-- d'actions), on récupère directement le dernier chiffre de valorisation
-- publié en presse, converti en K¢ au taux fixe (1 K¢ = 50 000 €). Un ordre
-- de grandeur correct suffit — voir lib/scoring/sources/valuation.js pour
-- l'extraction/classification et app/api/refresh-valuations/route.js pour le
-- pipeline qui appelle les fonctions ci-dessous automatiquement.
--
-- Migration ADDITIVE : ne touche pas aux données existantes (007/008), ne
-- fait qu'ajouter une colonne (avec valeur par défaut) et une table.
--
-- A executer une seule fois dans Supabase > SQL Editor, après 008_roster_v2.sql.

-- Deux types d'événements de valorisation, à distinguer AVANT de mettre à
-- jour quoi que ce soit (voir brief v2) :
--   - financing_round (levée de fonds) : dilutif, dilue les positions
--     existantes au prorata du % de capital émis lors du tour.
--   - secondary_market (marché secondaire, ex: cas Doctolib) : des
--     actionnaires existants revendent leurs parts à un nouveau prix, sans
--     capital neuf créé -> PAS dilutif. Le % détenu par chaque utilisateur ne
--     change pas ; seule la valeur affichée de sa position évolue
--     (automatique, puisqu'elle se calcule à partir de la valorisation
--     courante — voir lib/investing/equity.js kcValueOfEquity).
-- Le cas "rumeur" (négociation en cours, chiffre non confirmé) n'est jamais
-- inséré ici : il reste uniquement dans valuation_signals (voir plus bas),
-- sans jamais toucher financing_rounds/positions tant qu'il n'est pas confirmé.
alter table financing_rounds add column if not exists event_type text not null default 'financing_round'
  check (event_type in ('financing_round', 'secondary_market'));

-- Recalcule la dilution à partir du tour lui-même plutôt que de comparer
-- l'ancienne et la nouvelle post-money (ancienne méthode, qui suppose qu'il
-- ne s'est rien passé d'autre entre deux tours) :
--   pre_money = post_money − montant_levé
--   facteur_dilution = pre_money / post_money
-- Appliqué aux positions existantes. Si le montant levé (ou le pre_money)
-- n'est pas connu, on retombe sur l'ancienne méthode (ratio ancienne/nouvelle
-- post-money) plutôt que de ne pas diluer du tout — comportement identique à
-- avant pour les tours déjà enregistrés en 008 sans montant sourcé.
create or replace function public.record_financing_round(
  p_startup_id bigint,
  p_round_date date,
  p_post_money_eur numeric,
  p_amount_eur numeric default null,
  p_pre_money_eur numeric default null,
  p_round_label text default null,
  p_source_type text default 'manual',
  p_source_ref text default null,
  p_precision_note text default null
) returns void as $$
declare
  v_old_post_money numeric;
  v_pre_money numeric;
  v_dilution_factor numeric;
  v_round_id bigint;
begin
  select current_post_money_eur into v_old_post_money
  from startup_valuations where startup_id = p_startup_id;

  insert into financing_rounds
    (startup_id, round_date, round_label, amount_eur, pre_money_eur, post_money_eur, source_type, source_ref, precision_note, event_type)
  values
    (p_startup_id, p_round_date, p_round_label, p_amount_eur, p_pre_money_eur, p_post_money_eur, p_source_type, p_source_ref, p_precision_note, 'financing_round')
  returning id into v_round_id;

  v_pre_money := coalesce(p_pre_money_eur, case when p_amount_eur is not null then p_post_money_eur - p_amount_eur else null end);

  if v_pre_money is not null and v_pre_money > 0 and p_post_money_eur > 0 then
    v_dilution_factor := v_pre_money / p_post_money_eur;
  elsif v_old_post_money is not null and v_old_post_money > 0 then
    v_dilution_factor := v_old_post_money / p_post_money_eur; -- repli : ancienne méthode
  else
    v_dilution_factor := null; -- premier tour connu, rien à diluer
  end if;

  if v_dilution_factor is not null then
    update positions
    set equity_pct = equity_pct * v_dilution_factor,
        updated_at = now()
    where startup_id = p_startup_id;
  end if;
end;
$$ language plpgsql security definer set search_path = public;

-- Événement "marché secondaire" (ex: cas Doctolib — revalorisation via
-- cession d'actions existantes, sans levée de capital neuf) : enregistre la
-- nouvelle valorisation courante SANS diluer personne. Les positions
-- existantes gardent le même equity_pct ; seule leur valeur affichée change
-- (calculée à partir de startup_valuations, qui prend le tour le plus récent
-- quel que soit son event_type).
create or replace function public.record_secondary_valuation(
  p_startup_id bigint,
  p_post_money_eur numeric,
  p_round_date date,
  p_source_type text default 'press',
  p_source_ref text default null,
  p_precision_note text default null
) returns bigint as $$
declare
  v_round_id bigint;
begin
  insert into financing_rounds
    (startup_id, round_date, round_label, amount_eur, pre_money_eur, post_money_eur, source_type, source_ref, precision_note, event_type)
  values
    (p_startup_id, p_round_date, 'Marché secondaire', null, null, p_post_money_eur, p_source_type, p_source_ref, p_precision_note, 'secondary_market')
  returning id into v_round_id;

  return v_round_id;
end;
$$ language plpgsql security definer set search_path = public;

-- Journal de tous les articles de presse examinés par le pipeline
-- automatique (voir app/api/refresh-valuations/route.js), qu'ils aient donné
-- lieu à une mise à jour ou non — sert à la fois de trace d'audit (le
-- pipeline agit seul, sans validation humaine avant application, donc il
-- faut pouvoir vérifier après coup ce qui a été détecté/appliqué) et de
-- dédoublonnage (un même article ne doit pas être retraité à chaque
-- rafraîchissement).
create table if not exists valuation_signals (
  id bigint generated by default as identity primary key,
  startup_id bigint not null references startups(id) on delete cascade,
  article_key text not null,           -- lien de l'article, ou titre si pas de lien
  article_title text,
  article_url text,
  published_at timestamptz,
  detected_type text not null check (detected_type in ('financing_round', 'secondary_market', 'rumor', 'insufficient')),
  extracted_amount_eur numeric,        -- montant levé détecté, si applicable
  extracted_post_money_eur numeric,    -- valorisation détectée, si applicable
  applied boolean not null default false,
  financing_round_id bigint references financing_rounds(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (startup_id, article_key)
);
create index if not exists valuation_signals_startup_idx on valuation_signals (startup_id, created_at desc);
