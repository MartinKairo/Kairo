import { createClient } from "@supabase/supabase-js";

// Client "admin" : utilise la clé service_role (contourne RLS), à réserver
// STRICTEMENT au code serveur qui a besoin de lire/écrire à travers tous les
// utilisateurs (ex: trouver qui détient une position sur une startup donnée,
// pour lib/notify — voir supabase/010_notifications.sql pour le pourquoi).
// Ne JAMAIS utiliser ce client dans du code exposé au navigateur, et ne
// jamais préfixer SUPABASE_SERVICE_ROLE_KEY par NEXT_PUBLIC_.
//
// supabaseAdmin est null si la clé n'est pas configurée (ex: en local sans
// .env.local à jour) plutôt que de faire planter tout le module au chargement
// — les appelants (lib/notify) doivent gérer ce cas en no-op silencieux.
export const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;
