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
//
// Après chaque application réussie, notifie par email les utilisateurs qui
// détiennent une position sur la startup concernée — voir
// lib/notify/valuationChangeNotifier.js et supabase/010_notifications.sql.

import { supabase } from "@/lib/supabaseClient";
import { fetchValuationFeeds, findValuationSignals } from "@/lib/scoring/sources/valuation";
import { getDailySentiment } from "@/lib/scoring/sources/sentiment";
import { getFundingScore } from "@/lib/scoring/sources/funding";
import { getGithubScore } from "@/lib/scoring/sources/github";
import { computeMomentumScore } from "@/lib/scoring/config";
import {
  computeNextOffset,
  deriveMomentumRegime,
  computeMarketNoise,
  MOMENTUM_CONSTANTS,
} from "@/lib/scoring/sources/momentum";
import { notifyPositionHolders } from "@/lib/notify/valuationChangeNotifier";

// Écart de valuation_offset_pct (voir momentum.js) à partir duquel un
// mouvement du jour est jugé assez notable pour justifier un email — sinon
// chaque petite oscillation quotidienne spammerait les détenteurs. 0.08 = 8
// points de pourcentage d'écart par rapport à la veille (ex: -3% -> +6%).
const NOTIFY_MOVE_THRESHOLD = 0.08;

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

      // Prévient les détenteurs d'une position sur cette startup — voir
      // lib/notify/valuationChangeNotifier.js. No-op silencieux si
      // SUPABASE_SERVICE_ROLE_KEY/RESEND_API_KEY ne sont pas configurées,
      // donc ne bloque jamais l'application du changement lui-même.
      const notifyResult = await notifyPositionHolders({
        startupId: startup.id,
        startupName: startup.name,
        eventType: signal.detectedType,
        newPostMoneyEur: signal.extractedPostMoneyEur,
        articleUrl: signal.articleUrl,
      });

      results.push({
        startup: startup.name,
        article: signal.articleTitle,
        detected_type: signal.detectedType,
        applied: true,
        post_money_eur: signal.extractedPostMoneyEur,
        amount_eur: signal.extractedAmountEur,
        notified: notifyResult.notified ?? 0,
      });
    }
  }

  // --- Phase 2 : tendance + buzz (voir supabase/011_relative_valuation.sql
  // et lib/scoring/sources/momentum.js) ---
  // Fait osciller valuation_offset_pct de CHAQUE startup, une fois par jour
  // (contrainte Vercel Cron Hobby : 1 déclenchement/jour max — voir
  // vercel.json), indépendamment de la Phase 1 ci-dessus (qui ne bouge
  // l'ANCRE que sur une vraie levée détectée, un événement rare). Réutilise
  // les mêmes flux RSS déjà récupérés (feeds), pas de second fetch.
  const today = new Date().toISOString().slice(0, 10);
  const { data: valuations, error: valuationsError } = await supabase
    .from("startup_valuations")
    .select("startup_id, current_post_money_eur");

  const momentumResults = [];

  if (valuationsError) {
    momentumResults.push({ ok: false, error: `lecture startup_valuations: ${valuationsError.message}` });
  } else {
    const anchorByStartup = Object.fromEntries(
      (valuations ?? []).map((v) => [v.startup_id, Number(v.current_post_money_eur)])
    );

    for (const startup of startups) {
      const anchorEur = anchorByStartup[startup.id] ?? null;
      // Pas d'ancre connue (aucun tour enregistré) -> rien à faire osciller,
      // cohérent avec le tri de app/page.js qui met ces startups en dernier.
      if (!anchorEur || anchorEur <= 0) continue;

      const todaySignal = getDailySentiment(startup.name, feeds);

      // Journalise le signal du jour AVANT de lire l'historique pour le
      // buzz : on veut comparer aujourd'hui à ce qui précède, jamais à
      // lui-même. On upsert quand même en premier (idempotent, clé unique
      // startup_id+observed_date) car un ré-appel le même jour doit écraser
      // la valeur du jour, pas la dupliquer.
      const { data: priorHistory, error: priorError } = await supabase
        .from("signal_history")
        .select("mentions_count, sentiment_score")
        .eq("startup_id", startup.id)
        .lt("observed_date", today)
        .order("observed_date", { ascending: false })
        .limit(30);

      const { error: upsertError } = await supabase.from("signal_history").upsert(
        {
          startup_id: startup.id,
          observed_date: today,
          mentions_count: todaySignal.mentionsCount,
          sentiment_score: todaySignal.sentimentScore,
        },
        { onConflict: "startup_id,observed_date" }
      );

      if (priorError || upsertError) {
        momentumResults.push({
          startup: startup.name,
          ok: false,
          error: priorError?.message ?? upsertError?.message,
        });
        continue;
      }

      const { data: recentHistoryRaw, error: recentError } = await supabase
        .from("signal_history")
        .select("sentiment_score")
        .eq("startup_id", startup.id)
        .lte("observed_date", today)
        .order("observed_date", { ascending: false })
        .limit(MOMENTUM_CONSTANTS.TREND_WINDOW_DAYS);

      if (recentError) {
        momentumResults.push({ startup: startup.name, ok: false, error: recentError.message });
        continue;
      }

      // Régime persistant (croissance/stagnation/décroissance, voir
      // supabase/018_market_noise.sql), déduit de vraies données du jour
      // (levée détectée dans la presse + ton des articles — voir
      // deriveMomentumRegime dans momentum.js) plutôt que tiré au hasard.
      // fundingScoreToday réutilise les flux RSS déjà récupérés plus haut
      // (feeds), aucun appel réseau supplémentaire.
      const fundingToday = getFundingScore(startup.name, feeds);
      const fundingScoreToday = fundingToday.ok ? fundingToday.score : 0;

      const newRegime = deriveMomentumRegime({
        currentRegime: startup.momentum_regime,
        fundingScoreToday,
        sentimentToday: todaySignal.sentimentScore,
      });
      const marketNoise = computeMarketNoise({ startupId: startup.id, dateStr: today, regime: newRegime });

      const oldOffsetPct = Number(startup.valuation_offset_pct ?? 0);
      const { newOffsetPct } = computeNextOffset({
        oldOffsetPct,
        today: {
          mentionsCount: todaySignal.mentionsCount,
          sentimentScore: todaySignal.sentimentScore,
        },
        priorHistory: (priorHistory ?? []).map((h) => ({
          mentionsCount: h.mentions_count,
          sentimentScore: h.sentiment_score === null ? null : Number(h.sentiment_score),
        })),
        recentHistoryWithToday: (recentHistoryRaw ?? []).map((h) => ({
          sentimentScore: h.sentiment_score === null ? null : Number(h.sentiment_score),
        })),
        marketNoise,
      });

      // Variation du jour de la valorisation AFFICHÉE (pas du score momentum),
      // pour la flèche hausse/baisse/stable + % à côté de chaque startup côté
      // frontend (voir supabase/021_daily_change_pct.sql). L'ancre ne bouge
      // pas dans cette phase (elle ne bouge que sur une vraie levée détectée,
      // Phase 1), donc la variation de currentPostMoneyEur entre avant/après
      // ce passage du cron se réduit à ce ratio, sans avoir besoin de relire
      // l'ancre ici.
      const dailyChangePct = (newOffsetPct - oldOffsetPct) / (1 + oldOffsetPct);

      // Signal GitHub (voir lib/scoring/sources/github.js et
      // supabase/020_new_signal_backed_roster.sql — toutes les startups
      // actives ont désormais un github_org réel) : recalculé chaque jour ici
      // plutôt que via la seule route manuelle /api/refresh-github, pour que
      // le score bouge automatiquement pour toutes les boîtes sans ajouter de
      // second cron (contrainte Vercel Hobby : 1 déclenchement/jour, voir
      // vercel.json). applicable==="error" garde la dernière valeur connue
      // (une panne d'API GitHub ne doit pas être interprétée comme une
      // absence de signal).
      const github = await getGithubScore(startup.github_org);
      const signalGithub =
        github.applicable === true
          ? github.score
          : github.applicable === "error"
            ? startup.signal_github
            : null;

      const newScore = computeMomentumScore({
        funding: startup.signal_funding,
        trends: startup.signal_trends,
        press: startup.signal_press,
        github: signalGithub,
      });
      const delta = Math.round((newScore - startup.score) * 10) / 10;

      const { error: updateError } = await supabase
        .from("startups")
        .update({
          valuation_offset_pct: newOffsetPct,
          momentum_regime: newRegime,
          daily_change_pct: dailyChangePct,
          signal_github: signalGithub,
          score: newScore,
          delta,
        })
        .eq("id", startup.id);

      if (updateError) {
        momentumResults.push({ startup: startup.name, ok: false, error: updateError.message });
        continue;
      }

      const moved = Math.abs(newOffsetPct - oldOffsetPct);
      let notified = 0;
      if (moved >= NOTIFY_MOVE_THRESHOLD) {
        const notifyResult = await notifyPositionHolders({
          startupId: startup.id,
          startupName: startup.name,
          eventType: "daily_move",
          newPostMoneyEur: anchorEur * (1 + newOffsetPct),
          offsetPct: newOffsetPct,
        });
        notified = notifyResult.notified ?? 0;
      }

      momentumResults.push({
        startup: startup.name,
        ok: true,
        mentions_today: todaySignal.mentionsCount,
        sentiment_today: todaySignal.sentimentScore,
        funding_score_today: fundingScoreToday,
        regime: newRegime,
        market_noise_pct: marketNoise,
        old_offset_pct: oldOffsetPct,
        new_offset_pct: newOffsetPct,
        daily_change_pct: dailyChangePct,
        signal_github: signalGithub,
        score: newScore,
        delta,
        notified,
      });
    }
  }

  // --- Phase 3 : instantané quotidien du portefeuille de chaque utilisateur
  // (voir supabase/016_portfolio_snapshots.sql) — prérequis pour un futur
  // classement "du mois"/"de la semaine". Un seul appel RPC (upsert group by
  // utilisateur côté SQL), pas de boucle JS par utilisateur nécessaire.
  const { data: snapshotCount, error: snapshotError } = await supabase.rpc(
    "capture_portfolio_snapshots"
  );

  return Response.json({
    examined: results.length,
    applied: results.filter((r) => r.applied).length,
    results,
    feeds_ok: feeds.length,
    feeds_total: 3,
    momentum: {
      processed: momentumResults.length,
      notable_moves: momentumResults.filter((r) => (r.notified ?? 0) > 0).length,
      results: momentumResults,
    },
    snapshots: snapshotError ? { ok: false, error: snapshotError.message } : { ok: true, count: snapshotCount },
  });
}
