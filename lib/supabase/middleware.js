// Rafraîchit le cookie de session Supabase à chaque requête. Sans ça, les
// utilisateurs seraient déconnectés de façon aléatoire dès que leur jeton
// d'accès expire (les Server Components ne peuvent pas écrire de cookies
// eux-mêmes, voir lib/supabase/server.js) — c'est le middleware qui s'en
// charge, comme recommandé par la doc Supabase pour Next.js (App Router).

import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export async function updateSession(request) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
      },
    },
  });

  // Ne pas retirer cet appel, même s'il semble inutile : c'est lui qui
  // déclenche le rafraîchissement du jeton si besoin.
  await supabase.auth.getUser();

  return supabaseResponse;
}
