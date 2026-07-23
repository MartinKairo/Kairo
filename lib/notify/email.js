// Envoi d'email transactionnel via l'API REST de Resend (resend.com) — pas de
// SDK ajouté à package.json, un simple fetch() suffit pour un seul type
// d'email et ça évite une dépendance de plus.
//
// RESEND_API_KEY doit être définie côté serveur uniquement (jamais
// NEXT_PUBLIC_, cette clé ne doit jamais atteindre le navigateur). Sans elle,
// sendEmail() est un no-op qui logue et renvoie ok:false plutôt que de faire
// planter le pipeline de valorisation à cause d'un envoi raté — l'email est
// un bonus, pas une condition pour appliquer les changements de valorisation.
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// onboarding@resend.dev fonctionne sans vérifier de domaine (limité, pratique
// pour démarrer) — remplaçable par une adresse sur un domaine vérifié via
// NOTIFY_FROM_EMAIL une fois que ça existe.
const FROM_ADDRESS = process.env.NOTIFY_FROM_EMAIL || "Kairo <onboarding@resend.dev>";

export async function sendEmail({ to, subject, text }) {
  if (!RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY absente, notification non envoyée :", subject);
    return { ok: false, skipped: true };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM_ADDRESS, to, subject, text }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[email] échec envoi:", res.status, body);
      return { ok: false, error: body };
    }

    return { ok: true };
  } catch (err) {
    console.error("[email] échec envoi:", err.message);
    return { ok: false, error: err.message };
  }
}
