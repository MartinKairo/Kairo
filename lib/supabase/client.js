// Client Supabase côté navigateur, utilisé par les composants "use client"
// pour se connecter (lien magique par email) et se déconnecter — voir
// components/AuthBox.js. Sépare l'identité utilisateur (cookies de session,
// gérés par ce client) du client anonyme partagé de lib/supabaseClient.js.

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
