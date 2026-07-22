-- Kairo — comptes utilisateurs simples (email + lien magique, sans mot de
-- passe) pour que chaque visiteur ait son propre portefeuille fictif
-- persistant, au lieu du portefeuille unique partagé par tout le monde
-- (005_portfolio.sql).
-- A executer une seule fois dans Supabase > SQL Editor
--
-- Utilise Supabase Auth (deja integre au projet — pas de table a creer pour
-- les comptes eux-memes, ils vivent dans auth.users). Les tables
-- portfolio/holdings sont maintenant liees a auth.users(id) et protegees par
-- Row Level Security : un utilisateur ne peut lire/modifier que ses propres
-- lignes (auth.uid() = user_id).
--
-- Comme il ne s'agit que de donnees de test (argent fictif, portefeuille
-- unique de dev), on repart de zero plutot que de migrer l'ancienne ligne
-- unique vers un utilisateur en particulier.

drop table if exists holdings;
drop table if exists portfolio;

create table portfolio (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cash numeric not null default 10000,
  updated_at timestamptz not null default now()
);

create table holdings (
  user_id uuid not null references auth.users(id) on delete cascade,
  startup_id bigint not null references startups(id) on delete cascade,
  shares integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, startup_id)
);

alter table portfolio enable row level security;
alter table holdings enable row level security;

create policy "Chacun gere son propre portefeuille"
  on portfolio for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Chacun gere ses propres positions"
  on holdings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Cree automatiquement une ligne portfolio (10000 K¢ de depart) des qu'un
-- nouvel utilisateur s'inscrit (premiere connexion par lien magique), pour ne
-- pas avoir a gerer ce cas cote appli (voir app/page.js et app/api/trade/route.js
-- qui retombent quand meme sur une valeur par defaut si jamais la ligne manque).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.portfolio (user_id, cash) values (new.id, 10000);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
