"use client";
import { useState } from "react";
import { Bar, CropArt, LockIcon, Phone } from "@/components/Phone";
import { Stage } from "@/components/Stage";
import { peso, useAppState } from "@/lib/useAppState";

// Buyer app (Mamimili). Plain Tagalog, one action at a time.
export default function BuyerPage() {
  const { state, busy, error, act } = useAppState();
  const [kg, setKg] = useState(5);

  if (!state) return <Stage><Phone><p className="sub">Naglo-load…</p></Phone></Stage>;

  const { listing, deal, you } = state;
  const group = state.groups.find((g) => g.pickup === "Brgy. Holy Spirit");
  const status = deal?.chain?.status;
  const youKg = you?.kg ?? 0;
  const youPay = youKg * listing.buyerPricePerKg;
  const youRefunded = deal?.txs.some((t) => t.label === "You claimed your refund");

  let progressLabel = `${group?.buyerCount ?? 0} na ang sumali`;
  let progress: { value: number; max: number } = { value: group?.totalKg ?? 0, max: listing.minKg };
  if (deal?.chain) {
    progressLabel = status === "Open" ? `${deal.chain.fundedKg} / ${deal.chain.targetKg} kilo ang bayad na` : `${deal.buyerCount} na ang sumali`;
    progress = { value: deal.chain.fundedKg, max: deal.chain.targetKg };
  }

  // What the buyer should see and do right now.
  let message: React.ReactNode = null;
  let action: React.ReactNode = null;

  if (!you) {
    action = (
      <>
        <div className="chips">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} className={n === kg ? "on" : ""} onClick={() => setKg(n)}>
              {n} kg
            </button>
          ))}
        </div>
        <button className="cta" disabled={!!busy} onClick={() => act("order", { kg })}>
          Sumali
          <small>{kg} kilo · {peso(kg * listing.buyerPricePerKg)} · wala pang bayad</small>
        </button>
      </>
    );
  } else if (!deal) {
    const review = group?.review;
    message = (
      <div className={review?.ai.create_deal === false ? "note" : "ok"}>
        {review ? review.ai.summary_tl : `Nakasali ka na (${youKg} kilo). Hinihintay ang AI Deal Maker.`}
      </div>
    );
  } else if (status === "Open" && deal.youLockedKg === 0 && !deal.chain?.refundable) {
    message = <div className="ok">{deal.ai.summary_tl}</div>;
    action = (
      <button className="cta" disabled={!!busy} onClick={() => act("pay", { who: "you" })}>
        Magbayad {peso(youPay)}
        <small>Itatago muna sa escrow, hindi pa sa magsasaka</small>
      </button>
    );
  } else if (deal.chain?.refundable && deal.youLockedKg > 0) {
    message = <div className="note">Hindi natuloy ang grupo. Pwede mo nang kunin ang refund mo.</div>;
    action = (
      <button className="cta" disabled={!!busy} onClick={() => act("refund")}>
        Kunin ang refund
        <small>{peso(deal.youLockedKg * listing.buyerPricePerKg)} babalik sa iyo</small>
      </button>
    );
  } else if (status === "Refunded" || youRefunded) {
    message = <div className="ok">Naibalik na ang {peso(youPay)} mo. Walang nawala.</div>;
  } else if (status === "Open") {
    message = <div className="ok">Nakalaan na ang bayad mo. Hinihintay mapuno ang grupo.</div>;
  } else if (status === "Funded") {
    message = <div className="ok">Buo na ang grupo! Paparating na ang ani.</div>;
  } else if (status === "Released") {
    message = <div className="ok">Dumating na ang {listing.cropName.toLowerCase()}! Nabayaran na si {listing.farmer}.</div>;
  }

  return (
    <Stage>
      <Phone>
        <div className="card">
          <div className="hero">
            <CropArt crop={listing.crop} />
          </div>
          <div className="title">{listing.cropName}</div>
          <p className="sub">
            Mula kay {listing.farmer}, {listing.origin}
          </p>
          <div className="price">
            {peso(listing.buyerPricePerKg)} <small>/ kilo</small>
          </div>
        </div>

        <div className="card">
          <div className="big">{progressLabel}</div>
          <Bar value={progress.value} max={progress.max} />
        </div>

        <div className="safe">
          <LockIcon />
          <div>
            <b>Ligtas ang bayad mo</b>
            <p>Ibabalik kung hindi dumating.</p>
          </div>
        </div>

        {message}
        {error && <div className="err">{error}</div>}
        {action}
      </Phone>
    </Stage>
  );
}
