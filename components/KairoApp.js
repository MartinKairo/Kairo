"use client";

import { useState, useMemo, useEffect, useRef } from "react";

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
const Flame = (p) => (
  <Icon
    {...p}
    path={
      <path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z" />
    }
  />
);
const Plus = (p) => (
  <Icon
    {...p}
    path={
      <>
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </>
    }
  />
);
const Minus = (p) => <Icon {...p} path={<line x1="5" y1="12" x2="19" y2="12" />} />;
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

const STARTING_CASH = 10000;
const SHARE_PRICE_MULTIPLIER = 10;

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

function StartupLogo({ startup, size = 40 }) {
  const [failed, setFailed] = useState(false);
  const initials = startup.name.slice(0, 2).toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size > 30 ? 10 : 8,
        background: "#FFB80022",
        border: "1px solid #FFB80055",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {!failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://logo.clearbit.com/${startup.website_domain}`}
          alt={startup.name}
          width={size}
          height={size}
          onError={() => setFailed(true)}
          style={{ objectFit: "cover" }}
        />
      ) : (
        <span className="kairo-display" style={{ color: "#FFB800", fontWeight: 700, fontSize: size > 30 ? 14 : 12 }}>
          {initials}
        </span>
      )}
    </div>
  );
}

export default function KairoApp({ startups }) {
  const [holdings, setHoldings] = useState({});
  const [selected, setSelected] = useState(startups[0]);
  const [tab, setTab] = useState("marche");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const base = tab === "marche" ? startups : startups.filter((s) => holdings[s.id]);
    if (!query.trim()) return base;
    const q = query.toLowerCase();
    return base.filter((s) => s.name.toLowerCase().includes(q) || s.sector.toLowerCase().includes(q));
  }, [tab, startups, holdings, query]);

  const portfolioValue = useMemo(() => {
    return Object.entries(holdings).reduce((sum, [id, shares]) => {
      const s = startups.find((s) => s.id === Number(id));
      return sum + (s ? s.score * SHARE_PRICE_MULTIPLIER * shares : 0);
    }, 0);
  }, [holdings, startups]);

  const cash = STARTING_CASH - portfolioValue;
  const totalWealth = cash + portfolioValue;
  const animatedWealth = useCountUp(totalWealth);
  const pnl = totalWealth - STARTING_CASH;

  const buy = (id) => {
    const s = startups.find((s) => s.id === id);
    if (cash < s.score * SHARE_PRICE_MULTIPLIER) return;
    setHoldings((h) => ({ ...h, [id]: (h[id] || 0) + 1 }));
  };
  const sell = (id) => {
    setHoldings((h) => {
      const next = { ...h };
      if (!next[id]) return h;
      next[id] -= 1;
      if (next[id] <= 0) delete next[id];
      return next;
    });
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
          <div style={{ display: "flex", gap: 28 }}>
            <div>
              <div style={{ fontSize: 11, color: "#8A93A6", marginBottom: 4 }}>STARTUPS SUIVIES</div>
              <div className="kairo-display" style={{ fontSize: 22, fontWeight: 600 }}>
                {Object.keys(holdings).length}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #1C212B" }}>
          {[
            { k: "marche", l: "Marché" },
            { k: "portefeuille", l: "Mon portefeuille" },
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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24 }}>
          <div>
            {filtered.map((s) => (
              <div
                key={s.id}
                onClick={() => setSelected(s)}
                className="card-hover"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  background: selected.id === s.id ? "#151922" : "#101319",
                  border: selected.id === s.id ? "1px solid #2A2F3A" : "1px solid #181C25",
                  borderRadius: 14,
                  padding: "14px 16px",
                  marginBottom: 10,
                }}
              >
                <StartupLogo startup={s} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 14.5 }}>{s.name}</span>
                    {s.delta > 4 && <Flame size={13} color="#FF6B35" />}
                  </div>
                  <div style={{ fontSize: 12.5, color: "#5C6373", marginTop: 2 }}>{s.sector}</div>
                </div>
                <div style={{ textAlign: "right", minWidth: 70 }}>
                  <div className="kairo-mono" style={{ fontWeight: 600, fontSize: 15 }}>
                    {s.score}
                  </div>
                  <div
                    className="kairo-mono"
                    style={{
                      fontSize: 12,
                      color: s.delta >= 0 ? "#3DDC84" : "#FF5C5C",
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                      justifyContent: "flex-end",
                    }}
                  >
                    {s.delta >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {s.delta >= 0 ? "+" : ""}
                    {s.delta}%
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => sell(s.id)}
                    disabled={!holdings[s.id]}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      border: "1px solid #232833",
                      background: "#151922",
                      color: holdings[s.id] ? "#EDEEF2" : "#3A3F4A",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Minus size={13} />
                  </button>
                  <span className="kairo-mono" style={{ minWidth: 18, textAlign: "center", fontSize: 13, alignSelf: "center" }}>
                    {holdings[s.id] || 0}
                  </span>
                  <button
                    onClick={() => buy(s.id)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      border: "none",
                      background: "#FFB800",
                      color: "#0B0E14",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>
            ))}
            {tab === "portefeuille" && Object.keys(holdings).length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#5C6373" }}>
                Aucune startup en portefeuille pour l&apos;instant. Achète tes premières parts depuis l&apos;onglet Marché.
              </div>
            )}
            {filtered.length === 0 && tab === "marche" && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#5C6373" }}>
                Aucun résultat pour &quot;{query}&quot;.
              </div>
            )}
          </div>

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
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <StartupLogo startup={selected} size={44} />
              <div>
                <div className="kairo-display" style={{ fontWeight: 700, fontSize: 16 }}>
                  {selected.name}
                </div>
                <div style={{ fontSize: 12.5, color: "#5C6373" }}>{selected.sector}</div>
              </div>
            </div>

            <div style={{ fontSize: 13, color: "#B0B6C4", lineHeight: 1.5, marginBottom: 20 }}>{selected.blurb}</div>

            <div
              style={{
                fontSize: 11,
                color: "#5C6373",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: 10,
              }}
            >
              Composition du score
            </div>
            {[
              { l: "Levées / funding (40%)", v: selected.signal_funding },
              { l: "Tendance de recherche (20%)", v: selected.signal_trends },
              { l: "Mentions presse (20%)", v: selected.signal_press },
              ...(selected.signal_github !== null && selected.signal_github !== undefined
                ? [{ l: "Activité GitHub (bonus, +20 pts max)", v: selected.signal_github, icon: true }]
                : []),
            ].map((row, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                  <span style={{ color: "#8A93A6", display: "flex", alignItems: "center", gap: 5 }}>
                    {row.icon && <Github size={11} />} {row.l}
                  </span>
                  <span className="kairo-mono" style={{ color: "#EDEEF2" }}>
                    {row.v}
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
                  marginBottom: 16,
                }}
              >
                <Github size={12} /> github.com/{selected.github_org}
              </a>
            )}

            <button
              onClick={() => buy(selected.id)}
              style={{
                width: "100%",
                marginTop: 4,
                padding: "12px",
                borderRadius: 10,
                border: "none",
                background: "#FFB800",
                color: "#0B0E14",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              Acheter 1 part — {(selected.score * SHARE_PRICE_MULTIPLIER).toLocaleString("fr-FR")} K¢
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
