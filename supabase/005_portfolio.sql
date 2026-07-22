-- Kairo — capital fictif et portefeuille persistants (achat/vente de "parts")
-- A executer une seule fois dans Supabase > SQL Editor
--
-- Pas de systeme de comptes utilisateurs pour l'instant (voir todo "ajouter un
-- mode compte simple", futur) : un seul portefeuille global fictif, partage
-- par tous les visiteurs du site. La ligne singleton est forcee a id = 1 par
-- la contrainte ci-dessous, pour eviter d'en creer une deuxieme par erreur.
--
-- Le prix d'une "part" est toujours score_actuel * 10 (SHARE_PRICE_MULTIPLIER,
-- voir lib/market.js) : aucun historique de prix n'est garde, achat et vente
-- se font tous les deux au score courant de la startup au moment de la
-- transaction (voir app/api/trade/route.js).

create table if not exists portfolio (
  id bigint primary key default 1,
  cash numeric not null default 10000,
  updated_at timestamptz not null default now(),
  constraint portfolio_singleton check (id = 1)
);

insert into portfolio (id, cash)
values (1, 10000)
on conflict (id) do nothing;

create table if not exists holdings (
  startup_id bigint primary key references startups(id) on delete cascade,
  shares integer not null default 0,
  updated_at timestamptz not null default now()
);
