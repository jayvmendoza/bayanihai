"use client";
import { Bar, LockIcon, Phone } from "@/components/Phone";
import { Stage } from "@/components/Stage";
import { peso, useAppState } from "@/lib/useAppState";

// Farmer app (Magsasaka). Shows what he will earn and whether the money is already set aside.
export default function FarmerPage() {
  const { state } = useAppState();
  if (!state) return <Stage><Phone><p className="sub">Naglo-load…</p></Phone></Stage>;

  const { listing, deal } = state;
  const status = deal?.chain?.status;
  const kg = deal?.chain?.targetKg ?? listing.minKg;
  const earnings = kg * listing.farmerPricePerKg;
  const middleman = kg * listing.middlemanPricePerKg;
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

        <div className="card">
          <div className="big">
            {listing.crop} · {kg} kilo
          </div>
          <Bar value={deal?.chain ? funded : 0} max={kg} />
          <p className="sub" style={{ marginTop: 10 }}>
            {status === "Funded" || status === "Released" ? "✓ " : ""}
            {groupLine}
          </p>
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
      </Phone>
    </Stage>
  );
}
