// Route déclenchée automatiquement (voir vercel.json > crons) pour le pipeline
// de valorisation — voir supabase/009_valuation_pipeline.sql et
// lib/scoring/sources/valuation.js pour le détail du schéma et de la logique
// d'extraction/classification.
//
// Contrairement à refresh-press/refresh-funding (qui ne font que mettre à jour
// un score interne), cette route ÉCRIT des événements de valorisation qui
// changent l'equity_pct réel des utilisateurs (dilution) — et le fait
// entièrement automatiquement, sans validation humaine avant application (voir
// brief v2 : "je préfèrerais quelque chose qui s'automatise directement").
// C'est pourquoi CHAQUE article examiné, qu'il donne lieu à une écriture ou
// non, est d'abord journalisé dans valuation_signals : c'est le seul filet de
// sécurité (audit a posteriori) puisqu'il n'y a pas de filet de sécurité a
// priori.
//
// Dédoublonnage : unique(startup_id, article_key) sur valuation_signals — un
// article déjà vu (même lien/titre) pour une startup donnée n'est jamais
// retraité, qu'il ait ou non donné lieu à une mise à jour la première fois.

import { supabase } from "@/lib/supabaseClient";
import { fetchValuationFeeds, findValuationSignals } from "@/lib/scoring/sources/valuation";

// Cette route écrit dans financing_rounds/positions (dilution réelle), à la
// différence des autres routes refresh-* qui ne font que mettre à jour un
// score interne — un accès public non protégé serait donc plus dangereux ici
// (n'importe qui pourrait la déclencher en boucle et spammer des tours
// fictifs). Si CRON_SECRET est définie (variable d'env Vercel), on exige le
// header que Vercel Cron envoie automatiquement sur les appels programmés
// (Authorization: Bearer <CRON_SECRET>) et on refuse tout le reste. Tant que
// la variable n'est pas définie, la route reste ouverte (comme les autres
// refresh-*) pour ne pas casser un déclenchement manuel de test.
function isAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { data: startups, error } = await supabase.from("startups").select("*");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const feeds = await fetchValuationFeeds();

  const results = [];

  for (const startup of startups) {
    const signals = findValuationSignals(startup.name, feeds);

    for (const signal of signals) {
      // Déjà vu ? On ne sait pas encore sans interroger la table -> on tente
      // l'insert et on s'appuie sur la contrainte unique(startup_id, article_key)
      // pour ignorer les doublons plutôt que de faire un select préalable par
      // article (plus simple, et pas de risque de course puisque ce cron
      // tourne en série, jamais en parallèle sur la même startup).
      const { data: inserted, error: insertError } = await supabase
        .from("valuation_signals")
        .insert({
          startup_id: startup.id,
          article_key: signal.articleKey,
          article_title: signal.articleTitle,
          article_url: signal.articleUrl,
          published_at: signal.publishedAt,
          detected_type: signal.detectedType,
          extracted_amount_eur: signal.extractedAmountEur,
          extracted_post_money_eur: signal.extractedPostMoneyEur,
        })
        .select()
        .single();

      if (insertError) {
        // Code 23505 = violation de contrainte unique -> article déjà traité,
        // ce n'est pas une erreur, on passe simplement au suivant.
        if (insertError.code !== "23505") {
          results.push({
            startup: startup.name,
            article: signal.articleTitle,
            ok: false,
            error: insertError.message,
          });
        }
        continue;
      }

      // Rumeur ou signal insuffisant : on garde la trace (déjà fait ci-dessus)
      // mais on n'applique rien.
      if (signal.detectedType !== "financing_round" && signal.detectedType !== "secondary_market") {
        results.push({
          startup: startup.name,
          article: signal.articleTitle,
          detected_type: signal.detectedType,
          applied: false,
        });
        continue;
      }

      // Pas de valorisation post-money exploitable -> rien à appliquer, même
      // si le type a été détecté (garde-fou déjà présent dans classifyValuationEvent,
      // revérifié ici par défense en profondeur).
      if (!signal.extractedPostMoneyEur || signal.extractedPostMoneyEur <= 0) {
        results.push({
          startup: startup.name,
          article: signal.articleTitle,
          detected_type: signal.detectedType,
          applied: false,
          reason: "post_money manquant",
        });
        continue;
      }

      const roundDate = signal.publishedAt
        ? new Date(signal.publishedAt).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);

      let rpcResult;
      if (signal.detectedType === "financing_round") {
        rpcResult = await supabase.rpc("record_financing_round", {
          p_startup_id: startup.id,
          p_round_date: roundDate,
          p_post_money_eur: signal.extractedPostMoneyEur,
          p_amount_eur: signal.extractedAmountEur,
          p_source_type: "press",
          p_source_ref: signal.articleUrl,
          p_precision_note: "Détecté automatiquement (pipeline presse) — ordre de grandeur, non audité juridiquement.",
        });
      } else {
        rpcResult = await supabase.rpc("record_secondary_valuation", {
          p_startup_id: startup.id,
          p_post_money_eur: signal.extractedPostMoneyEur,
          p_round_date: roundDate,
          p_source_type: "press",
          p_source_ref: signal.articleUrl,
          p_precision_note: "Détecté automatiquement (pipeline presse) — ordre de grandeur, non audité juridiquement.",
        });
      }

      if (rpcResult.error) {
        results.push({
          startup: startup.name,
          article: signal.articleTitle,
          detected_type: signal.detectedType,
          applied: false,
          error: rpcResult.error.message,
        });
        continue;
      }

      // secondary_market renvoie l'id du tour créé (returns bigint) ;
      // financing_round ne renvoie rien (returns void) -> financing_round_id
      // reste null dans ce cas, ce qui est acceptable (le lien se fait déjà
      // via source_ref = l'URL de l'article).
      const financingRoundId =
        signal.detectedType === "secondary_market" ? rpcResult.data : null;

      await supabase
        .from("valuation_signals")
        .update({ applied: true, financing_round_id: financingRoundId })
        .eq("id", inserted.id);

      results.push({
        startup: startup.name,
        article: signal.articleTitle,
        detected_type: signal.detectedType,
        applied: true,
        post_money_eur: signal.extractedPostMoneyEur,
        amount_eur: signal.extractedAmountEur,
      });
    }
  }

  return Response.json({
    examined: results.length,
    applied: results.filter((r) => r.applied).length,
    results,
    feeds_ok: feeds.length,
    feeds_total: 3,
  });
}
