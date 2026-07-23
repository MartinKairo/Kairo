// Notifie par email les utilisateurs qui détiennent une position sur une
// startup dont la valorisation vient d'être mise à jour automatiquement —
// appelé par app/api/refresh-valuations/route.js juste après un appel RPC
// réussi (record_financing_round / record_secondary_valuation).
//
// Nécessite supabaseAdmin (clé service_role — voir lib/supabaseAdmin.js et
// supabase/010_notifications.sql pour le pourquoi : positions/profiles sont
// protégées par RLS, et ce pipeline tourne sans session utilisateur). Si
// supabaseAdmin ou RESEND_API_KEY sont absents, cette fonction ne fait rien
// (no-op) plutôt que de faire échouer le pipeline — la notification est un
// bonus, jamais une condition pour appliquer un changement de valorisation.

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "./email";
import { kcValueOfEquity } from "@/lib/investing/equity";
import { formatEur, formatPct } from "@/lib/investing/format";

function buildMessage({ startupName, eventType, newPostMoneyEur, equityPct, articleUrl, offsetPct }) {
  const newValueKc = kcValueOfEquity(equityPct, newPostMoneyEur);
  const valueLine = `Valeur actuelle estimée de ta position : ${newValueKc.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} K¢ (${formatPct(equityPct)} de ${formatEur(newPostMoneyEur)}).`;
  const sourceLine = articleUrl ? `\n\nSource : ${articleUrl}` : "";

  // Depuis le modèle "valorisation relative" (voir supabase/011_relative_valuation.sql),
  // un nouveau tour ne dilue plus les positions existantes : le % détenu reste
  // fixe, seule la valeur oscille — comme une action en bourse. Ancien texte
  // ("participation réduite au prorata") retiré, il était devenu faux.
  if (eventType === "financing_round") {
    return {
      subject: `Kairo — ${startupName} a levé des fonds (nouvelle valorisation)`,
      text: `${startupName} vient de lever des fonds, détecté automatiquement par Kairo dans la presse.\n\nNouvelle valorisation de référence : ${formatEur(newPostMoneyEur)}.\nTon % détenu ne change pas (aucune dilution dans Kairo) ; seule la valeur affichée de ta position évolue avec la nouvelle référence.\n\n${valueLine}${sourceLine}\n\nCeci est une détection automatique par mots-clés (ordre de grandeur), pas un audit juridique.`,
    };
  }

  if (eventType === "secondary_market") {
    return {
      subject: `Kairo — ${startupName} : nouvelle valorisation (marché secondaire)`,
      text: `Une opération de marché secondaire sur ${startupName} a été détectée automatiquement par Kairo dans la presse (des actionnaires existants ont revendu leurs parts, sans nouveau capital levé).\n\nNouvelle valorisation de référence : ${formatEur(newPostMoneyEur)}.\nTon % détenu ne change pas ; seule la valeur affichée de ta position évolue.\n\n${valueLine}${sourceLine}\n\nCeci est une détection automatique par mots-clés (ordre de grandeur), pas un audit juridique.`,
    };
  }

  // daily_move : mouvement du jour de l'indice tendance+buzz (voir
  // app/api/refresh-valuations/route.js), pas un nouveau tour réel. On ne
  // notifie que les mouvements marqués comme notables par l'appelant (voir
  // NOTIFY_MOVE_THRESHOLD côté route) pour éviter un email quotidien pour
  // chaque petite oscillation.
  const direction = offsetPct >= 0 ? "en hausse" : "en baisse";
  const offsetLine = `Écart actuel par rapport à la dernière levée connue : ${offsetPct >= 0 ? "+" : ""}${(offsetPct * 100).toFixed(1)}%.`;
  return {
    subject: `Kairo — ${startupName} : forte variation du jour (${direction})`,
    text: `La valorisation affichée de ${startupName} a bougé fortement aujourd'hui (tendance presse + buzz détecté automatiquement par Kairo), sans nouveau tour de financement réel.\n\nValorisation affichée : ${formatEur(newPostMoneyEur)}.\n${offsetLine}\nTon % détenu ne change pas ; ceci reflète juste l'oscillation du "cours" autour de la dernière levée sourcée.\n\n${valueLine}\n\nCeci est un indice fictif basé sur le volume/ton de la presse, pas une valorisation réelle.`,
  };
}

export async function notifyPositionHolders({ startupId, startupName, eventType, newPostMoneyEur, articleUrl, offsetPct = null }) {
  if (!supabaseAdmin) {
    console.warn("[notify] supabaseAdmin absent (SUPABASE_SERVICE_ROLE_KEY non configurée), notifications ignorées");
    return { ok: false, skipped: true, notified: 0 };
  }

  const { data: holders, error: holdersError } = await supabaseAdmin
    .from("positions")
    .select("user_id, equity_pct")
    .eq("startup_id", startupId)
    .gt("equity_pct", 0);

  if (holdersError) {
    console.error("[notify] échec lecture positions:", holdersError.message);
    return { ok: false, error: holdersError.message, notified: 0 };
  }
  if (!holders?.length) {
    return { ok: true, notified: 0 };
  }

  const userIds = holders.map((h) => h.user_id);
  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("user_id, email")
    .in("user_id", userIds);

  if (profilesError) {
    console.error("[notify] échec lecture profiles:", profilesError.message);
    return { ok: false, error: profilesError.message, notified: 0 };
  }

  const emailByUserId = Object.fromEntries((profiles ?? []).map((p) => [p.user_id, p.email]));

  let notified = 0;
  for (const holder of holders) {
    const email = emailByUserId[holder.user_id];
    if (!email) continue;

    const { subject, text } = buildMessage({
      startupName,
      eventType,
      newPostMoneyEur,
      equityPct: Number(holder.equity_pct),
      articleUrl,
      offsetPct,
    });

    const result = await sendEmail({ to: email, subject, text });
    if (result.ok) notified += 1;
  }

  return { ok: true, notified };
}
