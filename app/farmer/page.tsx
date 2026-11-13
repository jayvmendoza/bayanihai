"use client";
import { useState, type MouseEvent, type ReactNode } from "react";
import { Produce } from "@/components/Produce";
import {
  ChainPill, Confetti, Count, GroupsList, HarvestSheet, ICONS, Icon, LockIcon, PeopleIcon, Road, Steps, TxProof, UserIcon,
  progressOf, st, useEmbed, useErrorToast, useShell,
} from "@/components/bh";
import { peso, useAppState } from "@/lib/useAppState";

// BAYANIHAI farmer app (Magsasaka), same design as the buyer app. The farmer posts a harvest with
// an AI fair price (the center "+ Ani"), sees what they'll earn, and follows their payout on BNB Smart Chain.

type Screen = "home" | "bayad" | "buyers" | "profile";

export default function FarmerApp() {
  const { state, busy, error, act } = useAppState();
  const { scr, go, say, reveal, frame } = useShell<Screen>("home");
  const [sheet, setSheet] = useState(false);
  useEmbed();
  useErrorToast(error, say);

  if (!state) {
    return frame(
      <section className="bh-sc bh-splash">
        <Produce crop="carrots" w={150} className="bh-float" />
        <div className="bh-muted" style={{ color: "#CFE8D8" }}>{error ?? "Naglo-load…"}</div>
      </section>
    );
  }

  const { listing, deal } = state;
  const crop = listing.crop;
  const status = deal?.chain?.status;
  const refundable = !!deal?.chain?.refundable;
  const dealActive = (status === "Open" && !refundable) || status === "Funded";
  const failed = status === "Refunded" || (status === "Open" && refundable);
  const p = progressOf(state);
  const pct = p.target ? Math.min(100, Math.round((p.value / p.target) * 100)) : 0;
  const kgTotal = deal?.chain?.targetKg ?? listing.minKg;
  const earnings = status === "Released" && deal ? deal.farmerReceived : kgTotal * listing.farmerPricePerKg;
  const middleman = kgTotal * listing.middlemanPricePerKg;
  const times = middleman > 0 ? (earnings / middleman).toFixed(1).replace(/\.0$/, "") : "–";
  const funded = deal?.chain?.fundedKg ?? 0;
  const groupFull = p.value >= p.target;

  let groupLine = `${p.buyers} kapitbahay ang sumali · ${p.value} / ${p.target} kg`;
  if (deal?.chain && status === "Open" && !refundable) groupLine = `Nagbabayad na ang mga mamimili · ${funded} / ${kgTotal} kg`;
  if (status === "Funded" || status === "Released") groupLine = `Buo na ang grupo · ${kgTotal} kg`;
  if (failed) groupLine = "Hindi napuno ang grupo bago ang deadline";

  let safe = { title: "Wala pang nakalaang bayad", text: "Lalabas dito kapag nagbayad na ang mga mamimili." };
  if (status === "Open" && funded > 0 && !refundable) safe = { title: `Nakalaan na ang ${peso(funded * listing.buyerPricePerKg)}`, text: "Nasa smart contract. Hinihintay pang mapuno ang grupo." };
  if (status === "Funded") safe = { title: "Buo na ang bayad sa escrow", text: "Matatanggap mo pagdating ng ani sa mamimili." };
  if (status === "Released" && deal) safe = { title: `Bayad na! ${peso(deal.farmerReceived)}`, text: "Naipadala na ng smart contract sa wallet mo." };
  if (failed) safe = { title: "Naibalik sa mga mamimili", text: "Walang nadaya. Subukan ulit sa susunod na ani." };

  const openSheet = () => setSheet(true);

  // ---------------------------------------------------------------- home
  const homeR = reveal("home");
  const home = (
    <section className={`bh-sc ${homeR.className}`} style={homeR.style}>
      <div className="bh-st" style={{ ...st(0), display: "flex", alignItems: "center", gap: 10 }}>
        <img src="/logo.svg" alt="" width={30} height={30} />
        <span className="bh-it" style={{ fontSize: 19, color: "var(--g8)" }}>BAYANIH<b style={{ color: "#C99A2E" }}>AI</b></span>
        <span className="bh-pill ai" style={{ fontSize: 10, padding: "3px 8px" }}><i />Magsasaka</span>
        <span style={{ flex: 1 }} />
        <ChainPill state={state} />
      </div>

      <div className="bh-st" style={st(1)}>
        <div className="bh-muted" style={{ fontSize: 13 }}>Magandang araw,</div>
        <div className="bh-it" style={{ fontSize: 26 }}>{listing.farmer}</div>
      </div>

      <div className="bh-hero bh-st" style={{ ...st(2), height: 168, padding: 18, flex: "none", position: "relative" }}>
        <div style={{ position: "absolute", left: 18, top: 18, zIndex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--g3)" }}>{status === "Released" ? "Kinita mo" : "Kikitain mo"}</div>
          <div className="bh-it" style={{ fontSize: 40, lineHeight: 1.1 }}>₱<Count to={earnings} /></div>
          <span style={{ display: "inline-block", marginTop: 8, background: "rgba(255,255,255,.16)", border: "1px solid rgba(255,255,255,.3)", borderRadius: 99, padding: "5px 11px", fontSize: 12, fontWeight: 800 }}>
            {times}x kumpara sa middleman
          </span>
        </div>
        <Produce crop={crop} w={126} className="bh-float" style={{ position: "absolute", right: 10, top: 24 }} />
        {status === "Released" && deal && <Confetti key={deal.dealId} top={60} />}
      </div>

      <div className="bh-card bh-st" style={{ ...st(3), padding: 14, display: "flex", gap: 12, alignItems: "center" }}>
        <div className="bh-cat on" style={{ margin: 0, flex: "none" }}><Produce crop={crop} w={36} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="bh-sec">
            <b style={{ fontSize: 15 }}>{listing.cropName} · {kgTotal} kilo</b>
            <span className={`bh-pill ${groupFull || status === "Released" ? "ok" : ""}`} style={{ fontSize: 10.5, padding: "3px 9px" }}><i />{pct}%</span>
          </div>
          <div className="bh-bar" style={{ marginTop: 8 }}><i style={{ width: `${status === "Released" ? 100 : pct}%` }} /></div>
          <div className="bh-muted" style={{ marginTop: 7, fontSize: 11.5 }}>{groupLine}</div>
        </div>
      </div>

      <div className="bh-card bh-st" style={{ ...st(4), padding: 14 }}>
        <div className="bh-sec">
          <b style={{ fontSize: 13.5 }}>Presyo ng ani mo</b>
          <span className="bh-pill ai" style={{ fontSize: 10.5, padding: "3px 9px" }}><i />{listing.priceSource === "gemini" ? "AI · Gemini" : "Rules"}</span>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {[
            { k: "Sa iyo", v: listing.farmerPricePerKg, c: "var(--g7)" },
            { k: "Middleman", v: listing.middlemanPricePerKg, c: "var(--mut)" },
            { k: "Mamimili", v: listing.buyerPricePerKg, c: "var(--or)" },
          ].map((x) => (
            <div key={x.k} style={{ flex: 1, background: "rgba(255,255,255,.6)", borderRadius: 14, padding: "8px 10px" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--mut)" }}>{x.k}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: x.c }}>{peso(x.v)}<small style={{ fontSize: 10.5, color: "var(--mut)" }}>/kg</small></div>
            </div>
          ))}
        </div>
        {listing.priceReason && <div style={{ marginTop: 8, fontSize: 12, fontStyle: "italic", color: "var(--hint)", lineHeight: 1.45 }}>{listing.priceReason}</div>}
      </div>

      <div className="bh-st" style={{ ...st(5), display: "flex", gap: 12, alignItems: "center", background: "linear-gradient(135deg,var(--g8),var(--g9))", color: "#fff", borderRadius: 20, padding: "14px 16px", flex: "none" }}>
        <span style={{ color: "var(--g3)" }}><LockIcon /></span>
        <div>
          <b style={{ display: "block", fontSize: 15 }}>{safe.title}</b>
          <span style={{ fontSize: 12.5, color: "var(--g3)", fontWeight: 600 }}>{safe.text}</span>
          {state.payments.length > 0 && (
            <span style={{ display: "block", marginTop: 6, fontSize: 11.5, color: "#fff", fontWeight: 700 }}>
              {state.payments.map((x) => `${x.method === "gcash" ? "GCash ✓AI" : x.method === "cash" ? "Cash" : "Wallet"} ${peso(x.amountPesos)}`).join(" · ")}
            </span>
          )}
        </div>
      </div>

      {!dealActive && (
        <button className="bh-btn pulse bh-st" style={{ ...st(6), flex: "none" }} onClick={openSheet}>
          <Icon d={ICONS.plus} /> {status === "Released" || failed ? "Mag-post ng bagong ani" : "Mag-post ng ani"}
        </button>
      )}
    </section>
  );

  // ---------------------------------------------------------------- payout tracker (Bayad)
  const steps = [
    { done: true, title: `Na-post ang ${kgTotal} kg ng ${listing.cropName.toLowerCase()}`, sub: `${peso(listing.farmerPricePerKg)}/kg para sa iyo · ${listing.priceSource === "gemini" ? "presyo mula sa AI" : "presyo mula sa rules"}` },
    { done: groupFull || !!deal, title: "Sumali ang mga kapitbahay", sub: `${p.buyers} mamimili sa ${deal?.pickup ?? "Brgy. Holy Spirit"}` },
    { done: !!deal, title: deal ? `Ginawa ng AI ang Deal #${deal.dealId} sa BSC` : "AI Deal Maker", sub: state.aiRunning && !deal ? "Sinusuri ng AI ngayon…" : "Hindi kayang galawin ng AI ang pera" },
    { done: status === "Funded" || status === "Released", title: "Buo na ang bayad sa escrow", sub: "Ligtas sa smart contract hanggang maihatid" },
    { done: status === "Released", title: "Naihatid · bayad ka na!", sub: deal && status === "Released" ? `${peso(deal.farmerReceived)} sa wallet mo` : "Kumpirmasyon ng barangay coordinator" },
  ];
  const truckAt = status === "Released" ? 100 : status === "Funded" ? 66 : deal ? 33 : 0;
  const title = status === "Released" ? "Bayad ka na!" : failed ? "Hindi natuloy" : status === "Funded" ? "Ihanda ang ani!" : deal ? "May deal na!" : "Nag-iipon ng mamimili";

  const bayadR = reveal("bayad", { alignItems: "center", textAlign: "center" });
  const bayad = (
    <section className={`bh-sc ${bayadR.className}`} style={bayadR.style}>
      <div className="bh-st" style={{ ...st(0), marginTop: 8, width: 84, height: 84, borderRadius: "50%", background: "var(--g1)", display: "flex", alignItems: "center", justifyContent: "center", animation: "bh-ring 2s infinite", flex: "none" }}>
        <Produce crop={crop} w={56} />
      </div>
      <div className="bh-it bh-st" style={{ ...st(1), fontSize: 24 }}>{title}</div>
      {failed ? (
        <div className="bh-card bh-st" style={{ ...st(2), width: "100%", padding: 16, textAlign: "left" }}>
          <b>Hindi napuno ang grupo bago ang deadline.</b>
          <div className="bh-muted" style={{ marginTop: 6 }}>Naibalik ng smart contract ang bayad sa mga mamimili. Puwede kang mag-post ulit ng ani.</div>
        </div>
      ) : (
        <Steps steps={steps} style={st(2)} />
      )}
      <Road at={truckAt} style={st(3)} />
      {status === "Released" && deal && (
        <div style={{ width: "100%", position: "relative", flex: "none" }}>
          <div className="bh-card" style={{ padding: 16, animation: "bh-pop .6s cubic-bezier(.34,1.56,.64,1) both" }}>
            <div style={{ fontSize: 12.5, color: "var(--mut)", fontWeight: 700 }}>Natanggap mo mula sa smart contract</div>
            <div className="bh-it" style={{ fontSize: 38, color: "var(--g7)" }}>₱<Count to={deal.farmerReceived} /></div>
            <div style={{ fontSize: 12.5, color: "var(--mut)", fontWeight: 600 }}>Middleman sana: {peso(middleman)} · Hauler +{peso(deal.haulerReceived)}</div>
          </div>
          <Confetti key={`b${deal.dealId}`} />
        </div>
      )}
      <TxProof state={state} style={st(4)} />
      <div style={{ flex: 1 }} />
      {!dealActive && (
        <button className="bh-btn pulse bh-st" style={{ ...st(5), flex: "none" }} onClick={openSheet}><Icon d={ICONS.plus} /> Mag-post ng bagong ani</button>
      )}
    </section>
  );

  // ---------------------------------------------------------------- buyers + profile
  const buyersR = reveal("buyers");
  const buyers = (
    <section className={`bh-sc ${buyersR.className}`} style={buyersR.style}>
      <div className="bh-it bh-st" style={{ ...st(0), fontSize: 24 }}>Mga mamimili</div>
      <div className="bh-muted bh-st" style={st(1)}>Ang mga kapitbahay ay nag-o-order nang sama-sama bawat barangay. Gagawa ang AI ng deal kapag sapat na para sa isang truck ({listing.minKg} kg).</div>
      <GroupsList state={state} onOpen={(pickup) => say(pickup)} />
    </section>
  );

  const profileR = reveal("profile");
  const profile = (
    <section className={`bh-sc ${profileR.className}`} style={profileR.style}>
      <div className="bh-it bh-st" style={{ ...st(0), fontSize: 24 }}>Profile</div>
      <div className="bh-card bh-st" style={{ ...st(1), padding: 16, display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ width: 48, height: 48, borderRadius: 16, background: "var(--g1)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--g7)" }}><UserIcon /></div>
        <div>
          <b>{listing.farmer}</b>
          <div className="bh-muted">Magsasaka · {listing.origin}</div>
        </div>
      </div>
      <div className="bh-card bh-st" style={{ ...st(2), padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <b>Paano ka kumikita</b>
        <div className="bh-muted">1. I-post ang ani mo. Ang AI ang magmumungkahi ng patas na presyo.</div>
        <div className="bh-muted">2. Sama-samang bibili ang mga kapitbahay. Ang bayad ay nakalaan sa smart contract.</div>
        <div className="bh-muted">3. Pagdating ng ani, ang smart contract mismo ang magbabayad sa iyo. Walang middleman.</div>
      </div>
      <div className="bh-card bh-st" style={{ ...st(3), padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
        <b>Blockchain</b>
        <div className="bh-muted">{state.chain.ok ? (state.chain.isLocal ? "Local test chain" : "BNB Smart Chain Testnet") : "Hindi konektado"}</div>
        {state.chain.contract && state.chain.explorer && (
          <a className="bh-muted" style={{ color: "var(--g7)", fontFamily: "ui-monospace, Consolas, monospace" }} href={`${state.chain.explorer}/address/${state.chain.contract}#code`} target="_blank" rel="noreferrer">
            Escrow: {state.chain.contract.slice(0, 8)}…{state.chain.contract.slice(-6)} ↗
          </a>
        )}
        <div className="bh-muted">Test wallets lang, walang totoong pera.</div>
      </div>
      <a href="/" className="bh-btn ghost bh-st" style={{ ...st(4), textDecoration: "none", flex: "none" }}>Buksan ang app ng mamimili →</a>
    </section>
  );

  const screens: Record<Screen, ReactNode> = { home, bayad, buyers, profile };
  const navTo = (n: Screen) => (e: MouseEvent) => go(n, e);

  return frame(
    <>
      {screens[scr]}
      <nav className="bh-nav">
        <button className={`bh-nv ${scr === "home" ? "on" : ""}`} onClick={navTo("home")}><Icon d={ICONS.home} />Home</button>
        <button className={`bh-nv ${scr === "bayad" ? "on" : ""}`} onClick={navTo("bayad")}><LockIcon />Bayad</button>
        <button className="bh-fab" aria-label="Mag-post ng ani" onClick={openSheet}><Icon d={ICONS.plus} />Ani</button>
        <button className={`bh-nv ${scr === "buyers" ? "on" : ""}`} onClick={navTo("buyers")}><PeopleIcon />Mamimili</button>
        <button className={`bh-nv ${scr === "profile" ? "on" : ""}`} onClick={navTo("profile")}><UserIcon />Profile</button>
      </nav>
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
            go("home");
          }}
        />
      )}
    </>
  );
}
