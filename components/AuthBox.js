"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Connexion sans mot de passe : un lien magique envoyé par email (Supabase
// Auth). Choisi plutôt qu'un vrai formulaire email+mot de passe car c'est
// plus simple à la fois à coder et à utiliser, et suffisant pour un
// simulateur avec de l'argent fictif (voir discussion sur le "mode compte
// simple").

export default function AuthBox({ userEmail }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState(null);

  const sendMagicLink = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("sending");
    setErrorMsg(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
      return;
    }
    setStatus("sent");
  };

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.reload();
  };

  if (userEmail) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 12.5, color: "#8A93A6" }}>{userEmail}</span>
        <button
          onClick={signOut}
          style={{
            background: "#151922",
            border: "1px solid #232833",
            color: "#EDEEF2",
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 12.5,
          }}
        >
          Se déconnecter
        </button>
      </div>
    );
  }

  if (status === "sent") {
    return <div style={{ fontSize: 12.5, color: "#3DDC84" }}>Vérifie tes emails pour te connecter ✉️</div>;
  }

  return (
    <form onSubmit={sendMagicLink} style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="ton@email.com"
        style={{
          background: "#151922",
          border: "1px solid #232833",
          borderRadius: 8,
          padding: "7px 10px",
          fontSize: 13,
          color: "#EDEEF2",
          outline: "none",
          width: 160,
        }}
      />
      <button
        type="submit"
        disabled={status === "sending"}
        style={{
          background: "#FFB800",
          border: "none",
          color: "#0B0E14",
          borderRadius: 8,
          padding: "7px 12px",
          fontSize: 12.5,
          fontWeight: 700,
          opacity: status === "sending" ? 0.6 : 1,
        }}
      >
        {status === "sending" ? "…" : "Se connecter"}
      </button>
      {errorMsg && <span style={{ fontSize: 12, color: "#FF8A8A" }}>{errorMsg}</span>}
    </form>
  );
}
