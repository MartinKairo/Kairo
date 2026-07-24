"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { STARTING_CASH } from "@/lib/market";
import { equityPctForInvestment, kcValueOfEquity, maxInvestableKc, MAX_STAKE_PCT_PER_STARTUP } from "@/lib/investing/equity";
import { formatKc, formatPct, STAGE_LABELS, LIFECYCLE_LABELS } from "@/lib/investing/format";
import { computeMomentumScore } from "@/lib/scoring/config";
import AuthBox from "@/components/AuthBox";
import { createClient } from "@/lib/supabase/client";

const Icon = ({ path, size = 14, color = "currentColor", ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    {path}
  </svg>
);
const TrendingUp = (p) => (
  <Icon
    {...p}
    path={
      <>
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </>
    }
  />
);
const TrendingDown = (p) => (
  <Icon
    {...p}
    path={
      <>
        <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
        <polyline points="17 18 23 18 23 12" />
      </>
    }
  />
);
const Minus = (p) => (
  <Icon {...p} path={<line x1="5" y1="12" x2="19" y2="12" />} />
);
const Flame = (p) => (
  <Icon
    {...p}
    path={
      <path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z" />
    }
  />
);
const Github = (p) => (
  <Icon
    {...p}
    path={
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22" />
    }
  />
);
const Search = (p) => (
  <Icon
    {...p}
    path={
      <>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </>
    }
  />
);
const Wallet = (p) => (
  <Icon
    {...p}
    path={
      <>
        <path d="M21 12V7H5a2 2 0 010-4h14v4" />
        <path d="M3 5v14a2 2 0 002 2h16v-5" />
        <path d="M18 12a2 2 0 000 4h4v-4z" />
      </>
    }
  />
);

function useCountUp(target, duration = 600) {
  const [val, setVal] = useState(target);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const from = val;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      setVal(from + (target - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line
  }, [target]);
  return val;
}

// Volontairement PAS de logo (ni image externe, ni pastille stylisée type
// "branding") — voir échange du 2026-07-24 sur le risque de dénigrement :
// pour des startups réelles identifiables, on limite l'app au strict texte
// factuel (nom en typo neutre, pas de traitement visuel qui suggère un
// partenariat/une caution de la marque). Remplace l'ancien composant
// StartupLogo (image logo.clearbit.com puis unavatar.io).

function LifecycleBadge({ status }) {
  if (status === "active" || !status) return null;
  const isExit = status === "exited";
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "3px 7px",
        borderRadius: 6,
        letterSpacing: "0.03em",
        background: isExit ? "#12351F" : "#2A1416",
        color: isExit ? "#3DDC84" : "#FF8A8A",
        border: `1px solid ${isExit ? "#1E4E2E" : "#4A2226"}`,
      }}
    >
      {LIFECYCLE_LABELS[status] || status}
    </span>
  );
}

function StageBadge({ stage }) {
  if (!stage) return null;
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: "3px 7px",
        borderRadius: 6,
        letterSpacing: "0.03em",
        background: "#1C212B",
        color: "#8A93A6",
        border: "1px solid #232833",
      }}
    >
      {STAGE_LABELS[stage] || stage}
    </span>
  );
}

// Flèche hausse/baisse/stable + % de variation de la valorisation depuis le
// dernier passage du cron (voir dailyChangePct dans app/page.js et
// supabase/021_daily_change_pct.sql). En dessous de 0,05 % on considère que
// c'est stable (évite d'afficher une flèche pour un arrondi flottant).
function ValuationChange({ pct, size = 12 }) {
  const value = Number(pct ?? 0);
  const isFlat = Math.abs(value) < 0.0005;
  const isUp = value > 0;
  const color = isFlat ? "#5C6373" : isUp ? "#3DDC84" : "#FF5C5C";
  return (
    <div
      className="kairo-mono"
      style={{ display: "inline-flex", alignItems: "center", gap: 3, color, fontSize: size, fontWeight: 600 }}
    >
      {isFlat ? <Minus size={size} /> : isUp ? <TrendingUp size={size} /> : <TrendingDown size={size} />}
      {isFlat ? "0,0 %" : `${isUp ? "+" : ""}${formatPct(value, 1)}`}
    </div>
  );
}

export default function KairoApp({
  startups,
  initialCash,
  initialPositions,
  userEmail,
  userId,
  displayName,
  leaderboard,
  myClubs,
  clubLeaderboard,
}) {
  const router = useRouter();
  // Portefeuille persistant en base, propre à chaque utilisateur (comptes
  // Supabase Auth par lien magique, table portfolio + positions avec RLS —
  // voir supabase/006_user_accounts.sql et 007_equity_model.sql).
  //
  // Modèle "capital + dilution" (voir lib/investing/equity.js) : une position
  // est un % de capital détenu (equityPct), pas un nombre de parts à un prix
  // dérivé d'un score. La valeur affichée dépend de la valorisation courante
  // de la startup (startup.currentPostMoneyEur), jamais du prix payé à
  // l'achat (investedKc n'est gardé que pour afficher une plus/moins-value
  // indicative).
  //
  // Pas connecté -> initialCash vaut null (voir app/page.js) : on affiche le
  // marché en lecture seule avec une invite de connexion (AuthBox) à la
  // place du solde, plutôt qu'un faux solde qui ne serait jamais sauvegardé.
  const isLoggedIn = Boolean(userEmail);
  const [positions, setPositions] = useState(initialPositions || {});
  const [cash, setCash] = useState(initialCash);
  const [pendingId, setPendingId] = useState(null); // id de la startup en cours d'achat/vente
  const [tradeError, setTradeError] = useState(null);
  const [selected, setSelected] = useState(startups[0]);
  const [tab, setTab] = useState("marche");
  const [query, setQuery] = useState("");
  const [amountKc, setAmountKc] = useState("");

  // Pseudo public (table public_profiles, distincte de la table privée
  // "profiles" utilisée pour les emails en 010_notifications.sql — voir
  // supabase/014_profiles_and_leaderboard.sql) : édité directement depuis le
  // navigateur via le client Supabase authentifié, la policy RLS "Chacun
  // modifie son propre pseudo" garantit qu'on ne peut écrire que sa propre
  // ligne (filtrée par user_id ici en plus, par sécurité défensive côté
  // client).
  const [pseudoInput, setPseudoInput] = useState(displayName || "");
  const [pseudoSaving, setPseudoSaving] = useState(false);
  const [pseudoMsg, setPseudoMsg] = useState(null);

  const savePseudo = async () => {
    const trimmed = pseudoInput.trim();
    if (!trimmed) {
      setPseudoMsg({ type: "error", text: "Le pseudo ne peut pas être vide" });
      return;
    }
    setPseudoSaving(true);
    setPseudoMsg(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("public_profiles")
        .update({ display_name: trimmed, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (error) {
        setPseudoMsg({ type: "error", text: "Erreur lors de l'enregistrement" });
        return;
      }
      setPseudoMsg({ type: "success", text: "Pseudo mis à jour" });
    } catch {
      setPseudoMsg({ type: "error", text: "Erreur réseau, réessaie" });
    } finally {
      setPseudoSaving(false);
    }
  };

  // Clubs (mini-championnats entre amis, voir supabase/015_clubs.sql) :
  // créer/rejoindre passent par des fonctions SQL security definer
  // (create_club/join_club) plutôt que des inserts directs, car rejoindre un
  // club nécessite de connaître son code d'invitation — le seul chemin
  // d'accès prévu, pas une simple policy RLS sur user_id. myClubs et
  // clubLeaderboard viennent du Server Component (app/page.js, déjà filtrés
  // sur l'utilisateur connecté) ; router.refresh() les recharge après chaque
  // action plutôt que de dupliquer leur logique côté client.
  const [clubNameInput, setClubNameInput] = useState("");
  const [clubCodeInput, setClubCodeInput] = useState("");
  const [clubBusy, setClubBusy] = useState(false);
  const [clubMsg, setClubMsg] = useState(null);
  const [expandedClubId, setExpandedClubId] = useState(null);

  const createClub = async () => {
    const trimmed = clubNameInput.trim();
    if (!trimmed) {
      setClubMsg({ type: "error", text: "Nom de club invalide" });
      return;
    }
    setClubBusy(true);
    setClubMsg(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("create_club", { p_name: trimmed });
      if (error) {
        setClubMsg({ type: "error", text: error.message || "Erreur lors de la création" });
        return;
      }
      setClubNameInput("");
      setClubMsg({ type: "success", text: "Club créé !" });
      router.refresh();
    } catch {
      setClubMsg({ type: "error", text: "Erreur réseau, réessaie" });
    } finally {
      setClubBusy(false);
    }
  };

  const joinClub = async () => {
    const trimmed = clubCodeInput.trim();
    if (!trimmed) {
      setClubMsg({ type: "error", text: "Code d'invitation invalide" });
      return;
    }
    setClubBusy(true);
    setClubMsg(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("join_club", { p_invite_code: trimmed });
      if (error) {
        setClubMsg({ type: "error", text: "Code d'invitation invalide ou erreur réseau" });
        return;
      }
      setClubCodeInput("");
      setClubMsg({ type: "success", text: "Club rejoint !" });
      router.refresh();
    } catch {
      setClubMsg({ type: "error", text: "Erreur réseau, réessaie" });
    } finally {
      setClubBusy(false);
    }
  };

  const leaveClub = async (clubId) => {
    setClubBusy(true);
    setClubMsg(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("club_members").delete().eq("club_id", clubId).eq("user_id", userId);
      if (error) {
        setClubMsg({ type: "error", text: "Erreur lors du départ du club" });
        return;
      }
      router.refresh();
    } catch {
      setClubMsg({ type: "error", text: "Erreur réseau, réessaie" });
    } finally {
      setClubBusy(false);
    }
  };

  const copyInviteCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      setClubMsg({ type: "success", text: `Code ${code} copié` });
    } catch {
      setClubMsg({ type: "error", text: `Copie impossible — code : ${code}` });
    }
  };

  // Remet le montant saisi à zéro quand on change de startup sélectionnée,
  // pour éviter d'investir accidentellement le même montant ailleurs.
  useEffect(() => {
    setAmountKc("");
    setTradeError(null);
  }, [selected?.id]);

  const filtered = useMemo(() => {
    const base = tab === "marche" ? startups : startups.filter((s) => positions[s.id]);
    if (!query.trim()) return base;
    const q = query.toLowerCase();
    return base.filter((s) => s.name.toLowerCase().includes(q) || s.sector.toLowerCase().includes(q));
  }, [tab, startups, positions, query]);

  const portfolioValue = useMemo(() => {
    return Object.entries(positions).reduce((sum, [id, pos]) => {
      const s = startups.find((s) => s.id === Number(id));
      return sum + (s ? kcValueOfEquity(pos.equityPct, s.currentPostMoneyEur) : 0);
    }, 0);
  }, [positions, startups]);

  const totalWealth = cash === null ? 0 : cash + portfolioValue;
  const animatedWealth = useCountUp(totalWealth);
  const pnl = cash === null ? 0 : totalWealth - STARTING_CASH;

  const selectedPosition = selected ? positions[selected.id] : null;
  const selectedValuation = selected?.currentPostMoneyEur ?? null;
  const selectedInvestable = selectedValuation ? maxInvestableKc(selectedPosition?.equityPct ?? 0, selectedValuation) : 0;
  const selectedIsActive = !selected || (selected.lifecycle_status ?? "active") === "active";

  // Aperçu en direct (avant confirmation) du % de capital que le montant
  // saisi permettrait d'acheter — même formule que côté serveur
  // (app/api/invest/route.js), affichée ici uniquement à titre indicatif.
  const previewEquityPct =
    selected && selectedValuation && Number(amountKc) > 0 ? equityPctForInvestment(Number(amountKc), selectedValuation) : 0;

  // Investir/céder un montant en K¢, persisté en base via /api/invest (le %
  // de capital et le plafond sont recalculés et validés côté serveur — voir
  // app/api/invest/route.js). En cas d'erreur (capital insuffisant, plafond
  // de 20% atteint, rien à vendre, etc.), rien n'est modifié localement et le
  // message renvoyé par l'API est affiché.
  const invest = async (action) => {
    const amount = Number(amountKc);
    if (!Number.isFinite(amount) || amount <= 0) {
      setTradeError("Montant invalide");
      return;
    }
    setTradeError(null);
    setPendingId(selected.id);
    try {
      const res = await fetch("/api/invest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startupId: selected.id, action, amountKc: amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTradeError(data.error || "Erreur lors de la transaction");
        return;
      }
      setCash(data.cash);
      setPositions((p) => {
        const next = { ...p };
        if (data.equityPct > 1e-9) next[selected.id] = { equityPct: data.equityPct, investedKc: data.investedKc };
        else delete next[selected.id];
        return next;
      });
      setAmountKc("");
    } catch {
      setTradeError("Erreur réseau, réessaie");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div style={{ minHeight: "100vh" }}>
      <div
        style={{
          borderBottom: "1px solid #1C212B",
          padding: "18px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "rgba(11,14,20,0.92)",
          backdropFilter: "blur(8px)",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "linear-gradient(135deg, #FFB800, #FF6B35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span className="kairo-display" style={{ fontWeight: 700, fontSize: 15, color: "#0B0E14" }}>
              K
            </span>
          </div>
          <span className="kairo-display" style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em" }}>
            Kairo
          </span>
          <span
            style={{
              fontSize: 10,
              background: "#1C212B",
              color: "#8A93A6",
              padding: "3px 8px",
              borderRadius: 20,
              marginLeft: 4,
              letterSpacing: "0.03em",
            }}
          >
            SIMULATION · AUCUN ARGENT RÉEL
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "#8A93A6",
              fontSize: 13,
              background: "#151922",
              border: "1px solid #232833",
              borderRadius: 10,
              padding: "7px 12px",
            }}
          >
            <Search size={14} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher une startup"
              style={{
                background: "transparent",
                border: "none",
                outline: "none",
                color: "#EDEEF2",
                fontSize: 13,
                width: 150,
              }}
            />
          </div>
          {isLoggedIn && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "#151922",
                border: "1px solid #232833",
                borderRadius: 10,
                padding: "7px 12px",
              }}
            >
              <Wallet size={14} color="#FFB800" />
              <span className="kairo-mono" style={{ fontSize: 13, fontWeight: 600 }}>
                {cash.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} K¢
              </span>
            </div>
          )}
          <AuthBox userEmail={userEmail} />
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "28px" }}>
        <div
          style={{
            background: "linear-gradient(135deg, #12151D 0%, #171B25 100%)",
            border: "1px solid #1C212B",
            borderRadius: 18,
            padding: "26px 30px",
            marginBottom: 26,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            flexWrap: "wrap",
            gap: 20,
          }}
        >
          {isLoggedIn ? (
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: "#8A93A6",
                  marginBottom: 8,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                Valeur totale du portefeuille
              </div>
              <div className="kairo-display" style={{ fontSize: 42, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1 }}>
                {animatedWealth.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}{" "}
                <span style={{ fontSize: 22, color: "#8A93A6" }}>K¢</span>
              </div>
              <div
                style={{
                  marginTop: 10,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  color: pnl >= 0 ? "#3DDC84" : "#FF5C5C",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                {pnl >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
                {pnl >= 0 ? "+" : ""}
                {pnl.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} K¢ depuis le début
              </div>
            </div>
          ) : (
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: "#8A93A6",
                  marginBottom: 8,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                Portefeuille fictif
              </div>
              <div className="kairo-display" style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>
                Connecte-toi pour investir
              </div>
              <div style={{ marginTop: 8, fontSize: 13, color: "#8A93A6", maxWidth: 380 }}>
                Crée un compte gratuit (email + lien magique, en haut à droite) pour recevoir 10&nbsp;000 K¢ fictifs et
                prendre des participations dans de vraies startups, aux vraies valorisations de leurs derniers tours.
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 28 }}>
            <div>
              <div style={{ fontSize: 11, color: "#8A93A6", marginBottom: 4 }}>STARTUPS EN PORTEFEUILLE</div>
              <div className="kairo-display" style={{ fontSize: 22, fontWeight: 600 }}>
                {Object.keys(positions).length}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #1C212B" }}>
          {[
            { k: "marche", l: "Marché" },
            { k: "portefeuille", l: "Mon portefeuille" },
            { k: "classement", l: "Classement" },
            { k: "clubs", l: "Clubs" },
          ].map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              style={{
                background: "none",
                border: "none",
                padding: "10px 6px",
                marginRight: 20,
                color: tab === t.k ? "#EDEEF2" : "#5C6373",
                fontWeight: 600,
                fontSize: 14,
                borderBottom: tab === t.k ? "2px solid #FFB800" : "2px solid transparent",
              }}
            >
              {t.l}
            </button>
          ))}
        </div>

        {tab === "classement" ? (
          <div style={{ maxWidth: 640 }}>
            {isLoggedIn && (
              <div
                style={{
                  background: "#101319",
                  border: "1px solid #181C25",
                  borderRadius: 14,
                  padding: 18,
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "#5C6373",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    marginBottom: 10,
                  }}
                >
                  Ton pseudo public (visible dans le classement)
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={pseudoInput}
                    onChange={(e) => {
                      setPseudoInput(e.target.value);
                      setPseudoMsg(null);
                    }}
                    maxLength={40}
                    placeholder="Ton pseudo"
                    style={{
                      flex: 1,
                      background: "#151922",
                      border: "1px solid #232833",
                      borderRadius: 10,
                      padding: "10px 12px",
                      color: "#EDEEF2",
                      fontSize: 14,
                      boxSizing: "border-box",
                    }}
                  />
                  <button
                    onClick={savePseudo}
                    disabled={pseudoSaving}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 10,
                      border: "none",
                      background: "#FFB800",
                      color: "#0B0E14",
                      fontWeight: 700,
                      fontSize: 13.5,
                      opacity: pseudoSaving ? 0.6 : 1,
                    }}
                  >
                    {pseudoSaving ? "…" : "Enregistrer"}
                  </button>
                </div>
                {pseudoMsg && (
                  <div
                    style={{
                      marginTop: 10,
                      fontSize: 12.5,
                      color: pseudoMsg.type === "error" ? "#FF8A8A" : "#3DDC84",
                    }}
                  >
                    {pseudoMsg.text}
                  </div>
                )}
              </div>
            )}

            <div style={{ background: "#101319", border: "1px solid #181C25", borderRadius: 14, overflow: "hidden" }}>
              {(leaderboard ?? []).length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "#5C6373" }}>
                  Personne au classement pour l&apos;instant.
                </div>
              ) : (
                leaderboard.map((row, i) => {
                  const isMe = isLoggedIn && row.display_name === pseudoInput;
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: "12px 18px",
                        borderBottom: i < leaderboard.length - 1 ? "1px solid #181C25" : "none",
                        background: isMe ? "#1C1710" : "transparent",
                      }}
                    >
                      <div
                        className="kairo-mono"
                        style={{ width: 28, textAlign: "right", color: "#5C6373", fontSize: 13, fontWeight: 600 }}
                      >
                        {i + 1}
                      </div>
                      <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: isMe ? "#FFB800" : "#EDEEF2" }}>
                        {row.display_name}
                      </div>
                      <div className="kairo-mono" style={{ fontSize: 14, fontWeight: 600 }}>
                        {Number(row.total_value_kc).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} K¢
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : tab === "clubs" ? (
          <div style={{ maxWidth: 640 }}>
            {!isLoggedIn ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#5C6373" }}>
                Connecte-toi pour créer ou rejoindre un club.
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
                  <div
                    style={{
                      flex: "1 1 260px",
                      background: "#101319",
                      border: "1px solid #181C25",
                      borderRadius: 14,
                      padding: 18,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: "#5C6373",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        marginBottom: 10,
                      }}
                    >
                      Créer un club
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        value={clubNameInput}
                        onChange={(e) => {
                          setClubNameInput(e.target.value);
                          setClubMsg(null);
                        }}
                        maxLength={40}
                        placeholder="Nom du club"
                        style={{
                          flex: 1,
                          background: "#151922",
                          border: "1px solid #232833",
                          borderRadius: 10,
                          padding: "10px 12px",
                          color: "#EDEEF2",
                          fontSize: 14,
                          boxSizing: "border-box",
                          minWidth: 0,
                        }}
                      />
                      <button
                        onClick={createClub}
                        disabled={clubBusy}
                        style={{
                          padding: "10px 16px",
                          borderRadius: 10,
                          border: "none",
                          background: "#FFB800",
                          color: "#0B0E14",
                          fontWeight: 700,
                          fontSize: 13.5,
                          opacity: clubBusy ? 0.6 : 1,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Créer
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      flex: "1 1 260px",
                      background: "#101319",
                      border: "1px solid #181C25",
                      borderRadius: 14,
                      padding: 18,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: "#5C6373",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        marginBottom: 10,
                      }}
                    >
                      Rejoindre avec un code
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        value={clubCodeInput}
                        onChange={(e) => {
                          setClubCodeInput(e.target.value);
                          setClubMsg(null);
                        }}
                        maxLength={8}
                        placeholder="Code (ex: A1B2C3D4)"
                        style={{
                          flex: 1,
                          background: "#151922",
                          border: "1px solid #232833",
                          borderRadius: 10,
                          padding: "10px 12px",
                          color: "#EDEEF2",
                          fontSize: 14,
                          boxSizing: "border-box",
                          minWidth: 0,
                          textTransform: "uppercase",
                        }}
                      />
                      <button
                        onClick={joinClub}
                        disabled={clubBusy}
                        style={{
                          padding: "10px 16px",
                          borderRadius: 10,
                          border: "1px solid #232833",
                          background: "#151922",
                          color: "#EDEEF2",
                          fontWeight: 700,
                          fontSize: 13.5,
                          opacity: clubBusy ? 0.6 : 1,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Rejoindre
                      </button>
                    </div>
                  </div>
                </div>

                {clubMsg && (
                  <div
                    style={{
                      marginBottom: 16,
                      fontSize: 12.5,
                      color: clubMsg.type === "error" ? "#FF8A8A" : "#3DDC84",
                    }}
                  >
                    {clubMsg.text}
                  </div>
                )}

                {(myClubs ?? []).length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: "#5C6373" }}>
                    Aucun club pour l&apos;instant. Crées-en un, ou rejoins celui d&apos;un ami avec son code
                    d&apos;invitation.
                  </div>
                ) : (
                  myClubs.map((club) => {
                    const rows = (clubLeaderboard ?? []).filter((r) => r.club_id === club.id);
                    const isExpanded = expandedClubId === club.id;
                    return (
                      <div
                        key={club.id}
                        style={{
                          background: "#101319",
                          border: "1px solid #181C25",
                          borderRadius: 14,
                          padding: 18,
                          marginBottom: 14,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            cursor: "pointer",
                          }}
                          onClick={() => setExpandedClubId(isExpanded ? null : club.id)}
                        >
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 15 }}>{club.name}</div>
                            <div style={{ fontSize: 12, color: "#5C6373", marginTop: 2 }}>
                              {club.member_count} membre{club.member_count > 1 ? "s" : ""}
                              {club.owner_id === userId ? " · toi = créateur" : ""}
                            </div>
                          </div>
                          <div style={{ fontSize: 12, color: "#8A93A6" }}>{isExpanded ? "▲" : "▼"}</div>
                        </div>

                        {isExpanded && (
                          <div style={{ marginTop: 16, borderTop: "1px solid #1C212B", paddingTop: 16 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 10,
                                marginBottom: 14,
                                flexWrap: "wrap",
                              }}
                            >
                              <div style={{ fontSize: 12, color: "#5C6373" }}>
                                Code d&apos;invitation :{" "}
                                <span className="kairo-mono" style={{ color: "#FFB800", fontWeight: 700 }}>
                                  {club.invite_code}
                                </span>
                              </div>
                              <div style={{ display: "flex", gap: 8 }}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyInviteCode(club.invite_code);
                                  }}
                                  style={{
                                    padding: "6px 12px",
                                    borderRadius: 8,
                                    border: "1px solid #232833",
                                    background: "#151922",
                                    color: "#EDEEF2",
                                    fontSize: 12,
                                    fontWeight: 600,
                                  }}
                                >
                                  Copier le code
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    leaveClub(club.id);
                                  }}
                                  disabled={clubBusy}
                                  style={{
                                    padding: "6px 12px",
                                    borderRadius: 8,
                                    border: "1px solid #4A2226",
                                    background: "#2A1416",
                                    color: "#FF8A8A",
                                    fontSize: 12,
                                    fontWeight: 600,
                                    opacity: clubBusy ? 0.6 : 1,
                                  }}
                                >
                                  Quitter
                                </button>
                              </div>
                            </div>

                            {rows.length === 0 ? (
                              <div style={{ fontSize: 12.5, color: "#5C6373" }}>Aucun classement pour l&apos;instant.</div>
                            ) : (
                              rows.map((row, i) => {
                                const isMe = row.display_name === pseudoInput;
                                return (
                                  <div
                                    key={i}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 14,
                                      padding: "10px 4px",
                                      borderBottom: i < rows.length - 1 ? "1px solid #181C25" : "none",
                                    }}
                                  >
                                    <div
                                      className="kairo-mono"
                                      style={{ width: 22, textAlign: "right", color: "#5C6373", fontSize: 12.5, fontWeight: 600 }}
                                    >
                                      {i + 1}
                                    </div>
                                    <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: isMe ? "#FFB800" : "#EDEEF2" }}>
                                      {row.display_name}
                                    </div>
                                    <div className="kairo-mono" style={{ fontSize: 13.5, fontWeight: 600 }}>
                                      {Number(row.total_value_kc).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} K¢
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </>
            )}
          </div>
        ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24 }}>
          <div>
            {filtered.map((s) => {
              const momentum = computeMomentumScore({
                funding: s.signal_funding,
                trends: s.signal_trends,
                press: s.signal_press,
                github: s.signal_github,
              });
              const held = positions[s.id];
              return (
                <div
                  key={s.id}
                  onClick={() => setSelected(s)}
                  className="card-hover"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    background: selected?.id === s.id ? "#151922" : "#101319",
                    border: selected?.id === s.id ? "1px solid #2A2F3A" : "1px solid #181C25",
                    borderRadius: 14,
                    padding: "14px 16px",
                    marginBottom: 10,
                    opacity: s.lifecycle_status && s.lifecycle_status !== "active" ? 0.7 : 1,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 14.5 }}>{s.name}</span>
                      {momentum >= 70 && <Flame size={13} color="#FF6B35" />}
                      <LifecycleBadge status={s.lifecycle_status} />
                    </div>
                    <div style={{ fontSize: 12.5, color: "#5C6373", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                      {s.sector}
                      <StageBadge stage={s.stage} />
                    </div>
                  </div>
                  <div style={{ textAlign: "right", minWidth: 90 }}>
                    <div className="kairo-mono" style={{ fontWeight: 600, fontSize: 15 }}>
                      {formatKc(s.currentPostMoneyEur)}
                    </div>
                    {s.currentPostMoneyEur !== null && (
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 2 }}>
                        <ValuationChange pct={s.dailyChangePct} />
                      </div>
                    )}
                    {held && (
                      <div className="kairo-mono" style={{ fontSize: 12, color: "#FFB800" }}>
                        {formatPct(held.equityPct)} détenu
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {tab === "portefeuille" && Object.keys(positions).length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#5C6373" }}>
                Aucune participation pour l&apos;instant. Investis dans tes premières startups depuis l&apos;onglet Marché.
              </div>
            )}
            {filtered.length === 0 && tab === "marche" && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#5C6373" }}>
                Aucun résultat pour &quot;{query}&quot;.
              </div>
            )}
          </div>

          {selected && (
            <div
              style={{
                background: "#101319",
                border: "1px solid #181C25",
                borderRadius: 16,
                padding: 22,
                height: "fit-content",
                position: "sticky",
                top: 90,
              }}
            >
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
                  {selected.name}
                  <LifecycleBadge status={selected.lifecycle_status} />
                </div>
                <div style={{ fontSize: 12.5, color: "#5C6373", display: "flex", alignItems: "center", gap: 6 }}>
                  {selected.sector}
                  <StageBadge stage={selected.stage} />
                </div>
              </div>

              <div style={{ fontSize: 13, color: "#B0B6C4", lineHeight: 1.5, marginBottom: 18 }}>{selected.blurb}</div>

              <div
                style={{
                  fontSize: 11.5,
                  color: "#5C6373",
                  fontStyle: "italic",
                  lineHeight: 1.4,
                  marginBottom: 14,
                  paddingBottom: 14,
                  borderBottom: "1px solid #1C212B",
                }}
              >
                Estimation basée sur données publiques, à but ludique.
              </div>

              <div
                style={{
                  background: "#0B0E14",
                  border: "1px solid #1C212B",
                  borderRadius: 12,
                  padding: "14px 16px",
                  marginBottom: 18,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: selectedPosition ? 10 : 0 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#5C6373", marginBottom: 3 }}>VALORISATION (dernier tour)</div>
                    <div className="kairo-mono" style={{ fontSize: 17, fontWeight: 700 }}>
                      {formatKc(selectedValuation)}
                    </div>
                    {selectedValuation !== null && (
                      <div style={{ marginTop: 3 }}>
                        <ValuationChange pct={selected.dailyChangePct} size={12.5} />
                      </div>
                    )}
                  </div>
                  {selected.lastRoundDate && (
                    <div style={{ textAlign: "right", fontSize: 11.5, color: "#5C6373" }}>
                      {new Date(selected.lastRoundDate).toLocaleDateString("fr-FR", { year: "numeric", month: "short" })}
                    </div>
                  )}
                </div>
                {selectedPosition && (
                  <div style={{ borderTop: "1px solid #1C212B", paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#5C6373", marginBottom: 3 }}>TA PARTICIPATION</div>
                      <div className="kairo-mono" style={{ fontSize: 14, fontWeight: 600, color: "#FFB800" }}>
                        {formatPct(selectedPosition.equityPct)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "#5C6373", marginBottom: 3 }}>VALEUR ACTUELLE</div>
                      <div className="kairo-mono" style={{ fontSize: 14, fontWeight: 600 }}>
                        {kcValueOfEquity(selectedPosition.equityPct, selectedValuation).toLocaleString("fr-FR", {
                          maximumFractionDigits: 0,
                        })}{" "}
                        K¢
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {!selectedIsActive ? (
                <div style={{ fontSize: 13, color: "#8A93A6", padding: "10px 0" }}>
                  {selected.lifecycle_status === "exited"
                    ? "Cette startup a été rachetée : les détenteurs ont déjà été payés, plus investissable."
                    : "Cette startup a cessé son activité : plus investissable."}
                </div>
              ) : !selectedValuation ? (
                <div style={{ fontSize: 13, color: "#8A93A6", padding: "10px 0" }}>
                  Aucun tour de financement sourcé pour l&apos;instant — pas encore investissable.
                </div>
              ) : (
                <>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#5C6373",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      marginBottom: 8,
                    }}
                  >
                    Investir / céder (K¢)
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={amountKc}
                    onChange={(e) => setAmountKc(e.target.value)}
                    placeholder="Montant en K¢"
                    style={{
                      width: "100%",
                      background: "#151922",
                      border: "1px solid #232833",
                      borderRadius: 10,
                      padding: "10px 12px",
                      color: "#EDEEF2",
                      fontSize: 14,
                      marginBottom: 8,
                      boxSizing: "border-box",
                    }}
                  />
                  <div
                    className="kairo-mono"
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: previewEquityPct > 0 ? "#FFB800" : "#5C6373",
                      marginBottom: 10,
                    }}
                  >
                    Part cédée : {previewEquityPct > 0 ? formatPct(previewEquityPct) : "—"}
                  </div>
                  <div style={{ fontSize: 11.5, color: "#5C6373", marginBottom: 14 }}>
                    Plafond {Math.round(MAX_STAKE_PCT_PER_STARTUP * 100)}% du capital — encore{" "}
                    {Math.max(0, Math.floor(selectedInvestable)).toLocaleString("fr-FR")} K¢ investissables ici.
                  </div>

                  {tradeError && (
                    <div
                      style={{
                        background: "#2A1416",
                        border: "1px solid #4A2226",
                        color: "#FF8A8A",
                        fontSize: 12.5,
                        borderRadius: 10,
                        padding: "9px 12px",
                        marginBottom: 12,
                      }}
                    >
                      {tradeError}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => invest("buy")}
                      disabled={!isLoggedIn || pendingId === selected.id}
                      style={{
                        flex: 1,
                        padding: "12px",
                        borderRadius: 10,
                        border: "none",
                        background: "#FFB800",
                        color: "#0B0E14",
                        fontWeight: 700,
                        fontSize: 13.5,
                        opacity: !isLoggedIn || pendingId === selected.id ? 0.6 : 1,
                      }}
                    >
                      {pendingId === selected.id ? "…" : isLoggedIn ? "Investir" : "Connecte-toi"}
                    </button>
                    {selectedPosition && (
                      <button
                        onClick={() => invest("sell")}
                        disabled={pendingId === selected.id}
                        style={{
                          flex: 1,
                          padding: "12px",
                          borderRadius: 10,
                          border: "1px solid #232833",
                          background: "#151922",
                          color: "#EDEEF2",
                          fontWeight: 700,
                          fontSize: 13.5,
                          opacity: pendingId === selected.id ? 0.6 : 1,
                        }}
                      >
                        Céder
                      </button>
                    )}
                  </div>
                </>
              )}

              <div
                style={{
                  fontSize: 11,
                  color: "#5C6373",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  margin: "20px 0 10px",
                }}
              >
                Signaux momentum (informatif — n&apos;influence pas la valorisation)
              </div>
              {[
                { l: "Levées / funding", v: selected.signal_funding },
                { l: "Tendance de recherche", v: selected.signal_trends },
                { l: "Mentions presse", v: selected.signal_press },
                ...(selected.signal_github !== null && selected.signal_github !== undefined
                  ? [{ l: "Activité GitHub", v: selected.signal_github, icon: true }]
                  : []),
              ].map((row, i) => (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12.5, marginBottom: 4 }}>
                    <span style={{ color: "#8A93A6", display: "flex", alignItems: "center", gap: 5 }}>
                      {row.icon && <Github size={11} />} {row.l}
                    </span>
                  </div>
                  <div style={{ height: 5, background: "#1C212B", borderRadius: 3, overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${row.v}%`,
                        height: "100%",
                        background: "linear-gradient(90deg, #FFB800, #FF6B35)",
                        borderRadius: 3,
                      }}
                    />
                  </div>
                </div>
              ))}

              {selected.github_org && (
                <a
                  href={`https://github.com/${selected.github_org}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: "#5C6373",
                    marginTop: 4,
                  }}
                >
                  <Github size={12} /> github.com/{selected.github_org}
                </a>
              )}
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
