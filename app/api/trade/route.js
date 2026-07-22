// Route POST déclenchée par les boutons Acheter/Vendre du portefeuille.
// Achat/vente d'UNE part à la fois, au prix courant (score * 10, voir
// lib/market.js), sans conserver d'historique de prix — le prix payé n'est
// jamais figé, la valeur du portefeuille suit toujours le score en direct.
//
// Chaque utilisateur a son propre portefeuille (voir supabase/006_user_accounts.sql,
// tables portfolio/holdings avec user_id + RLS) : on utilise le client
// Supabase "authentifié" (lib/supabase/server.js, lit la session dans les
// cookies) pour savoir qui fait la requête, plutôt que le client anonyme
// utilisé par les routes de rafraîchissement des signaux.
//
// Limite connue : les deux mises à jour (cash + holdings) ne sont pas faites
// dans une transaction DB (le client supabase-js ne le permet pas facilement
// sans passer par une fonction RPC côté Postgres). Acceptable pour ce
// simulateur (un seul appareil à la fois par utilisateur, requêtes rares).

import { createClient } from "@/lib/supabase/server";
import { SHARE_PRICE_MULTIPLIER } from "@/lib/market";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const { startupId, action } = body ?? {};
  if (!startupId || !["buy", "sell"].includes(action)) {
    return Response.json({ error: "Requête invalide" }, { status: 400 });
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: "Connecte-toi pour acheter ou vendre" }, { status: 401 });
  }

  const [{ data: startup, error: startupError }, { data: portfolio, error: portfolioError }, { data: holding }] =
    await Promise.all([
      supabase.from("startups").select("id, score").eq("id", startupId).single(),
      supabase.from("portfolio").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("holdings").select("*").eq("user_id", user.id).eq("startup_id", startupId).maybeSingle(),
    ]);

  if (startupError || !startup) {
    return Response.json({ error: "Startup introuvable" }, { status: 404 });
  }
  if (portfolioError || !portfolio) {
    // Ligne "portfolio" absente -> normalement créée automatiquement à
    // l'inscription par le trigger on_auth_user_created (voir la migration).
    // Si elle manque, la migration 006 n'a probablement pas été exécutée.
    return Response.json(
      { error: "Portefeuille introuvable (migration 006_user_accounts.sql exécutée ?)" },
      { status: 500 }
    );
  }

  const price = startup.score * SHARE_PRICE_MULTIPLIER;
  const currentShares = holding?.shares ?? 0;

  if (action === "buy") {
    if (portfolio.cash < price) {
      return Response.json({ error: "Capital fictif insuffisant" }, { status: 400 });
    }

    const newCash = portfolio.cash - price;
    const newShares = currentShares + 1;

    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase
        .from("portfolio")
        .update({ cash: newCash, updated_at: new Date().toISOString() })
        .eq("user_id", user.id),
      supabase
        .from("holdings")
        .upsert({ user_id: user.id, startup_id: startupId, shares: newShares, updated_at: new Date().toISOString() }),
    ]);
    if (e1 || e2) return Response.json({ error: (e1 || e2).message }, { status: 500 });

    return Response.json({ cash: newCash, shares: newShares });
  }

  // action === "sell"
  if (currentShares <= 0) {
    return Response.json({ error: "Aucune part détenue à vendre" }, { status: 400 });
  }

  const newCash = portfolio.cash + price;
  const newShares = currentShares - 1;

  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabase.from("portfolio").update({ cash: newCash, updated_at: new Date().toISOString() }).eq("user_id", user.id),
    newShares === 0
      ? supabase.from("holdings").delete().eq("user_id", user.id).eq("startup_id", startupId)
      : supabase
          .from("holdings")
          .update({ shares: newShares, updated_at: new Date().toISOString() })
          .eq("user_id", user.id)
          .eq("startup_id", startupId),
  ]);
  if (e1 || e2) return Response.json({ error: (e1 || e2).message }, { status: 500 });

  return Response.json({ cash: newCash, shares: newShares });
}
