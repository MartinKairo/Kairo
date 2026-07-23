-- Kairo — notifications email : prévenir les utilisateurs qui détiennent une
-- position sur une startup dont la valorisation vient d'être mise à jour
-- automatiquement par le pipeline (voir app/api/refresh-valuations/route.js).
--
-- Pourquoi cette migration est nécessaire : positions est protégée par RLS
-- ("Chacun gère ses propres positions" — voir 007_equity_model.sql), donc un
-- utilisateur ne peut lire QUE ses propres positions. Le pipeline de
-- valorisation tourne sans session utilisateur (cron), il ne peut donc pas
-- lire "qui détient une position sur telle startup" avec la clé anonyme. Il a
-- besoin de la clé service_role (voir lib/supabaseAdmin.js), qui contourne
-- RLS — mais même avec cette clé, l'email de l'utilisateur n'est PAS dans une
-- table publique : il vit uniquement dans auth.users (schéma protégé par
-- Supabase). D'où cette table profiles, qui duplique juste l'email dans le
-- schéma public pour pouvoir le lire simplement une fois qu'on a déjà les
-- user_id (via positions).
--
-- A executer une seule fois dans Supabase > SQL Editor, après 009_valuation_pipeline.sql.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Chacun lit son propre profil" on public.profiles;
create policy "Chacun lit son propre profil"
  on public.profiles for select
  using (auth.uid() = user_id);

-- Étend le trigger de 006_user_accounts.sql (qui créait déjà la ligne
-- portfolio à l'inscription) pour créer aussi la ligne profiles au même
-- moment — new.email est disponible directement dans le trigger, pas besoin
-- d'accès admin supplémentaire ici.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.portfolio (user_id, cash) values (new.id, 10000)
    on conflict (user_id) do nothing;
  insert into public.profiles (user_id, email) values (new.id, new.email)
    on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Rattrapage pour les comptes déjà créés avant cette migration (le trigger
-- ci-dessus ne s'applique qu'aux inscriptions futures). Cette requête ne
-- fonctionne que parce que le SQL Editor de Supabase s'exécute avec les
-- droits complets (accès à auth.users), contrairement à l'app en prod.
insert into public.profiles (user_id, email)
  select id, email from auth.users where email is not null
  on conflict (user_id) do nothing;
