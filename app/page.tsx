"use client";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import "./bh.css";
import { Produce, ProduceDefs } from "@/components/Produce";
import { peso, useAppState } from "@/lib/useAppState";
import type { CropKey } from "@/lib/listing";
import type { AppState } from "@/lib/types";

// BAYANIHAI buyer app (PWA), built from the team's prototype design and wired to the real system:
// prices, kilos and escrow status all come from /api/state (the smart contract on BNB Smart Chain).
// The center "+" lets the farmer post a harvest with an AI fair price.

type Screen = "splash" | "home" | "detail" | "track" | "deals" | "profile";
const PICKUP = "Brgy. Holy Spirit";
const CROP_ORDER: CropKey[] = ["carrots", "cabbage", "tomatoes", "potatoes"];
const HARVEST_KG = [150, 200, 300];

const st = (i: number) => ({ "--i": i }) as CSSProperties;

function Icon({ d, children }: { d?: string; children?: ReactNode }) {
  return (
    <svg className="bh-ic" viewBox="0 0 24 24" aria-hidden>
      {d ? <path d={d} /> : children}
    </svg>
  );
}

/** Animated number that eases from its previous value to the new one. */
function Count({ to }: { to: number }) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 1100);
      const e = p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setV(Math.round(start + (to - start) * e));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{v.toLocaleString("en-PH")}</>;
}

/** Where the buyer's group stands, from real state. */
function progressOf(s: AppState) {
  const group = s.groups.find((g) => g.pickup === PICKUP);
  if (s.deal?.chain) {
    const { fundedKg, targetKg } = s.deal.chain;
    return { value: fundedKg, target: targetKg, label: "kilo ang bayad na", buyers: s.deal.buyerCount };
  }
  return { value: group?.totalKg ?? 0, target: s.listing.minKg, label: "kilo ang sumali", buyers: group?.buyerCount ?? 0 };
}

function stockBadge(left: number, target: number) {
  const r = target > 0 ? left / target : 0;
  if (left <= 0) return { text: "Buo na!", bg: "#DDF2E4", fg: "#0E6631", line: "#1F9D52" };
  if (r <= 0.1) return { text: "Konti na lang", bg: "#FCE3D8", fg: "#B2380F", line: "#E24B1A" };
  if (r <= 0.5) return { text: "Sapat pa", bg: "#FBF0CF", fg: "#7A5A0C", line: "#D9A21B" };
  return { text: "Maraming slot", bg: "#DDF2E4", fg: "#0E6631", line: "#1F9D52" };
}

export default function BuyerApp() {
  const { state, busy, error, act } = useAppState();
  const [scr, setScr] = useState<Screen>("splash");
  const [origin, setOrigin] = useState({ x: 184, y: 700 });
  const [kg, setKg] = useState(5);
  const [tab, setTab] = useState<"open" | "soon">("open");
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState<{ text: string; err?: boolean } | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);

  // Embedded in /demo (or opened before in this tab): skip the splash.
  useEffect(() => {
    const embed = new URLSearchParams(window.location.search).has("embed");
    if (embed) document.body.classList.add("embed");
    let seen = false;
    try {
      seen = sessionStorage.getItem("bh-splash") === "1";
    } catch {
      /* private mode */
    }
    if (embed || seen) setScr("home");
  }, []);

  useEffect(() => {
    if (!error) return;
    setToast({ text: error, err: true });
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [error]);

  const say = (text: string) => {
    setToast({ text });
    setTimeout(() => setToast(null), 2000);
  };

  const go = (n: Screen, e?: MouseEvent) => {
    const r = screenRef.current?.getBoundingClientRect();
    setOrigin(e && r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: 184, y: 700 });
    if (scr === "splash") {
      try {
        sessionStorage.setItem("bh-splash", "1");
      } catch {
        /* private mode */
      }
    }
    setScr(n);
  };

  const frame = (children: ReactNode) => (
    <div className="bh bh-outer">
      <ProduceDefs />
      <div className="bh-phone">
        <div className="bh-screen" ref={screenRef}>
          <div className="bh-notch" />
          {children}
          {toast && <div className={`bh-toast ${toast.err ? "err" : ""}`}>{toast.text}</div>}
        </div>
      </div>
    </div>
  );

  if (!state) {
    return frame(
      <section className="bh-sc bh-splash">
        <Produce crop="carrots" w={150} className="bh-float" />
        <div className="bh-muted" style={{ color: "#CFE8D8" }}>{error ?? "Naglo-load…"}</div>
      </section>
    );
  }

  const { listing, deal, you } = state;
  const crop = listing.crop;
  const p = progressOf(state);
  const left = Math.max(0, p.target - p.value);
  const pct = p.target ? Math.min(100, Math.round((p.value / p.target) * 100)) : 0;
  const badge = stockBadge(left, p.target);
  const status = deal?.chain?.status;
  const refundable = !!deal?.chain?.refundable;
  const youKg = you?.kg ?? 0;
  const youPaid = (deal?.youLockedKg ?? 0) > 0;
  const youRefunded = !!deal?.txs.some((t) => t.label === "You claimed your refund");
  const save = listing.marketPricePerKg - listing.buyerPricePerKg;
  const dealActive = status === "Open" || status === "Funded";
  const explorer = state.chain.explorer;
  // The screen being entered gets the circular reveal from where the user tapped.
  const reveal = (n: Screen, extra?: CSSProperties) =>
    scr === n ? { className: "enter", style: { "--x": `${origin.x}px`, "--y": `${origin.y}px`, ...extra } as CSSProperties } : { className: "", style: extra };

  // What the main button on the detail/tracker screens does right now (driven by the on-chain status).
  let cta: { label: ReactNode; onClick?: (e: MouseEvent) => void; disabled?: boolean; cls?: string } | null = null;
  if (!you && !deal) {
    cta = {
      label: <span>Sumali · {kg} kilo · {peso(kg * listing.buyerPricePerKg)}<small>wala pang bayad ngayon</small></span>,
      onClick: async (e) => {
        await act("order", { kg });
        go("track", e);
      },
      cls: "pulse",
    };
  } else if (you && !deal) {
    cta = { label: <><span className="bh-spinner" /> Hinihintay ang AI Deal Maker…</>, disabled: true, cls: "ghost" };
  } else if (deal && status === "Open" && !refundable && youKg > 0 && !youPaid) {
    cta = { label: `Magbayad ${peso(youKg * listing.buyerPricePerKg)}`, onClick: () => act("pay", { who: "you" }), cls: "pulse" };
  } else if (deal && refundable && youPaid && !youRefunded) {
    cta = { label: `Kunin ang refund ${peso(deal.youLockedKg * listing.buyerPricePerKg)}`, onClick: () => act("refund"), cls: "pulse" };
  } else if (deal && !you && status === "Open") {
    cta = { label: "Sarado na ang grupong ito", disabled: true, cls: "ghost" };
  }
  const mainCta = busy ? { label: <><span className="bh-spinner" /> Pinoproseso sa blockchain…</>, disabled: true, cls: "", onClick: undefined } : cta;

  // ---------------------------------------------------------------- screens
  const splash = (
    <section {...reveal("splash")} className={`bh-sc bh-splash ${reveal("splash").className}`}>
      <div className="blob" style={{ width: 260, height: 260, background: "rgba(143,211,168,.12)", top: -70, right: -80, animation: "bh-drift 7s ease-in-out infinite" }} />
      <div className="blob" style={{ width: 180, height: 180, background: "rgba(233,185,73,.14)", bottom: -50, left: -60, animation: "bh-drift 9s ease-in-out infinite reverse" }} />
      <Produce crop={crop} w={190} className="bh-float" style={{ position: "relative" }} />
      <div className="bh-it bh-st" style={{ ...st(3), fontSize: 34, position: "relative" }}>
        BAYANIH<span style={{ color: "var(--gold)" }}>AI</span>
      </div>
      <div className="bh-st" style={{ ...st(5), fontSize: 15, color: "#CFE8D8", fontWeight: 600, maxWidth: 240, position: "relative" }}>
        Sama-samang bili.<br />Protektadong bayad.
      </div>
      <button className="bh-btn bh-st pulse" style={{ ...st(7), width: "auto", padding: "15px 34px", marginTop: 18, position: "relative" }} onClick={(e) => go("home", e)}>
        Magsimula →
      </button>
    </section>
  );

  const liveCard = (
    <button key="live" className="bh-card bh-pr" onClick={(e) => go("detail", e)}>
      <span className="bh-badge" style={{ background: badge.bg, color: badge.fg }}>{badge.text}</span>
      <div style={{ height: 62, display: "flex", justifyContent: "center", marginTop: 24 }}>
        <Produce crop={crop} w={76} className="bh-float" />
      </div>
      <b style={{ fontSize: 14 }}>{listing.cropName}</b>
      <div style={{ fontSize: 11, color: "var(--mut)", fontWeight: 600 }}>{listing.farmer}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8 }}>
        <span style={{ fontSize: 11, color: "var(--hint)", fontWeight: 600 }}>
          Kulang pa <b style={{ color: badge.fg, fontSize: 13 }}>{left} kg</b>
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: badge.line }}>{pct}%</span>
      </div>
      <div className="bh-bar" style={{ marginTop: 7 }}><i style={{ width: `${pct}%` }} /></div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <b style={{ fontSize: 18, color: "var(--g7)" }}>{peso(listing.buyerPricePerKg)}</b>
        <span className="bh-add" style={{ animation: "bh-ring 2s infinite" }}><Icon d="M12 5v14M5 12h14" /></span>
      </div>
    </button>
  );

  const soonCards = state.crops
    .filter((c) => c.key !== crop)
    .map((c) => (
      <button key={c.key} className="bh-card bh-pr" onClick={() => say(`Wala pang ani ng ${c.name} ngayon. Abangan!`)}>
        <span className="bh-badge" style={{ background: "#EEF1EE", color: "#5D7266" }}>Malapit na</span>
        <div style={{ height: 62, display: "flex", justifyContent: "center", marginTop: 24, opacity: 0.85 }}>
          <Produce crop={c.key} w={76} />
        </div>
        <b style={{ fontSize: 14 }}>{c.name}</b>
        <div style={{ fontSize: 11, color: "var(--mut)", fontWeight: 600 }}>Wala pang nag-post</div>
        <div style={{ fontSize: 11, color: "var(--hint)", fontWeight: 600, marginTop: 8 }}>Palengke: {peso(c.marketPricePerKg)}/kg</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <b style={{ fontSize: 13, color: "var(--mut)" }}>Abangan</b>
          <span className="bh-add" style={{ background: "#9AA79F" }}><Icon d="M12 5v14M5 12h14" /></span>
        </div>
      </button>
    ));

  const homeR = reveal("home");
  const home = (
    <section className={`bh-sc ${homeR.className}`} style={homeR.style}>
      <div className="bh-st" style={{ ...st(0), display: "flex", alignItems: "center", gap: 10 }}>
        <img src="/logo.svg" alt="" width={30} height={30} />
        <span className="bh-it" style={{ fontSize: 19, color: "var(--g8)" }}>BAYANIH<b style={{ color: "#C99A2E" }}>AI</b></span>
        <span style={{ flex: 1 }} />
        <span className={`bh-pill ${state.chain.ok ? "ok" : ""}`} style={{ fontSize: 10.5, padding: "4px 9px" }}>
          <i />{state.chain.ok ? (state.chain.isLocal ? "Local chain" : "BSC Testnet") : "Offline"}
        </span>
      </div>

      <button className="bh-hero bh-st" style={{ ...st(1), height: 164, padding: 18, flex: "none", width: "100%" }} onClick={(e) => go("detail", e)}>
        <div className="bh-it" style={{ fontSize: 27, lineHeight: 1.04, position: "absolute", left: 18, top: 18, zIndex: 1 }}>
          SARIWA<br />MULA SA<br /><span style={{ color: "var(--gold)" }}>BUKID</span>
        </div>
        <Produce crop={crop} w={132} className="bh-float" style={{ position: "absolute", right: 12, top: 18 }} />
        <span style={{ position: "absolute", left: 18, bottom: 16, zIndex: 1, background: "#fff", color: "var(--g8)", fontWeight: 800, fontSize: 12.5, padding: "8px 14px", borderRadius: 12 }}>
          {you ? "Tingnan ang order →" : "Sumali na →"}
        </span>
      </button>

      <div className="bh-st" style={{ ...st(2), display: "flex", justifyContent: "space-between" }}>
        {CROP_ORDER.map((k) => {
          const info = state.crops.find((c) => c.key === k);
          return (
            <button key={k} style={{ width: 62, background: "none" }} onClick={(e) => (k === crop ? go("detail", e) : say(`Wala pang ani ng ${info?.name} ngayon`))}>
              <div className={`bh-cat ${k === crop ? "on" : ""}`}><Produce crop={k} w={36} /></div>
              <div className="bh-lbl">{info?.name}</div>
            </button>
          );
        })}
      </div>

      <div className="bh-st" style={{ ...st(3), display: "flex", gap: 8 }}>
        <button className={`bh-chip ${tab === "open" ? "on" : ""}`} onClick={() => setTab("open")}>Bukas na deals</button>
        <button className={`bh-chip ${tab === "soon" ? "on" : ""}`} onClick={() => setTab("soon")}>Malapit na</button>
      </div>

      <div className="bh-sec bh-st" style={{ ...st(4), marginBottom: -2 }}>
        <b>{tab === "open" ? "Mga ani ngayon" : "Abangan"}</b>
        <span style={{ display: "flex", gap: 10, fontSize: 10.5, fontWeight: 700, color: "var(--mut)" }}>
          <span><i className="bh-lg" style={{ background: "#E24B1A" }} />Konti</span>
          <span><i className="bh-lg" style={{ background: "#E9B949" }} />Sapat</span>
          <span><i className="bh-lg" style={{ background: "#1F9D52" }} />Marami</span>
        </span>
      </div>

      <div className="bh-scroll bh-st" style={st(5)}>{tab === "open" ? [liveCard, ...soonCards.slice(0, 1)] : soonCards}</div>
    </section>
  );

  const ringR = 98;
  const ringC = 2 * Math.PI * ringR;
  const aiNote = deal?.ai ?? state.groups.find((g) => g.pickup === PICKUP)?.review?.ai;
  const detailR = reveal("detail");
  const detail = (
    <section className={`bh-sc ${detailR.className}`} style={detailR.style}>
      <div className="bh-st" style={st(0)}>
        <button className="bh-back" aria-label="Bumalik" onClick={(e) => go("home", e)}><Icon d="M15 5l-7 7 7 7" /></button>
      </div>
      <div className="bh-st" style={{ ...st(1), position: "relative", height: 150, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
        <svg width={150} height={150} viewBox="0 0 218 218" style={{ position: "absolute" }}>
          <circle cx="109" cy="109" r={ringR} fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="10" />
          <circle cx="109" cy="109" r={ringR} fill="none" stroke="var(--g5)" strokeWidth="10" strokeLinecap="round" strokeDasharray={ringC} strokeDashoffset={ringC * (1 - pct / 100)} transform="rotate(-90 109 109)" style={{ transition: "stroke-dashoffset 1.9s cubic-bezier(.16,1,.3,1)" }} />
        </svg>
        <Produce crop={crop} w={104} className="bh-float" />
      </div>
      <div className="bh-st" style={{ ...st(2), textAlign: "center" }}>
        <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>
          <Count to={p.value} /> <span style={{ fontSize: 14, color: "var(--mut)" }}> / {p.target} {p.label}</span>
        </div>
      </div>
      <div className="bh-st" style={{ ...st(3), display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div className="bh-it" style={{ fontSize: 24 }}>{listing.cropName}</div>
          <div className="bh-muted">{listing.farmer}, {listing.origin}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--g7)" }}>{peso(listing.buyerPricePerKg)}<small style={{ fontSize: 13, color: "var(--mut)" }}>/kilo</small></div>
          {save > 0 && <div style={{ fontSize: 11.5, color: "var(--or)", fontWeight: 800 }}>{peso(save)} mas mura sa palengke</div>}
        </div>
      </div>

      <div className="bh-card bh-st" style={{ ...st(4), padding: "12px 14px" }}>
        <div className="bh-sec" style={{ marginBottom: 8 }}>
          <div>
            <b style={{ fontSize: 13.5 }}>Grupo sa {PICKUP}</b>
            <div style={{ fontSize: 11, color: "var(--hint)", fontWeight: 600 }}>
              {p.buyers} kapitbahay · kulang pa <b style={{ color: badge.fg }}>{left} kg</b> para sa isang truck
            </div>
          </div>
          <span className={`bh-pill ${left <= 0 ? "ok" : ""}`}><i />{badge.text}</span>
        </div>
        <div className="bh-bar"><i style={{ width: `${pct}%` }} /></div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11.5, fontWeight: 600, color: "var(--hint)" }}>
          <span>Sa magsasaka: {peso(listing.farmerPricePerKg)}/kg</span>
          <span>Middleman: {peso(listing.middlemanPricePerKg)}/kg</span>
        </div>
        {aiNote && (
          <div style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.45 }}>
            <span className="bh-pill ai" style={{ padding: "3px 9px", fontSize: 10.5 }}><i />AI Deal Maker · {aiNote.source === "gemini" ? "Gemini" : "Rules"}</span>
            <div style={{ marginTop: 6, fontStyle: "italic", color: "var(--hint)" }}>{aiNote.summary_tl}</div>
          </div>
        )}
      </div>

      {!you && !deal && (
        <div className="bh-kgs bh-st" style={st(5)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} className={`bh-chip ${n === kg ? "on" : ""}`} onClick={() => setKg(n)}>{n} kg</button>
          ))}
        </div>
      )}
      <div style={{ flex: 1 }} />
      <div className="bh-st" style={{ ...st(6), textAlign: "center", fontSize: 11.5, color: "var(--hint)", fontWeight: 600, marginBottom: -4 }}>
        Ligtas ang bayad mo · ibabalik kung hindi dumating
      </div>
      {mainCta ? (
        <button className={`bh-btn bh-st ${mainCta.cls ?? ""}`} style={{ ...st(6), flex: "none" }} disabled={mainCta.disabled} onClick={mainCta.onClick}>{mainCta.label}</button>
      ) : (
        <button className="bh-btn green bh-st" style={{ ...st(6), flex: "none" }} onClick={(e) => go("track", e)}>Tingnan ang bayad →</button>
      )}
    </section>
  );

  // Escrow tracker: every step reads the real deal status on-chain.
  const steps = [
    { done: !!you, title: you ? `Sumali ka · ${youKg} kilo` : "Sumali sa grupo", sub: "Wala pang bayad hanggang may deal" },
    { done: !!deal, title: deal ? `Ginawa ng AI ang Deal #${deal.dealId} sa BSC` : "AI Deal Maker", sub: deal ? "Gumagawa lang ng deal ang AI, hindi humahawak ng pera" : "Sinusuri ng AI kung sapat na ang grupo" },
    { done: youPaid || status === "Released", title: "Nakalaan na ang bayad mo", sub: "Nasa smart contract, hindi pa sa magsasaka" },
    { done: status === "Funded" || status === "Released", title: deal?.chain ? `Buo na ang grupo · ${deal.chain.fundedKg} / ${deal.chain.targetKg} kilo` : "Buo na ang grupo", sub: "Papunta na ang truck" },
    { done: status === "Released", title: `Dumating na ang ${listing.cropName.toLowerCase()}!`, sub: "Kinumpirma ng coordinator, bayad na ang magsasaka" },
  ];
  const firstOpen = steps.findIndex((s) => !s.done);
  const refundView = refundable || status === "Refunded" || youRefunded;
  const truckAt = status === "Released" ? 100 : status === "Funded" ? 66 : youPaid ? 33 : deal ? 15 : 0;
  const title =
    status === "Released" ? "Dumating na!" : youRefunded || status === "Refunded" ? "Naibalik ang bayad" : refundable ? "Hindi natuloy ang grupo" : status === "Funded" ? "Papunta na ang ani!" : youPaid ? "Nasa escrow na" : deal ? "Bukas na ang deal" : you ? "Nakasali ka na" : "Wala ka pang order";

  const trackR = reveal("track", { alignItems: "center", textAlign: "center" });
  const track = (
    <section className={`bh-sc ${trackR.className}`} style={trackR.style}>
      <div className="bh-st" style={{ ...st(0), marginTop: 8, width: 84, height: 84, borderRadius: "50%", background: "var(--g1)", display: "flex", alignItems: "center", justifyContent: "center", animation: "bh-ring 2s infinite", flex: "none" }}>
        <svg className="bh-ic" viewBox="0 0 24 24" style={{ color: "var(--g7)", width: 40, height: 40 }}>
          <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      </div>
      <div className="bh-it bh-st" style={{ ...st(1), fontSize: 24 }}>{title}</div>

      {refundView ? (
        <div className="bh-card bh-st" style={{ ...st(2), width: "100%", padding: 16, textAlign: "left" }}>
          <b>{youRefunded || status === "Refunded" ? `Naibalik na ang ${peso(youKg * listing.buyerPricePerKg)} mo. Walang nawala.` : "Hindi napuno ang grupo bago ang deadline."}</b>
          <div className="bh-muted" style={{ marginTop: 6 }}>Ang smart contract mismo ang nagbabalik ng pera. Walang ibang makakakuha nito.</div>
        </div>
      ) : (
        <div className="bh-card bh-st" style={{ ...st(2), width: "100%", padding: 16, textAlign: "left", display: "flex", flexDirection: "column", gap: 14 }}>
          {steps.map((s, i) => (
            <div key={i} className={`bh-step ${s.done ? "done" : i === firstOpen ? "now" : ""}`}>
              <div className="d">{s.done ? "✓" : i + 1}</div>
              <div><b>{s.title}</b><span>{s.sub}</span></div>
            </div>
          ))}
        </div>
      )}

      <div className="bh-road bh-st" style={st(3)}>
        <svg className="bh-truck" width={54} height={34} viewBox="0 0 54 34" style={{ left: `calc(${truckAt}% - ${(54 * truckAt) / 100}px)` }}>
          <rect x="0" y="6" width="34" height="20" rx="3" fill="var(--g7)" />
          <path d="M34 12h12l6 8v6H34z" fill="var(--or)" />
          <circle cx="12" cy="28" r="5" fill="#0c0f0d" /><circle cx="42" cy="28" r="5" fill="#0c0f0d" />
        </svg>
      </div>

      {status === "Released" && deal && (
        <div style={{ width: "100%", position: "relative", flex: "none" }}>
          <div className="bh-card" style={{ padding: 16, animation: "bh-pop .6s cubic-bezier(.34,1.56,.64,1) both" }}>
            <div style={{ fontSize: 12.5, color: "var(--mut)", fontWeight: 700 }}>Nabayaran na si {listing.farmer}</div>
            <div className="bh-it" style={{ fontSize: 38, color: "var(--g7)" }}>₱<Count to={deal.farmerReceived} /></div>
            <div style={{ fontSize: 12.5, color: "var(--mut)", fontWeight: 600 }}>Hauler +{peso(deal.haulerReceived)} · Escrow {peso(state.chain.escrowPesos)}</div>
          </div>
          <Confetti key={deal.dealId} />
        </div>
      )}

      {deal && deal.txs.length > 0 && (
        <div className="bh-card bh-st" style={{ ...st(4), width: "100%", padding: "10px 14px", textAlign: "left", flex: "none" }}>
          <b style={{ fontSize: 13 }}>Patunay sa blockchain</b>
          {deal.txs.map((t) => (
            <div className="bh-tx" key={t.hash}>
              <span>{t.label}</span>
              {explorer ? <a href={`${explorer}/tx/${t.hash}`} target="_blank" rel="noreferrer">{t.hash.slice(0, 10)}…</a> : <span className="bh-muted">{t.hash.slice(0, 10)}…</span>}
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1 }} />
      {mainCta && <button className={`bh-btn bh-st ${mainCta.cls ?? ""}`} style={{ ...st(5), flex: "none" }} disabled={mainCta.disabled} onClick={mainCta.onClick}>{mainCta.label}</button>}
    </section>
  );

  const dealsR = reveal("deals");
  const deals = (
    <section className={`bh-sc ${dealsR.className}`} style={dealsR.style}>
      <div className="bh-it bh-st" style={{ ...st(0), fontSize: 24 }}>Mga deal</div>
      <div className="bh-muted bh-st" style={st(1)}>Sinusuri ng AI Deal Maker ang bawat grupo. Gumagawa lang ito ng deal sa blockchain kapag sapat na ang kilo para sa isang truck.</div>
      {state.groups.map((g, i) => {
        const ai = g.review?.ai;
        const isDeal = deal?.pickup === g.pickup;
        const gp = isDeal && deal?.chain ? Math.round((deal.chain.fundedKg / deal.chain.targetKg) * 100) : Math.min(100, Math.round((g.totalKg / listing.minKg) * 100));
        return (
          <button
            key={g.pickup}
            className="bh-card bh-st"
            style={{ ...st(2 + i), padding: 14, textAlign: "left", display: "flex", flexDirection: "column", gap: 8, flex: "none" }}
            onClick={(e) => (g.pickup === PICKUP ? go("detail", e) : say(`${g.pickup}: kulang pa ng ${Math.max(0, listing.minKg - g.totalKg)} kg`))}
          >
            <div className="bh-sec" style={{ width: "100%" }}>
              <b>{g.pickup}</b>
              {isDeal ? (
                <span className="bh-pill ok"><i />Deal #{deal?.dealId} · {status}</span>
              ) : ai ? (
                <span className={`bh-pill ${ai.create_deal ? "ok" : ""}`}><i />{ai.create_deal ? "CREATE DEAL" : "WAIT"}</span>
              ) : (
                <span className="bh-pill ai"><i />Hinihintay ang AI</span>
              )}
            </div>
            <div className="bh-muted">{g.buyerCount} mamimili · {g.totalKg} / {listing.minKg} kg</div>
            <div className="bh-bar" style={{ width: "100%" }}><i style={{ width: `${gp}%` }} /></div>
            {ai && <div style={{ fontSize: 12, fontStyle: "italic", color: "var(--hint)" }}>{ai.summary_tl}</div>}
          </button>
        );
      })}
    </section>
  );

  const profileR = reveal("profile");
  const profile = (
    <section className={`bh-sc ${profileR.className}`} style={profileR.style}>
      <div className="bh-it bh-st" style={{ ...st(0), fontSize: 24 }}>Profile</div>
      <div className="bh-card bh-st" style={{ ...st(1), padding: 16, display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ width: 48, height: 48, borderRadius: 16, background: "var(--g1)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--g7)" }}>
          <Icon><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Icon>
        </div>
        <div>
          <b>Ikaw (demo buyer)</b>
          <div className="bh-muted">{PICKUP} · {you ? `${youKg} kg ng ${listing.cropName}` : "wala pang order"}</div>
        </div>
      </div>
      <div className="bh-card bh-st" style={{ ...st(2), padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <b>Paano gumagana</b>
        <div className="bh-muted">1. Sumali ka sa grupo ng mga kapitbahay.</div>
        <div className="bh-muted">2. Kapag sapat na ang kilo, gagawa ang AI ng deal sa BNB Smart Chain.</div>
        <div className="bh-muted">3. Nasa smart contract ang bayad hanggang dumating ang ani. Kung hindi, ibabalik ito.</div>
      </div>
      <div className="bh-card bh-st" style={{ ...st(3), padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
        <b>Blockchain</b>
        <div className="bh-muted">{state.chain.ok ? (state.chain.isLocal ? "Local test chain" : "BNB Smart Chain Testnet") : "Hindi konektado"}</div>
        {state.chain.contract && explorer && (
          <a className="bh-muted" style={{ color: "var(--g7)", fontFamily: "ui-monospace, Consolas, monospace" }} href={`${explorer}/address/${state.chain.contract}#code`} target="_blank" rel="noreferrer">
            Escrow: {state.chain.contract.slice(0, 8)}…{state.chain.contract.slice(-6)} ↗
          </a>
        )}
        <div className="bh-muted">Test wallets lang, walang totoong pera.</div>
      </div>
      <a href="/farmer" className="bh-btn ghost bh-st" style={{ ...st(4), textDecoration: "none", flex: "none" }}>Buksan ang app ng magsasaka →</a>
    </section>
  );

  const screens: Record<Screen, ReactNode> = { splash, home, detail, track, deals, profile };
  const navTo = (n: Screen) => (e: MouseEvent) => go(n, e);

  return frame(
    <>
      {screens[scr]}
      {scr !== "splash" && scr !== "detail" && (
        <nav className="bh-nav">
          <button className={`bh-nv ${scr === "home" ? "on" : ""}`} onClick={navTo("home")}><Icon d="M4 11l8-7 8 7v9H4zM10 20v-6h4v6" />Home</button>
          <button className={`bh-nv ${scr === "deals" ? "on" : ""}`} onClick={navTo("deals")}>
            <Icon><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></Icon>Deals
          </button>
          <button className="bh-fab" aria-label="Mag-post ng ani" onClick={() => setSheet(true)}><Icon d="M12 5v14M5 12h14" />Ani</button>
          <button className={`bh-nv ${scr === "track" ? "on" : ""}`} onClick={navTo("track")}>
            <Icon><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Icon>Bayad
          </button>
          <button className={`bh-nv ${scr === "profile" ? "on" : ""}`} onClick={navTo("profile")}>
            <Icon><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Icon>Profile
          </button>
        </nav>
      )}
      {sheet && (
        <HarvestSheet
          state={state}
          busy={busy}
          act={act}
          dealActive={dealActive}
          onClose={() => setSheet(false)}
          onPosted={() => {
            setSheet(false);
            say("Naka-post na ang ani mo!");
            setScr("home");
          }}
        />
      )}
    </>
  );
}

/** Farmer: post a harvest with an AI fair price (the center "+" in the nav). */
function HarvestSheet({
  state,
  busy,
  act,
  dealActive,
  onClose,
  onPosted,
}: {
  state: AppState;
  busy: string | null;
  act: (a: string, x?: Record<string, unknown>) => Promise<void>;
  dealActive: boolean;
  onClose: () => void;
  onPosted: () => void;
}) {
  const [crop, setCrop] = useState<CropKey>(state.listing.crop);
  const [kg, setKg] = useState(150);
  const sug = state.priceSuggestion;
  const match = !!sug && sug.crop === crop && sug.kg === kg;
  return (
    <>
      <div className="bh-shade" onClick={onClose} />
      <div className="bh-sheet" role="dialog" aria-label="Mag-post ng ani">
        <div className="bh-grab" />
        <div className="bh-sec">
          <div>
            <div className="bh-it" style={{ fontSize: 22 }}>Mag-post ng ani</div>
            <div className="bh-muted">Para sa magsasaka · {state.listing.farmer}</div>
          </div>
          <button className="bh-back" aria-label="Isara" onClick={onClose}><Icon d="M6 6l12 12M18 6L6 18" /></button>
        </div>

        {dealActive ? (
          <div className="bh-card" style={{ padding: 14 }}>
            <b>May aktibong deal pa</b>
            <div className="bh-muted" style={{ marginTop: 4 }}>Hintayin munang matapos ang kasalukuyang deal (maihatid o ma-refund) bago mag-post ng bagong ani.</div>
          </div>
        ) : (
          <>
            <b style={{ fontSize: 14 }}>Anong ani?</b>
            <div className="bh-crops">
              {state.crops.map((c) => (
                <button key={c.key} className={`bh-crop ${c.key === crop ? "on" : ""}`} onClick={() => setCrop(c.key)}>
                  <Produce crop={c.key} w={44} />
                  {c.name}
                </button>
              ))}
            </div>
            <b style={{ fontSize: 14 }}>Ilang kilo? <span className="bh-muted">(isang truck)</span></b>
            <div className="bh-kgs">
              {HARVEST_KG.map((n) => (
                <button key={n} className={`bh-chip ${n === kg ? "on" : ""}`} onClick={() => setKg(n)}>{n} kg</button>
              ))}
            </div>

            {match && sug ? (
              <div className="bh-price">
                <div className="cmp">Patas na presyo mula sa AI · {sug.source === "gemini" ? "Gemini" : "Rules"}</div>
                <div className="v">{peso(sug.farmerPricePerKg)}<small> / kilo para sa iyo</small></div>
                <p>{sug.reason_tl}</p>
                <p className="cmp">
                  Middleman {peso(sug.middlemanPricePerKg)} · Mamimili {peso(sug.buyerPricePerKg)} (palengke {peso(sug.marketPricePerKg)}) · Kikitain: {peso(sug.farmerPricePerKg * kg)}
                </p>
              </div>
            ) : (
              <div className="bh-card" style={{ padding: 14 }}>
                <span className="bh-pill ai"><i />AI Fair Pricing</span>
                <div className="bh-muted" style={{ marginTop: 6 }}>Pipili ang AI ng presyong mas mura sa palengke para sa mamimili, at mas mataas sa middleman para sa iyo.</div>
              </div>
            )}

            <button className="bh-btn ghost" disabled={!!busy} onClick={() => act("price-suggest", { crop, kg })}>
              {busy === "price-suggest" ? <><span className="bh-spinner" /> Nag-iisip ang AI…</> : match ? "Itanong ulit sa AI" : "Itanong sa AI ang patas na presyo"}
            </button>
            <button
              className="bh-btn pulse"
              disabled={!match || !!busy}
              onClick={async () => {
                await act("post-harvest");
                onPosted();
              }}
            >
              {busy === "post-harvest" ? <><span className="bh-spinner" /> Pino-post…</> : match && sug ? `I-post ang ${kg} kg sa ${peso(sug.farmerPricePerKg)}/kg` : "I-post (itanong muna sa AI)"}
            </button>
          </>
        )}
      </div>
    </>
  );
}

/** One-time confetti burst when the payment is released. */
function Confetti() {
  const [bits] = useState(() =>
    Array.from({ length: 22 }, (_, i) => {
      const a = Math.random() * 6.28;
      const m = 60 + Math.random() * 90;
      return { c: ["#E9B949", "#1F9D52", "#C94A15", "#8FD3A8"][i % 4], x: Math.cos(a) * m, y: Math.sin(a) * m };
    })
  );
  return (
    <div style={{ position: "absolute", left: "50%", top: 40, pointerEvents: "none" }}>
      {bits.map((b, i) => (
        <i key={i} style={{ position: "absolute", width: 8, height: 8, borderRadius: 2, background: b.c, "--bx": `${b.x}px`, "--by": `${b.y}px`, animation: "bh-burst 1s ease-out both" } as CSSProperties} />
      ))}
    </div>
  );
}
