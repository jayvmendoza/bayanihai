"use client";
import { useState } from "react";
import { peso, useAppState } from "@/lib/useAppState";

// Presenter control panel: drive the whole story step by step, with both phones live on the right.
export default function DemoPage() {
  const { state, busy, error, act } = useAppState(1500);
  const [crop, setCrop] = useState("carrots");
  const [kg, setKg] = useState(150);
  if (!state) return <main className="demo"><p>Loading…</p></main>;

  const { chain, deal, listing } = state;
  // Neighbors' pre-orders only (excludes your own order), so the copy stays right after you join.
  const hs = state.groups.find((g) => g.pickup === "Brgy. Holy Spirit");
  const neighbors = hs && { buyerCount: hs.buyerCount - (hs.youKg ? 1 : 0), totalKg: hs.totalKg - hs.youKg };
  const status = deal?.chain?.status;
  const txUrl = (hash: string) => (chain.explorer ? `${chain.explorer}/tx/${hash}` : "");
  const secondsLeft = (t?: number) => (t ? Math.max(0, t - chain.now) : 0);
  const b = (action: string, label: string, extra: Record<string, unknown> = {}, cls = "btn") => (
    <button className={cls} disabled={!!busy} onClick={() => act(action, extra)}>
      {busy === action ? "Working…" : label}
    </button>
  );

  return (
    <main className="demo">
      <section className="panel">
        <h1>
          <img src="/logo.svg" alt="" /> BAYANIHAI demo
        </h1>

        <div className="step">
          <h2>Blockchain</h2>
          {chain.ok ? (
            <p className="meta">
              {chain.network} · escrow contract {chain.contract} · holding {peso(chain.escrowPesos)}
            </p>
          ) : (
            <p className="err">Not connected: {chain.error}</p>
          )}
          {error && <p className="err">{error}</p>}
        </div>

        <div className="step">
          <h2><span className="n">0</span> Farmer posts harvest · AI Fair Pricing</h2>
          <p>
            Now: <b>{listing.minKg} kg {listing.cropName}</b> at {peso(listing.farmerPricePerKg)}/kg to the farmer, {peso(listing.buyerPricePerKg)}/kg for buyers
            (market {peso(listing.marketPricePerKg)}, middleman {peso(listing.middlemanPricePerKg)}) · priced by {listing.priceSource === "gemini" ? "Gemini" : "rules"}.
          </p>
          <div className="row">
            <select value={crop} onChange={(e) => setCrop(e.target.value)} className="btn">
              {state.crops.map((c) => (
                <option key={c.key} value={c.key}>{c.name}</option>
              ))}
            </select>
            <select value={kg} onChange={(e) => setKg(Number(e.target.value))} className="btn">
              {[150, 200, 300].map((n) => (
                <option key={n} value={n}>{n} kg</option>
              ))}
            </select>
            {b("price-suggest", "Ask AI for a fair price", { crop, kg })}
            {state.priceSuggestion && b("post-harvest", `Post at ${peso(state.priceSuggestion.farmerPricePerKg)}/kg`, {}, "btn primary")}
          </div>
          {state.priceSuggestion && (
            <div className="review">
              <span className="badge src">{state.priceSuggestion.source === "gemini" ? "Gemini" : "Rules only"}</span>
              <b>{state.priceSuggestion.kg} kg {state.priceSuggestion.cropName}</b> · farmer {peso(state.priceSuggestion.farmerPricePerKg)}/kg · buyers{" "}
              {peso(state.priceSuggestion.buyerPricePerKg)}/kg
              <div><i>{state.priceSuggestion.reason_tl}</i></div>
            </div>
          )}
        </div>

        <div className="step">
          <h2><span className="n">1</span> Buyer joins the group</h2>
          <p>
            {neighbors?.buyerCount ?? 0} neighbors in Brgy. Holy Spirit pre-ordered {neighbors?.totalKg ?? 0} kg. The truck needs {listing.minKg} kg. Join from the buyer
            phone, or here:
          </p>
          <div className="row">
            {b("order", state.you ? `Joined with ${state.you.kg} kg` : "Join with 5 kg", { kg: 5 })}
          </div>
        </div>

        <div className="step">
          <h2><span className="n">2</span> AI Deal Maker</h2>
          <p>Rules check the math, Gemini decides and explains, then the AI wallet creates the deal on-chain.</p>
          <div className="row">
            {b("deal-maker", "Run AI Deal Maker", { scenario: "success" }, "btn primary")}
            {b("deal-maker", "Run (refund scenario: 90s deadline)", { scenario: "fail" })}
          </div>
          {state.groups.map((g) =>
            g.review ? (
              <div className="review" key={g.pickup}>
                <span className={`badge ${g.review.ai.create_deal ? "yes" : "no"}`}>{g.review.ai.create_deal ? "CREATE DEAL" : "WAIT"}</span>
                <span className="badge src">{g.review.ai.source === "gemini" ? "Gemini" : "Rules only"}</span>
                <b>{g.pickup}</b> · {g.totalKg} kg · {g.buyerCount} buyers
                <div>{g.review.ai.reason}</div>
                <div><i>{g.review.ai.summary_tl}</i></div>
              </div>
            ) : null
          )}
        </div>

        <div className="step">
          <h2><span className="n">3</span> Buyers lock payment in escrow</h2>
          <p>Money goes to the smart contract, not to the farmer.</p>
          <div className="row">
            {b("pay", "You pay", { who: "you" })}
            {b("pay", "Neighbors pay", { who: "neighbors" })}
            {deal?.chain && (
              <span className="status">
                Deal #{deal.dealId}: {status} · {deal.chain.fundedKg}/{deal.chain.targetKg} kg
                {status === "Open" && ` · ${secondsLeft(deal.chain.fundingDeadline)}s left`}
              </span>
            )}
          </div>
        </div>

        <div className="step">
          <h2><span className="n">4</span> Delivery confirmed → farmer paid</h2>
          <p>Only the barangay coordinator can confirm. The AI cannot release money.</p>
          <div className="row">
            {b("confirm", "Coordinator confirms delivery", {}, "btn primary")}
            {status === "Released" && deal && (
              <span className="status">
                Farmer +{peso(deal.farmerReceived)} · Hauler +{peso(deal.haulerReceived)}
              </span>
            )}
          </div>
        </div>

        <div className="step">
          <h2><span className="n">5</span> Or: group fails → buyers refunded</h2>
          <p>If the group doesn&apos;t fill before the deadline, buyers pull their money back.</p>
          <div className="row">
            {chain.isLocal && b("fast-forward", "Fast-forward 3 min", { seconds: 180 })}
            {b("refund", "Claim refunds", {}, "btn warn")}
            {deal?.chain?.refundable && <span className="status">Refundable now</span>}
          </div>
        </div>

        {deal && deal.txs.length > 0 && (
          <div className="step">
            <h2>On-chain transactions</h2>
            <ul className="log">
              {deal.txs.map((t) => (
                <li key={t.hash}>
                  {t.label}:{" "}
                  {txUrl(t.hash) ? (
                    <a href={txUrl(t.hash)} target="_blank" rel="noreferrer" className="meta">{t.hash.slice(0, 18)}…</a>
                  ) : (
                    <span className="meta">{t.hash.slice(0, 18)}…</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="step">
          <h2>Activity</h2>
          <ul className="log">
            {state.log.map((l, i) => (
              <li key={i}>{l.text}</li>
            ))}
          </ul>
          <div className="row" style={{ marginTop: 10 }}>
            {b("reset", "Reset demo", {}, "btn warn")}
          </div>
        </div>
      </section>

      <section className="phones">
        <figure>
          <div className="frame"><iframe src="/?embed=1" title="Buyer app" /></div>
          <figcaption>Mamimili (Buyer)</figcaption>
        </figure>
        <figure>
          <div className="frame"><iframe src="/farmer?embed=1" title="Farmer app" /></div>
          <figcaption>Magsasaka (Farmer)</figcaption>
        </figure>
      </section>
    </main>
  );
}
