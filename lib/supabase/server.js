// Client Supabase côté serveur (Server Components, Route Handlers) qui lit et
// écrit la session d'authentification dans les cookies de la requête. Utilisé
// partout où on a besoin de savoir QUI est connecté (app/page.js pour charger
// son portefeuille, app/api/trade/route.js pour valider ses achats/ventes) :
// contrairement au client anonyme partagé de lib/supabaseClient.js (qui reste
// utilisé pour les routes de rafraîchissement des signaux, sans notion
// d'utilisateur), celui-ci porte l'identité de la personne qui fait la requête,
// ce qui est nécessaire pour que les policies RLS (auth.uid() = user_id) sur
// les tables portfolio/holdings fonctionnent.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Appelé depuis un Server Component (lecture seule) : le
          // rafraîchissement de session est de toute façon géré par le
          // middleware (lib/supabase/middleware.js), donc on peut ignorer.
        }
      },
    },
  });
}
