"use client";
import { useState } from "react";
import { Bar, CropArt, LockIcon, Phone } from "@/components/Phone";
import { Stage } from "@/components/Stage";
import { peso, useAppState } from "@/lib/useAppState";

const KG_CHOICES = [150, 200, 300];

// Farmer app (Magsasaka): post a harvest with an AI-suggested fair price, then watch the payment.
export default function FarmerPage() {
  const { state, busy, error, act } = useAppState();
  const [posting, setPosting] = useState(false);
  const [crop, setCrop] = useState("carrots");
  const [kg, setKg] = useState(150);

  if (!state) return <Stage><Phone><p className="sub">Naglo-load…</p></Phone></Stage>;

  const { listing, deal, priceSuggestion: sug } = state;
  const status = deal?.chain?.status;
  const dealActive = status === "Open" || status === "Funded";

  // ---------------------------------------------------------------- Post Harvest mode
  if (posting && !dealActive) {
    const sugMatches = sug && sug.crop === crop && sug.kg === kg;
    return (
      <Stage>
        <Phone>
          <div className="hello">
            Mag-post ng ani,<b>{listing.farmer}</b>
          </div>

          <div className="card">
            <div className="big">Anong ani?</div>
            <div className="chips wrap" style={{ marginTop: 10 }}>
              {state.crops.map((c) => (
                <button key={c.key} className={c.key === crop ? "on" : ""} onClick={() => setCrop(c.key)}>
                  {c.name}
                </button>
              ))}
            </div>
            <div className="big" style={{ marginTop: 14 }}>Ilang kilo?</div>
            <div className="chips" style={{ marginTop: 10 }}>
              {KG_CHOICES.map((n) => (
                <button key={n} className={n === kg ? "on" : ""} onClick={() => setKg(n)}>
                  {n} kg
                </button>
              ))}
            </div>
          </div>

          {sugMatches ? (
            <div className="earn">
              <div className="l">
                Patas na presyo mula sa AI <span className="pill src">{sug.source === "gemini" ? "Gemini" : "Rules"}</span>
              </div>
              <div className="v">{peso(sug.farmerPricePerKg)}<small> / kilo</small></div>
              <p className="why">{sug.reason_tl}</p>
              <p className="cmp">
                Middleman: {peso(sug.middlemanPricePerKg)} · Mamimili: {peso(sug.buyerPricePerKg)} (palengke {peso(sug.marketPricePerKg)})
              </p>
            </div>
          ) : (
            <button className="btn-ai" disabled={!!busy} onClick={() => act("price-suggest", { crop, kg })}>
              {busy === "price-suggest" ? "Nag-iisip ang AI…" : "✦ Itanong sa AI ang patas na presyo"}
            </button>
          )}

          {error && <div className="err">{error}</div>}

          {sugMatches ? (
            <button className="cta" disabled={!!busy} onClick={async () => { await act("post-harvest"); setPosting(false); }}>
              I-post ang ani
              <small>{kg} kilo · kikitain mo {peso(kg * sug.farmerPricePerKg)}</small>
            </button>
          ) : (
            <button className="link" onClick={() => setPosting(false)}>Bumalik</button>
          )}
        </Phone>
      </Stage>
    );
  }

  // ---------------------------------------------------------------- Status mode
  const kgTotal = deal?.chain?.targetKg ?? listing.minKg;
  const earnings = kgTotal * listing.farmerPricePerKg;
  const middleman = kgTotal * listing.middlemanPricePerKg;
  const times = (earnings / middleman).toFixed(1).replace(/\.0$/, "");
  const funded = deal?.chain?.fundedKg ?? 0;

  let groupLine = "Wala pang grupo. Nag-iipon pa ng mamimili.";
  if (status === "Open") groupLine = deal?.chain?.refundable ? "Hindi napuno ang grupo." : "Nag-iipon ng bayad ang mga mamimili.";
  if (status === "Funded" || status === "Released") groupLine = "Buo na ang grupo";
  if (status === "Refunded") groupLine = "Hindi natuloy ang grupo.";

  let safe = { title: "Wala pang nakalaang bayad", text: "Lalabas dito kapag nagbayad na ang mga mamimili." };
  if (status === "Open" && funded > 0) safe = { title: `Nakalaan na ang ${peso(funded * listing.buyerPricePerKg)}`, text: "Hinihintay pang mapuno ang grupo." };
  if (status === "Funded") safe = { title: "Nakalaan na ang bayad", text: "Matatanggap mo pagdating ng ani." };
  if (status === "Released") safe = { title: `Bayad na! ${peso(deal!.farmerReceived)}`, text: "Naipadala na sa wallet mo." };
  if (status === "Refunded" || (status === "Open" && deal?.chain?.refundable))
    safe = { title: "Naibalik sa mga mamimili", text: "Walang nadaya. Subukan ulit sa susunod na ani." };

  return (
    <Stage>
      <Phone>
        <div className="hello">
          Magandang araw,<b>{listing.farmer}</b>
        </div>

        <div className="earn">
          <div className="l">{status === "Released" ? "Kinita mo" : "Kikitain mo"}</div>
          <div className="v">{peso(earnings)}</div>
          <span className="pill">{times}x kumpara sa middleman</span>
        </div>

        <div className="card row-card">
          <CropArt crop={listing.crop} size={54} />
          <div style={{ flex: 1 }}>
            <div className="big">
              {listing.cropName} · {kgTotal} kilo
            </div>
            <Bar value={deal?.chain ? funded : 0} max={kgTotal} />
            <p className="sub" style={{ marginTop: 8 }}>
              {status === "Funded" || status === "Released" ? "✓ " : ""}
              {groupLine}
            </p>
          </div>
        </div>

        <div className="safe">
          <LockIcon />
          <div>
            <b>{safe.title}</b>
            <p>{safe.text}</p>
          </div>
        </div>

        {status === "Funded" && (
          <button className="cta" type="button">
            Ihanda ang ani
          </button>
        )}
        {!dealActive && (
          <button className="cta" onClick={() => setPosting(true)}>
            + Mag-post ng ani
          </button>
        )}
      </Phone>
    </Stage>
  );
}
