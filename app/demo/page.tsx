"use client";
import { useState } from "react";
import type { ReactNode } from "react";
import { peso, useAppState } from "@/lib/useAppState";

// What the presenter sees while an action runs (buttons are locked until it finishes).
const BUSY_TEXT: Record<string, string> = {
  "price-suggest": "AI is pricing the harvest…",
  "post-harvest": "Posting the harvest…",
  order: "Joining the group…",
  "deal-maker": "AI Deal Maker is reviewing the groups…",
  pay: "Locking payment in the escrow contract…",
  confirm: "Releasing payment on-chain…",
  "fast-forward": "Fast-forwarding the chain clock…",
  refund: "Returning money to the buyers…",
  reset: "Resetting the demo…",
};

// Top-level so React keeps the same element between polls (a component defined inside the page remounts every refresh).
function StepCard({ n, title, tag, s, children }: { n: number; title: string; tag?: string; s: string; children: ReactNode }) {
  return (
    <div className={`step ${s}`}>
      <span className="n">{s === "done" ? "✓" : n}</span>
      <h2>
        {title}
        {s === "active" && <span className="tag now">Next</span>}
        {tag && <span className="tag">{tag}</span>}
      </h2>
      {children}
    </div>
  );
}

// Presenter console: drive the story step by step, with both phones live on the right.
export default function DemoPage() {
  const { state, busy, error, act } = useAppState(1500);
  const [crop, setCrop] = useState("carrots");
  const [kg, setKg] = useState(150);
  if (!state) {
    return (
      <main className="demo">
        <div className="toast"><span className="spinner" /> {error ?? "Loading…"}</div>
      </main>
    );
  }

  const { chain, deal, listing } = state;
  // Neighbors' pre-orders only (excludes your own order), so the copy stays right after you join.
  const hs = state.groups.find((g) => g.pickup === "Brgy. Holy Spirit");
  const neighbors = hs && { buyerCount: hs.buyerCount - (hs.youKg ? 1 : 0), totalKg: hs.totalKg - hs.youKg };
  const status = deal?.chain?.status;
  const refundable = !!deal?.chain?.refundable;
  const txUrl = (hash: string) => (chain.explorer ? `${chain.explorer}/tx/${hash}` : "");
  const secondsLeft = (t?: number) => (t ? Math.max(0, t - chain.now) : 0);

  // Which step the presenter should do next (1-4 happy path, 5 refund path).
  const current = !state.you ? 1 : !deal ? 2 : status === "Open" && refundable ? 5 : status === "Open" ? 3 : status === "Funded" ? 4 : 6;
  const stepState = (n: number) => {
    if (n === 5) return status === "Refunded" ? "done" : current === 5 ? "active" : "";
    if (status === "Refunded" && n >= 3) return "";
    return current > n ? "done" : current === n ? "active" : "";
  };

  const b = (action: string, label: string, extra: Record<string, unknown> = {}, cls = "btn") => (
    <button className={cls} disabled={!!busy} onClick={() => act(action, extra)}>
      {busy === action && <span className="spinner" />}
      {label}
    </button>
  );


  return (
    <main className="demo">
      <header className="topbar">
        <div className="logo">
          <img src="/logo.svg" alt="" />
          <div>
            <strong>BAYANIH<b>AI</b></strong>
            <span>Presenter console</span>
          </div>
        </div>
        <div className="spacer" />
        {chain.ok ? (
          <div className="chainchip" title={chain.contract}>
            <span className="dot" />
            {chain.isLocal ? "Local chain" : "BSC Testnet"}
            <span className="sep" />
            <em>Escrow</em> {peso(chain.escrowPesos)}
            <span className="sep" />
            {chain.contract && <em className="meta">{chain.contract.slice(0, 6)}…{chain.contract.slice(-4)}</em>}
          </div>
        ) : (
          <div className="chainchip"><span className="dot off" /> Not connected</div>
        )}
        {b("reset", "Reset demo", {}, "btn warn")}
      </header>

      <div className="layout">
        <section className="panel">
          {!chain.ok && <div className="alert">Blockchain not connected: {chain.error}</div>}
          {error && <div className="alert">{error}</div>}

          <StepCard s={stepState(0)} n={0} title="Farmer posts harvest" tag="AI Fair Pricing">
            <p>
              Now: <b>{listing.minKg} kg {listing.cropName}</b> · farmer gets <b>{peso(listing.farmerPricePerKg)}/kg</b>, buyers pay{" "}
              <b>{peso(listing.buyerPricePerKg)}/kg</b> (market {peso(listing.marketPricePerKg)}, middleman {peso(listing.middlemanPricePerKg)}) · priced by{" "}
              {listing.priceSource === "gemini" ? "Gemini" : "rules"}.
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
          </StepCard>

          <StepCard s={stepState(1)} n={1} title="Buyer joins the group">
            <p>
              <b>{neighbors?.buyerCount ?? 0} neighbors</b> in Brgy. Holy Spirit pre-ordered <b>{neighbors?.totalKg ?? 0} kg</b>. The truck needs {listing.minKg} kg. Join here
              or from the buyer phone.
            </p>
            <div className="row">{b("order", state.you ? `Joined with ${state.you.kg} kg` : "Join with 5 kg", { kg: 5 }, current === 1 ? "btn primary" : "btn")}</div>
          </StepCard>

          <StepCard s={stepState(2)} n={2} title="AI Deal Maker" tag="AI → BSC">
            <p>Rules check the math, Gemini decides and explains, then the AI wallet creates the deal on-chain.</p>
            <div className="row">
              {b("deal-maker", "Run AI Deal Maker", { scenario: "success" }, current === 2 ? "btn primary" : "btn")}
              {b("deal-maker", "Run refund scenario (90s deadline)", { scenario: "fail" })}
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
          </StepCard>

          <StepCard s={stepState(3)} n={3} title="Buyers lock payment in escrow" tag="Smart contract">
            <p>The money goes to the smart contract, not to the farmer.</p>
            <div className="row">
              {b("pay", "You pay", { who: "you" }, current === 3 && !(deal && deal.youLockedKg > 0) ? "btn primary" : "btn")}
              {b("pay", "Neighbors pay", { who: "neighbors" }, current === 3 && deal && deal.youLockedKg > 0 ? "btn primary" : "btn")}
              {deal?.chain && (
                <span className="status">
                  Deal #{deal.dealId} · {status} · {deal.chain.fundedKg}/{deal.chain.targetKg} kg
                  {status === "Open" && !refundable && ` · ${secondsLeft(deal.chain.fundingDeadline)}s left`}
                </span>
              )}
            </div>
          </StepCard>

          <StepCard s={stepState(4)} n={4} title="Delivery confirmed → farmer paid">
            <p>Only the barangay coordinator can confirm. The AI cannot release money.</p>
            <div className="row">
              {b("confirm", "Coordinator confirms delivery", {}, current === 4 ? "btn primary" : "btn")}
              {status === "Released" && deal && (
                <span className="status">
                  Farmer +{peso(deal.farmerReceived)} · Hauler +{peso(deal.haulerReceived)}
                </span>
              )}
            </div>
          </StepCard>

          <StepCard s={stepState(5)} n={5} title="Or: group fails → buyers refunded" tag="Refund path">
            <p>If the group doesn&apos;t fill before the deadline, buyers pull their money back.</p>
            <div className="row">
              {chain.isLocal && b("fast-forward", "Fast-forward 3 min", { seconds: 180 })}
              {b("refund", "Claim refunds", {}, current === 5 ? "btn primary" : "btn warn")}
              {refundable && <span className="status">Refundable now</span>}
            </div>
          </StepCard>

          {deal && deal.txs.length > 0 && (
            <div className="step">
              <span className="n">⛓</span>
              <h2>On-chain transactions</h2>
              <ul className="txs">
                {deal.txs.map((t) => (
                  <li key={t.hash}>
                    <span className="ico">✓</span>
                    {t.label}
                    {txUrl(t.hash) ? (
                      <a href={txUrl(t.hash)} target="_blank" rel="noreferrer" className="meta">{t.hash.slice(0, 14)}…</a>
                    ) : (
                      <span className="meta">{t.hash.slice(0, 14)}…</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="step">
            <span className="n">≡</span>
            <h2>Activity</h2>
            <ul className="log">
              {state.log.map((l, i) => (
                <li key={i}>{l.text}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="phones">
          <figure>
            <div className="frame bezel"><iframe src="/?embed=1" title="Buyer app" /></div>
            <figcaption>Mamimili <span>· Buyer</span></figcaption>
          </figure>
          <figure>
            <div className="frame bezel"><iframe src="/farmer?embed=1" title="Farmer app" /></div>
            <figcaption>Magsasaka <span>· Farmer</span></figcaption>
          </figure>
        </section>
      </div>

      {busy && (
        <div className="toast" role="status">
          <span className="spinner" /> {BUSY_TEXT[busy] ?? "Working…"}
        </div>
      )}
    </main>
  );
}
