// Route déclenchée manuellement (visite cette URL dans le navigateur) pour :
// 1. récupérer le signal funding (mentions de levées de fonds dans les mêmes
//    flux RSS que le signal presse — voir lib/scoring/sources/funding.js pour
//    le choix de cette approche) une seule fois pour toutes les startups
// 2. recalculer le score de momentum de chaque startup avec la formule de
//    lib/scoring/config.js
// 3. enregistrer le résultat dans Supabase

import { supabase } from "@/lib/supabaseClient";
import { fetchFundingFeeds, getFundingScore } from "@/lib/scoring/sources/funding";
import { computeMomentumScore } from "@/lib/scoring/config";

export async function GET() {
  const { data: startups, error } = await supabase.from("startups").select("*");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const feeds = await fetchFundingFeeds();

  const results = [];

  for (const startup of startups) {
    const funding = getFundingScore(startup.name, feeds);

    // ok: false -> on garde la dernière valeur connue plutôt que de mettre 0,
    // ce signal étant universel et obligatoire (jamais "non applicable").
    const signalFunding = funding.ok ? funding.score : startup.signal_funding;

    const newScore = computeMomentumScore({
      funding: signalFunding,
      trends: startup.signal_trends,
      press: startup.signal_press,
      github: startup.signal_github,
    });

    const delta = Math.round((newScore - startup.score) * 10) / 10;

    const { error: updateError } = await supabase
      .from("startups")
      .update({ signal_funding: signalFunding, score: newScore, delta })
      .eq("id", startup.id);

    results.push({
      name: startup.name,
      signal_funding: signalFunding,
      score: newScore,
      ok: !updateError,
      error: updateError?.message,
    });
  }

  return Response.json({ updated: results.length, results, feeds_ok: feeds.length, feeds_total: 3 });
}
