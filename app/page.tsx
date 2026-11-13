"use client";
import { useState, type MouseEvent, type ReactNode } from "react";
import { Produce } from "@/components/Produce";
import {
  ChainPill, Confetti, Count, GridIcon, GroupsList, ICONS, Icon, LockIcon, PICKUP, Road, Steps, TxProof, UserIcon,
  progressOf, st, stockBadge, useEmbed, useErrorToast, useShell,
} from "@/components/bh";
import { PaySheet } from "@/components/PaySheet";
import { peso, useAppState } from "@/lib/useAppState";
import type { CropKey } from "@/lib/listing";

// BAYANIHAI buyer app (Mamimili), built from the team's prototype design and wired to the real system:
// prices, kilos and escrow status all come from /api/state (the smart contract on BNB Smart Chain).
// Farmers have their own app at /farmer (with the "+ Ani" harvest button).

type Screen = "splash" | "home" | "detail" | "track" | "deals" | "profile";
const CROP_ORDER: CropKey[] = ["carrots", "cabbage", "tomatoes", "potatoes"];

export default function BuyerApp() {
  const { state, busy, error, act } = useAppState();
  const { scr, setScr, go, say, reveal, frame } = useShell<Screen>("splash");
  const [kg, setKg] = useState(5);
  const [tab, setTab] = useState<"open" | "soon">("open");
  const [paySheet, setPaySheet] = useState(false);

  // Embedded in /demo, or splash already seen in this tab: start on Home.
  useEmbed((embed) => {
    let seen = false;
    try {
      seen = sessionStorage.getItem("bh-splash") === "1";
    } catch {
      /* private mode */
    }
    if (embed || seen) setScr("home");
  });
  useErrorToast(error, say);

  const enterApp = (e: MouseEvent) => {
    try {
      sessionStorage.setItem("bh-splash", "1");
    } catch {
      /* private mode */
    }
    go("home", e);
  };

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
  const explorer = state.chain.explorer;

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
  } else if (deal && status === "Open" && !refundable && youKg > 0 && !youPaid && state.cashPending) {
    cta = { label: <><span className="bh-spinner" /> Hinihintay ang coordinator · cash {peso(state.cashPending.amountPesos)}</>, disabled: true, cls: "ghost" };
  } else if (deal && status === "Open" && !refundable && youKg > 0 && !youPaid) {
    cta = { label: `Magbayad ${peso(youKg * listing.buyerPricePerKg)}`, onClick: () => setPaySheet(true), cls: "pulse" };
  } else if (deal && refundable && youPaid && !youRefunded) {
    cta = { label: `Kunin ang refund ${peso(deal.youLockedKg * listing.buyerPricePerKg)}`, onClick: () => act("refund"), cls: "pulse" };
  } else if (deal && !you && status === "Open") {
    cta = { label: "Sarado na ang grupong ito", disabled: true, cls: "ghost" };
  }
  const youPayment = state.payments.find((x) => x.who === "you");
  const methodNote = youPayment
    ? youPayment.method === "gcash"
      ? `GCash · AI-verified ${youPayment.refMasked ?? ""}`.trim()
      : youPayment.method === "cash"
        ? "Cash · kinumpirma ng coordinator"
        : "Crypto wallet"
    : null;
  const mainCta = busy && !paySheet ? { label: <><span className="bh-spinner" /> Pinoproseso sa blockchain…</>, disabled: true, cls: "", onClick: undefined } : cta;

  // ---------------------------------------------------------------- splash (choose a role)
  const splashR = reveal("splash");
  const splash = (
    <section className={`bh-sc bh-splash ${splashR.className}`} style={splashR.style}>
      <div className="blob" style={{ width: 260, height: 260, background: "rgba(143,211,168,.12)", top: -70, right: -80, animation: "bh-drift 7s ease-in-out infinite" }} />
      <div className="blob" style={{ width: 180, height: 180, background: "rgba(233,185,73,.14)", bottom: -50, left: -60, animation: "bh-drift 9s ease-in-out infinite reverse" }} />
      <Produce crop={crop} w={190} className="bh-float" style={{ position: "relative" }} />
      <div className="bh-it bh-st" style={{ ...st(3), fontSize: 34, position: "relative" }}>
        BAYANIH<span style={{ color: "var(--gold)" }}>AI</span>
      </div>
      <div className="bh-st" style={{ ...st(5), fontSize: 15, color: "#CFE8D8", fontWeight: 600, maxWidth: 240, position: "relative" }}>
        Sama-samang bili.<br />Protektadong bayad.
      </div>
      <button className="bh-btn bh-st pulse" style={{ ...st(7), width: "auto", padding: "15px 34px", marginTop: 18, position: "relative" }} onClick={enterApp}>
        Mamimili ako →
      </button>
      <a href="/farmer" className="bh-st" style={{ ...st(8), position: "relative", color: "#CFE8D8", fontWeight: 700, fontSize: 13.5, marginTop: 4 }}>
        Magsasaka ako? Mag-post ng ani →
      </a>
    </section>
  );

  // ---------------------------------------------------------------- home
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
        <span className="bh-add" style={{ animation: "bh-ring 2s infinite" }}><Icon d={ICONS.plus} /></span>
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
          <span className="bh-add" style={{ background: "#9AA79F" }}><Icon d={ICONS.plus} /></span>
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
        <ChainPill state={state} />
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

  // ---------------------------------------------------------------- detail
  const ringR = 98;
  const ringC = 2 * Math.PI * ringR;
  const aiNote = deal?.ai ?? state.groups.find((g) => g.pickup === PICKUP)?.review?.ai;
  const detailR = reveal("detail");
  const detail = (
    <section className={`bh-sc ${detailR.className}`} style={detailR.style}>
      <div className="bh-st" style={st(0)}>
        <button className="bh-back" aria-label="Bumalik" onClick={(e) => go("home", e)}><Icon d={ICONS.back} /></button>
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

  // ---------------------------------------------------------------- escrow tracker (Bayad)
  const steps = [
    { done: !!you, title: you ? `Sumali ka · ${youKg} kilo` : "Sumali sa grupo", sub: "Wala pang bayad hanggang may deal" },
    { done: !!deal, title: deal ? `Ginawa ng AI ang Deal #${deal.dealId} sa BSC` : "AI Deal Maker", sub: deal ? "Gumagawa lang ng deal ang AI, hindi humahawak ng pera" : "Sinusuri ng AI kung sapat na ang grupo" },
    {
      done: youPaid || status === "Released",
      title: state.cashPending && !youPaid ? `Cash ${peso(state.cashPending.amountPesos)} · hinihintay ang coordinator` : "Nakalaan na ang bayad mo",
      sub: methodNote ? `${methodNote} · nasa smart contract` : "Nasa smart contract, hindi pa sa magsasaka",
    },
    { done: status === "Funded" || status === "Released", title: deal?.chain ? `Buo na ang grupo · ${deal.chain.fundedKg} / ${deal.chain.targetKg} kilo` : "Buo na ang grupo", sub: "Papunta na ang truck" },
    { done: status === "Released", title: `Dumating na ang ${listing.cropName.toLowerCase()}!`, sub: "Kinumpirma ng coordinator, bayad na ang magsasaka" },
  ];
  const refundView = refundable || status === "Refunded" || youRefunded;
  const truckAt = status === "Released" ? 100 : status === "Funded" ? 66 : youPaid ? 33 : deal ? 15 : 0;
  const title =
    status === "Released" ? "Dumating na!" : youRefunded || status === "Refunded" ? "Naibalik ang bayad" : refundable ? "Hindi natuloy ang grupo" : status === "Funded" ? "Papunta na ang ani!" : youPaid ? "Nasa escrow na" : deal ? "Bukas na ang deal" : you ? "Nakasali ka na" : "Wala ka pang order";

  const trackR = reveal("track", { alignItems: "center", textAlign: "center" });
  const track = (
    <section className={`bh-sc ${trackR.className}`} style={trackR.style}>
      <div className="bh-st" style={{ ...st(0), marginTop: 8, width: 84, height: 84, borderRadius: "50%", background: "var(--g1)", display: "flex", alignItems: "center", justifyContent: "center", animation: "bh-ring 2s infinite", flex: "none", color: "var(--g7)" }}>
        <svg className="bh-ic" viewBox="0 0 24 24" style={{ width: 40, height: 40 }}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
      </div>
      <div className="bh-it bh-st" style={{ ...st(1), fontSize: 24 }}>{title}</div>

      {refundView ? (
        <div className="bh-card bh-st" style={{ ...st(2), width: "100%", padding: 16, textAlign: "left" }}>
          <b>{youRefunded || status === "Refunded" ? `Naibalik na ang ${peso(youKg * listing.buyerPricePerKg)} mo. Walang nawala.` : "Hindi napuno ang grupo bago ang deadline."}</b>
          <div className="bh-muted" style={{ marginTop: 6 }}>Ang smart contract mismo ang nagbabalik ng pera. Walang ibang makakakuha nito.</div>
        </div>
      ) : (
        <Steps steps={steps} style={st(2)} />
      )}

      <Road at={truckAt} style={st(3)} />

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

      <TxProof state={state} style={st(4)} />

      <div style={{ flex: 1 }} />
      {mainCta && <button className={`bh-btn bh-st ${mainCta.cls ?? ""}`} style={{ ...st(5), flex: "none" }} disabled={mainCta.disabled} onClick={mainCta.onClick}>{mainCta.label}</button>}
    </section>
  );

  // ---------------------------------------------------------------- deals + profile
  const dealsR = reveal("deals");
  const deals = (
    <section className={`bh-sc ${dealsR.className}`} style={dealsR.style}>
      <div className="bh-it bh-st" style={{ ...st(0), fontSize: 24 }}>Mga deal</div>
      <div className="bh-muted bh-st" style={st(1)}>Sinusuri ng AI Deal Maker ang bawat grupo. Gumagawa lang ito ng deal sa blockchain kapag sapat na ang kilo para sa isang truck.</div>
      <GroupsList state={state} onOpen={(pickup, e) => (pickup === PICKUP ? go("detail", e) : say(`${pickup}: kulang pa ng ${Math.max(0, listing.minKg - (state.groups.find((g) => g.pickup === pickup)?.totalKg ?? 0))} kg`))} />
    </section>
  );

  const profileR = reveal("profile");
  const profile = (
    <section className={`bh-sc ${profileR.className}`} style={profileR.style}>
      <div className="bh-it bh-st" style={{ ...st(0), fontSize: 24 }}>Profile</div>
      <div className="bh-card bh-st" style={{ ...st(1), padding: 16, display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ width: 48, height: 48, borderRadius: 16, background: "var(--g1)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--g7)" }}><UserIcon /></div>
        <div>
          <b>Ikaw (mamimili)</b>
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
      <a href="/farmer" className="bh-btn ghost bh-st" style={{ ...st(4), textDecoration: "none", flex: "none" }}>Magsasaka ka? Buksan ang app ng magsasaka →</a>
    </section>
  );

  const screens: Record<Screen, ReactNode> = { splash, home, detail, track, deals, profile };
  const navTo = (n: Screen) => (e: MouseEvent) => go(n, e);

  return frame(
    <>
      {screens[scr]}
      {scr !== "splash" && scr !== "detail" && (
        <nav className="bh-nav">
          <button className={`bh-nv ${scr === "home" ? "on" : ""}`} onClick={navTo("home")}><Icon d={ICONS.home} />Home</button>
          <button className={`bh-nv ${scr === "deals" ? "on" : ""}`} onClick={navTo("deals")}><GridIcon />Deals</button>
          <button className={`bh-nv ${scr === "track" ? "on" : ""}`} onClick={navTo("track")}><LockIcon />Bayad</button>
          <button className={`bh-nv ${scr === "profile" ? "on" : ""}`} onClick={navTo("profile")}><UserIcon />Profile</button>
        </nav>
      )}
      {paySheet && (
        <PaySheet
          state={state}
          busy={busy}
          act={act}
          onClose={() => setPaySheet(false)}
          onDone={() => {
            setPaySheet(false);
            setScr("track");
          }}
        />
      )}
    </>
  );
}
