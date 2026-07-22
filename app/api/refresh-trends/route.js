// Route déclenchée manuellement (visite cette URL dans le navigateur) pour :
// 1. récupérer le signal Google Trends (tendance de recherche) de chaque startup
// 2. recalculer son score de momentum global avec la formule de lib/scoring/config.js
// 3. enregistrer le résultat dans Supabase
//
// Un petit délai est ajouté entre chaque startup : l'API Google Trends utilisée
// n'est pas officielle et bloque temporairement les requêtes trop rapprochées.

import { supabase } from "@/lib/supabaseClient";
import { getTrendsScore } from "@/lib/scoring/sources/trends";
import { computeMomentumScore } from "@/lib/scoring/config";

const DELAY_BETWEEN_REQUESTS_MS = 8000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET() {
  const { data: startups, error } = await supabase.from("startups").select("*");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const results = [];

  for (const startup of startups) {
    const trends = await getTrendsScore(startup.name);

    // ok: false -> on garde la dernière valeur connue plutôt que de mettre 0,
    // ce signal étant universel et obligatoire (jamais "non applicable").
    const signalTrends = trends.ok ? trends.score : startup.signal_trends;

    const newScore = computeMomentumScore({
      funding: startup.signal_funding,
      trends: signalTrends,
      press: startup.signal_press,
      github: startup.signal_github,
    });

    const delta = Math.round((newScore - startup.score) * 10) / 10;

    const { error: updateError } = await supabase
      .from("startups")
      .update({ signal_trends: signalTrends, score: newScore, delta })
      .eq("id", startup.id);

    results.push({
      name: startup.name,
      signal_trends: signalTrends,
      score: newScore,
      ok: !updateError,
      error: updateError?.message,
    });

    await sleep(DELAY_BETWEEN_REQUESTS_MS);
  }

  return Response.json({ updated: results.length, results });
}
