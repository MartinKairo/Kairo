// Route POST du nouveau modèle "capital + dilution" (voir supabase/007_equity_model.sql
// et lib/investing/equity.js) : investir un montant en K¢ achète un % de
// capital à la valorisation post-money courante, plutôt qu'un nombre de
// "parts" à un prix dérivé d'un score (ancien système, voir app/api/trade/route.js,
// laissé en place tant que l'UI n'a pas basculé sur ce nouveau modèle).
//
// Comme app/api/trade/route.js : utilise le client Supabase "authentifié"
// (lib/supabase/server.js) pour savoir qui fait la requête, et les mises à
// jour cash + position ne sont pas dans une transaction DB (limite acceptée,
// même raisonnement que le système précédent).

import { createClient } from "@/lib/supabase/server";
import {
  MAX_STAKE_PCT_PER_STARTUP,
  equityPctForInvestment,
  kcValueOfEquity,
  maxInvestableKc,
} from "@/lib/investing/equity";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const { startupId, action, amountKc } = body ?? {};
  const amount = Number(amountKc);
  if (!startupId || !["buy", "sell"].includes(action) || !Number.isFinite(amount) || amount <= 0) {
    return Response.json({ error: "Requête invalide" }, { status: 400 });
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: "Connecte-toi pour investir" }, { status: 401 });
  }

  const [{ data: startup, error: startupError }, { data: valuation }, { data: portfolio, error: portfolioError }, { data: position }] =
    await Promise.all([
      supabase.from("startups").select("id, name, lifecycle_status").eq("id", startupId).single(),
      supabase.from("startup_valuations").select("current_post_money_eur").eq("startup_id", startupId).maybeSingle(),
      supabase.from("portfolio").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("positions").select("*").eq("user_id", user.id).eq("startup_id", startupId).maybeSingle(),
    ]);

  if (startupError || !startup) {
    return Response.json({ error: "Startup introuvable" }, { status: 404 });
  }
  if (startup.lifecycle_status !== "active") {
    const label = startup.lifecycle_status === "exited" ? "a été rachetée (exit)" : "a cessé son activité";
    return Response.json({ error: `${startup.name} ${label} — plus investissable` }, { status: 400 });
  }
  if (!valuation?.current_post_money_eur) {
    return Response.json(
      { error: "Aucune valorisation connue pour cette startup (aucun tour de financement enregistré)" },
      { status: 400 }
    );
  }
  if (portfolioError || !portfolio) {
    return Response.json(
      { error: "Portefeuille introuvable (migration 006_user_accounts.sql exécutée ?)" },
      { status: 500 }
    );
  }

  const currentPostMoneyEur = Number(valuation.current_post_money_eur);
  const existingEquityPct = Number(position?.equity_pct ?? 0);
  const existingInvestedKc = Number(position?.invested_kc ?? 0);

  if (action === "buy") {
    if (portfolio.cash < amount) {
      return Response.json({ error: "Capital fictif insuffisant" }, { status: 400 });
    }

    const newEquityPct = equityPctForInvestment(amount, currentPostMoneyEur);
    if (existingEquityPct + newEquityPct > MAX_STAKE_PCT_PER_STARTUP + 1e-9) {
      const maxKc = maxInvestableKc(existingEquityPct, currentPostMoneyEur);
      return Response.json(
        {
          error: `Un utilisateur ne peut pas détenir plus de ${Math.round(MAX_STAKE_PCT_PER_STARTUP * 100)}% du capital d'une startup. Il te reste ${Math.max(0, Math.floor(maxKc)).toLocaleString("fr-FR")} K¢ investissables ici.`,
        },
        { status: 400 }
      );
    }

    const newCash = portfolio.cash - amount;
    const newTotalEquityPct = existingEquityPct + newEquityPct;
    const newInvestedKc = existingInvestedKc + amount;

    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("portfolio").update({ cash: newCash, updated_at: new Date().toISOString() }).eq("user_id", user.id),
      supabase.from("positions").upsert({
        user_id: user.id,
        startup_id: startupId,
        equity_pct: newTotalEquityPct,
        invested_kc: newInvestedKc,
        updated_at: new Date().toISOString(),
      }),
    ]);
    if (e1 || e2) return Response.json({ error: (e1 || e2).message }, { status: 500 });

    return Response.json({ cash: newCash, equityPct: newTotalEquityPct, investedKc: newInvestedKc });
  }

  // action === "sell" : amountKc est la valeur (à la valorisation courante)
  // que l'utilisateur veut céder, pas un montant investi à l'origine — voir
  // lib/investing/equity.js (kcValueOfEquity / equityPctForInvestment sont la
  // même formule, utilisée dans les deux sens).
  if (existingEquityPct <= 0) {
    return Response.json({ error: "Aucune position détenue à vendre" }, { status: 400 });
  }

  const requestedEquityPct = equityPctForInvestment(amount, currentPostMoneyEur);
  const equityPctSold = Math.min(requestedEquityPct, existingEquityPct);
  const proceedsKc = kcValueOfEquity(equityPctSold, currentPostMoneyEur);
  const newEquityPct = existingEquityPct - equityPctSold;
  // Coût d'entrée restant réduit proportionnellement à la part cédée (pour
  // que le calcul de plus/moins-value affiché reste cohérent après une vente
  // partielle) — indicatif uniquement, ne sert pas au calcul de valeur.
  const newInvestedKc = existingInvestedKc * (newEquityPct / existingEquityPct);
  const newCash = portfolio.cash + proceedsKc;

  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabase.from("portfolio").update({ cash: newCash, updated_at: new Date().toISOString() }).eq("user_id", user.id),
    newEquityPct <= 1e-12
      ? supabase.from("positions").delete().eq("user_id", user.id).eq("startup_id", startupId)
      : supabase
          .from("positions")
          .update({ equity_pct: newEquityPct, invested_kc: newInvestedKc, updated_at: new Date().toISOString() })
          .eq("user_id", user.id)
          .eq("startup_id", startupId),
  ]);
  if (e1 || e2) return Response.json({ error: (e1 || e2).message }, { status: 500 });

  return Response.json({ cash: newCash, equityPct: newEquityPct, investedKc: newInvestedKc, proceedsKc });
}
