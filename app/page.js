import { createClient } from "@/lib/supabase/server";
import { STARTING_CASH } from "@/lib/market";
import KairoApp from "@/components/KairoApp";

export default async function Home() {
  // Client "authentifié" (voir lib/supabase/server.js) : lit la session dans
  // les cookies pour savoir qui est connecté, nécessaire pour charger le bon
  // portefeuille (table portfolio/holdings, filtrées par user_id + RLS — voir
  // supabase/006_user_accounts.sql).
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: startups, error } = await supabase.from("startups").select("*").order("score", { ascending: false });

  if (error) {
    return (
      <div style={{ padding: 40, color: "#FF5C5C" }}>
        Erreur de chargement des startups : {error.message}
      </div>
    );
  }

  // Pas connecté -> pas de portefeuille à charger, KairoApp affiche le
  // marché en lecture seule avec une invite de connexion à la place du solde.
  if (!user) {
    return <KairoApp startups={startups} initialCash={null} initialHoldings={{}} userEmail={null} />;
  }

  // portfolio/holdings peuvent être absents si supabase/006_user_accounts.sql
  // n'a pas encore été exécuté -> on retombe sur un portefeuille par défaut
  // plutôt que de faire planter la page.
  const [{ data: portfolio }, { data: holdingsRows }] = await Promise.all([
    supabase.from("portfolio").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("holdings").select("*").eq("user_id", user.id),
  ]);

  const initialCash = portfolio?.cash ?? STARTING_CASH;
  const initialHoldings = Object.fromEntries((holdingsRows ?? []).map((h) => [h.startup_id, h.shares]));

  return (
    <KairoApp startups={startups} initialCash={initialCash} initialHoldings={initialHoldings} userEmail={user.email} />
  );
}
