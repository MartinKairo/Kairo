// Route déclenchée manuellement (visite cette URL dans le navigateur) pour :
// 1. récupérer le signal presse (mentions dans les flux RSS tech français) une
//    seule fois pour toutes les startups
// 2. recalculer le score de momentum de chaque startup avec la formule de
//    lib/scoring/config.js
// 3. enregistrer le résultat dans Supabase

import { supabase } from "@/lib/supabaseClient";
import { fetchPressFeeds, getPressScore } from "@/lib/scoring/sources/press";
import { computeMomentumScore } from "@/lib/scoring/config";

export async function GET() {
  const { data: startups, error } = await supabase.from("startups").select("*");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const feeds = await fetchPressFeeds();

  const results = [];

  for (const startup of startups) {
    const press = getPressScore(startup.name, feeds);

    // ok: false -> on garde la dernière valeur connue plutôt que de mettre 0,
    // ce signal étant universel et obligatoire (jamais "non applicable").
    const signalPress = press.ok ? press.score : startup.signal_press;

    const newScore = computeMomentumScore({
      funding: startup.signal_funding,
      trends: startup.signal_trends,
      press: signalPress,
      github: startup.signal_github,
    });

    const delta = Math.round((newScore - startup.score) * 10) / 10;

    const { error: updateError } = await supabase
      .from("startups")
      .update({ signal_press: signalPress, score: newScore, delta })
      .eq("id", startup.id);

    results.push({
      name: startup.name,
      signal_press: signalPress,
      score: newScore,
      ok: !updateError,
      error: updateError?.message,
    });
  }

  return Response.json({ updated: results.length, results, feeds_ok: feeds.length, feeds_total: 3 });
}
