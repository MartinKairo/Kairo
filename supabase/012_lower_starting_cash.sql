-- Kairo — abaisse le capital de départ de 10 000 K¢ (500 M€, à l'ancien taux
-- de 50 000 €/K¢) à 1 000 K¢ (100 000 €, au nouveau taux de 100 €/K¢ — voir
-- lib/investing/equity.js EUR_PER_KC).
-- Contexte : avec 500 M€ de pouvoir d'achat, un joueur pouvait racheter
-- plusieurs % d'une licorne valorisée plusieurs milliards d'euros dès sa
-- première mise, ce qui cassait le côté "petit investisseur en position
-- minoritaire" (voir brief 2026-07-24). Voir aussi lib/market.js
-- STARTING_CASH.
--
-- Ne touche QUE le comportement pour les FUTURS inscrits (valeur par défaut
-- de la colonne + trigger d'inscription) : les portefeuilles déjà existants
-- ne sont volontairement PAS modifiés ici, pour ne pas mettre un utilisateur
-- ayant déjà investi en cash négatif ou incohérent avec ses positions
-- actuelles. Si tu veux réinitialiser TON propre portefeuille de test à
-- 1 000 K¢, fais-le explicitement et séparément (ex: update portfolio set
-- cash = 1000 where user_id = '<ton uuid>').
--
-- A executer une seule fois dans Supabase > SQL Editor, après 011_relative_valuation.sql.

alter table portfolio alter column cash set default 1000;

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.portfolio (user_id, cash) values (new.id, 1000);
  return new;
end;
$$ language plpgsql security definer set search_path = public;
