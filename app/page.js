import { createClient } from "@/lib/supabase/server";
import { STARTING_CASH } from "@/lib/market";
import KairoApp from "@/components/KairoApp";

export default async function Home() {
  // Client "authentifié" (voir lib/supabase/server.js) : lit la session dans
  // les cookies pour savoir qui est connecté, nécessaire pour charger le bon
  // portefeuille (table portfolio/positions, filtrées par user_id + RLS —
  // voir supabase/006_user_accounts.sql et 007_equity_model.sql).
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // startup_valuations est une vue (distinct on) sans clé étrangère
  // embeddable par PostgREST -> on la charge à part et on fusionne en JS,
  // plutôt que d'essayer un select imbriqué. Voir supabase/007_equity_model.sql.
  const [{ data: startupsRaw, error }, { data: valuations, error: valuationsError }] = await Promise.all([
    supabase.from("startups").select("*"),
    supabase.from("startup_valuations").select("*"),
  ]);

  if (error) {
    return (
      <div style={{ padding: 40, color: "#FF5C5C" }}>
        Erreur de chargement des startups : {error.message}
      </div>
    );
  }
  if (valuationsError) {
    return (
      <div style={{ padding: 40, color: "#FF5C5C" }}>
        Erreur de chargement des valorisations : {valuationsError.message}. La migration
        supabase/007_equity_model.sql a-t-elle été exécutée ?
      </div>
    );
  }

  // Classement public (pseudo + valeur totale calculée côté SQL, jamais le
  // cash/positions de quelqu'un d'autre) — voir supabase/014_profiles_and_leaderboard.sql.
  // Visible même déconnecté (donnée publique), comme le marché.
  const { data: leaderboardRows } = await supabase.from("leaderboard").select("*");

  const valuationByStartup = Object.fromEntries((valuations ?? []).map((v) => [v.startup_id, v]));
  const startups = (startupsRaw ?? [])
    .map((s) => {
      const v = valuationByStartup[s.id];
      const anchorEur = v?.current_post_money_eur ?? null;
      // Valorisation affichée/investissable = ancre (dernière levée réelle
      // sourcée, inchangée) × (1 + écart du jour) — voir
      // supabase/011_relative_valuation.sql et lib/scoring/sources/momentum.js.
      // L'écart oscille autour de 0 chaque jour (tendance presse + buzz),
      // borné à ±40%, et repart à 0 dès qu'une nouvelle levée réelle déplace
      // l'ancre. Pas d'ancre connue -> pas d'oscillation à appliquer (null).
      const offsetPct = Number(s.valuation_offset_pct ?? 0);
      const currentPostMoneyEur = anchorEur !== null ? anchorEur * (1 + offsetPct) : null;
      return {
        ...s,
        currentPostMoneyEur,
        anchorPostMoneyEur: anchorEur,
        valuationOffsetPct: offsetPct,
        lastRoundDate: v?.last_round_date ?? null,
      };
    })
    // Startups sans tour de financement connu (valorisation introuvable) en
    // dernier, celles avec la plus grosse valorisation en premier — voir brief
    // "100% des startups doivent avoir une valorisation sourcée publiquement".
    .sort((a, b) => (b.currentPostMoneyEur ?? -1) - (a.currentPostMoneyEur ?? -1));

  // Pas connecté -> pas de portefeuille à charger, KairoApp affiche le
  // marché en lecture seule avec une invite de connexion à la place du solde.
  if (!user) {
    return (
      <KairoApp
        startups={startups}
        initialCash={null}
        initialPositions={{}}
        userEmail={null}
        leaderboard={leaderboardRows ?? []}
      />
    );
  }

  // portfolio/positions peuvent être absents si supabase/006_user_accounts.sql
  // ou 007_equity_model.sql n'ont pas encore été exécutés -> on retombe sur un
  // portefeuille par défaut plutôt que de faire planter la page.
  // public_profiles (pseudo public, distincte de la table privée "profiles"
  // en 010_notifications.sql — voir 014_profiles_and_leaderboard.sql) peut
  // être absente si cette migration n'a pas encore été exécutée -> pseudo
  // par défaut nul, pas de plantage.
  // my_clubs/club_leaderboard peuvent être absentes si supabase/015_clubs.sql
  // n'a pas encore été exécutée -> pas de plantage, juste aucun club affiché.
  // Ces deux vues filtrent déjà sur auth.uid() en interne (voir la migration),
  // donc ce select ne renvoie que les clubs de l'utilisateur connecté.
  const [{ data: portfolio }, { data: positionsRows }, { data: profile }, { data: myClubsRows }, { data: clubLeaderboardRows }] =
    await Promise.all([
      supabase.from("portfolio").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("positions").select("*").eq("user_id", user.id),
      supabase.from("public_profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
      supabase.from("my_clubs").select("*"),
      supabase.from("club_leaderboard").select("*"),
    ]);

  const initialCash = portfolio?.cash ?? STARTING_CASH;
  const initialPositions = Object.fromEntries(
    (positionsRows ?? [])
      .filter((p) => Number(p.equity_pct) > 0)
      .map((p) => [p.startup_id, { equityPct: Number(p.equity_pct), investedKc: Number(p.invested_kc) }])
  );

  return (
    <KairoApp
      startups={startups}
      initialCash={initialCash}
      initialPositions={initialPositions}
      userEmail={user.email}
      userId={user.id}
      displayName={profile?.display_name ?? null}
      leaderboard={leaderboardRows ?? []}
      myClubs={myClubsRows ?? []}
      clubLeaderboard={clubLeaderboardRows ?? []}
    />
  );
}
