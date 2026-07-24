-- Kairo — frein anti-multi-comptes, meilleur effort (voir échange du
-- 2026-07-24 : "protection anti-multi-comptes"). L'authentification de Kairo
-- est sans mot de passe (magic link, voir components/AuthBox.js ->
-- supabase.auth.signInWithOtp) : aucun mot de passe, aucune vérification
-- téléphone/pièce d'identité, et un trigger Postgres sur auth.users n'a accès
-- à aucune métadonnée réseau (IP, device...) -> une détection fiable des
-- multi-comptes n'est pas possible avec les seuls outils SQL de ce projet.
--
-- Ce qui EST possible et proportionné ici (monnaie fictive, enjeu réel
-- faible) : bloquer les domaines email jetables/temporaires les plus connus
-- (Mailinator, Yopmail...), qui sont le moyen le plus simple et le plus
-- utilisé pour créer des comptes en série. Ça n'empêche pas quelqu'un de
-- créer plusieurs comptes avec de vraies adresses distinctes, mais ça relève
-- déjà nettement la barre par rapport à aucune protection.
--
-- A executer une seule fois dans Supabase > SQL Editor, après
-- 016_portfolio_snapshots.sql.

-- 1) Liste de domaines bloqués. Pas de policy RLS dessus : ni anon ni
-- authenticated n'ont besoin d'y accéder directement (seule la fonction
-- security definer ci-dessous la lit), donc RLS activée sans aucune policy
-- = table complètement fermée aux rôles applicatifs, lisible seulement par
-- postgres et les fonctions security definer.
create table if not exists blocked_email_domains (
  domain text primary key
);
alter table blocked_email_domains enable row level security;

insert into blocked_email_domains (domain) values
  ('mailinator.com'), ('guerrillamail.com'), ('10minutemail.com'), ('tempmail.com'),
  ('yopmail.com'), ('trashmail.com'), ('sharklasers.com'), ('getnada.com'),
  ('dispostable.com'), ('fakeinbox.com'), ('maildrop.cc'), ('throwawaymail.com'),
  ('temp-mail.org'), ('discard.email'), ('mailnesia.com'), ('mintemail.com'),
  ('spamgourmet.com'), ('mytemp.email'), ('moakt.com'), ('emailondeck.com')
on conflict (domain) do nothing;

-- 2) Trigger bloquant à l'inscription (before insert -> empêche la création
-- de la ligne auth.users elle-même, donc aucun portfolio/profil n'est créé
-- non plus derrière). L'erreur remonte à supabase.auth.signInWithOtp côté
-- client, affichée via errorMsg dans components/AuthBox.js sans changement
-- de code nécessaire côté app.
create or replace function public.block_disposable_email_domains()
returns trigger as $$
begin
  if exists (
    select 1 from public.blocked_email_domains
    where domain = lower(split_part(new.email, '@', 2))
  ) then
    raise exception 'Adresse email temporaire non autorisée, utilise une adresse email classique.';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_block_disposable_email on auth.users;
create trigger on_auth_user_block_disposable_email
  before insert on auth.users
  for each row execute function public.block_disposable_email_domains();
