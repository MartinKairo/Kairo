// Route de redirection après clic sur le lien magique reçu par email (voir
// components/AuthBox.js qui déclenche l'envoi via supabase.auth.signInWithOtp
// avec emailRedirectTo pointant ici). Échange le code temporaire présent dans
// l'URL contre une vraie session, puis renvoie vers l'accueil.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/?auth_error=1`);
}
