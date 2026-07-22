// Route déclenchée manuellement (visite cette URL dans le navigateur) pour :
// 1. récupérer le vrai signal GitHub de chaque startup
// 2. recalculer son score de momentum global avec la formule de lib/scoring/config.js
// 3. enregistrer le résultat dans Supabase
//
// Les signaux funding / trends / press restent fictifs pour l'instant (prochaines étapes).

import { supabase } from "@/lib/supabaseClient";
import { getGithubScore } from "@/lib/scoring/sources/github";
import { computeMomentumScore } from "@/lib/scoring/config";

export async function GET() {
  const { data: startups, error } = await supabase.from("startups").select("*");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const results = [];

  for (const startup of startups) {
    const signalGithub = await getGithubScore(startup.github_org);

    const newScore = computeMomentumScore({
      funding: startup.signal_funding,
      github: signalGithub,
      trends: startup.signal_trends,
      press: startup.signal_press,
    });

    const delta = Math.round((newScore - startup.score) * 10) / 10;

    const { error: updateError } = await supabase
      .from("startups")
      .update({ signal_github: signalGithub, score: newScore, delta })
      .eq("id", startup.id);

    results.push({
      name: startup.name,
      github_org: startup.github_org,
      signal_github: signalGithub,
      score: newScore,
      ok: !updateError,
      error: updateError?.message,
    });
  }

  return Response.json({ updated: results.length, results });
}
