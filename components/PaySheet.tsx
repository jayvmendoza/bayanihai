"use client";
// Buyer payment options: GCash (AI reads the receipt), cash to the barangay coordinator, or a crypto wallet.
// Whatever the method, the money ends up locked in the same escrow contract on BNB Smart Chain.
import { useEffect, useRef, useState } from "react";
import { ICONS, Icon } from "@/components/bh";
import { peso } from "@/lib/useAppState";
import type { AppState } from "@/lib/types";

type Method = "gcash" | "cash" | "wallet";

// The last generated demo receipt, kept for this browser tab (survives reloads) so you can show the "already used" check.
const DEMO_KEY = "bh-last-demo-receipt";
function getLastDemo(): string | null {
  try {
    return sessionStorage.getItem(DEMO_KEY);
  } catch {
    return null;
  }
}
function setLastDemo(v: string) {
  try {
    sessionStorage.setItem(DEMO_KEY, v);
  } catch {
    /* storage full or blocked: the button just won't show */
  }
}

/** Downscales a photo/screenshot to a small JPEG so it uploads fast on mobile data. */
async function compress(file: Blob): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1100 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

/** A clearly-labelled DEMO e-wallet receipt (not a real GCash receipt) for testing the AI check. */
function demoReceipt(amount: number): string {
  const c = document.createElement("canvas");
  c.width = 720;
  c.height = 1000;
  const g = c.getContext("2d")!;
  const ref = Array.from({ length: 13 }, () => Math.floor(Math.random() * 10)).join("");
  const now = new Date();
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 720, 1000);
  g.fillStyle = "#2b3a4a";
  g.fillRect(0, 0, 720, 150);
  g.fillStyle = "#fff";
  g.font = "bold 40px Arial";
  g.fillText("e-Wallet Payment Receipt", 40, 75);
  g.font = "24px Arial";
  g.fillText("DEMO ONLY · HINDI TUNAY NA BAYAD", 40, 120);
  g.fillStyle = "#1f9d52";
  g.beginPath();
  g.arc(360, 250, 52, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#fff";
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(335, 252);
  g.lineTo(354, 272);
  g.lineTo(388, 232);
  g.stroke();
  g.fillStyle = "#1b2430";
  g.textAlign = "center";
  g.font = "bold 34px Arial";
  g.fillText("Sent successfully", 360, 360);
  g.font = "bold 72px Arial";
  g.fillText(`PHP ${amount.toLocaleString("en-PH")}.00`, 360, 460);
  g.textAlign = "left";
  const rows: [string, string][] = [
    ["Sent to", "BAYANIHAI Escrow (demo)"],
    ["Account", "0900 000 0000"],
    ["Amount", `PHP ${amount.toLocaleString("en-PH")}.00`],
    ["Ref. No.", `${ref.slice(0, 4)} ${ref.slice(4, 7)} ${ref.slice(7)}`],
    ["Date", now.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })],
    ["Time", now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })],
  ];
  rows.forEach(([k, v], i) => {
    const y = 560 + i * 62;
    g.fillStyle = "#6b7785";
    g.font = "28px Arial";
    g.fillText(k, 50, y);
    g.fillStyle = "#1b2430";
    g.font = "bold 28px Arial";
    g.textAlign = "right";
    g.fillText(v, 670, y);
    g.textAlign = "left";
    g.strokeStyle = "#e6eaee";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(50, y + 22);
    g.lineTo(670, y + 22);
    g.stroke();
  });
  return c.toDataURL("image/jpeg", 0.9);
}

export function PaySheet({
  state,
  busy,
  act,
  onClose,
  onDone,
}: {
  state: AppState;
  busy: string | null;
  act: (a: string, x?: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [method, setMethod] = useState<Method>("gcash");
  const [image, setImage] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const amount = (state.you?.kg ?? 0) * state.listing.buyerPricePerKg;
  const check = tried ? state.lastReceipt : null;
  const [lastDemo] = useState<string | null>(() => getLastDemo());

  // Close as soon as the escrow shows the buyer's payment (any method).
  const lockedKg = state.deal?.youLockedKg ?? 0;
  useEffect(() => {
    if (lockedKg > 0) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedKg]);

  const submitGcash = async () => {
    if (!image) return;
    setTried(true);
    await act("pay-gcash", { image });
  };

  const options: { k: Method; title: string; sub: string; tag?: string }[] = [
    { k: "gcash", title: "GCash", sub: "I-upload ang resibo, babasahin ng AI", tag: "AI-verified" },
    { k: "cash", title: "Cash sa coordinator", sub: "Iabot sa barangay coordinator" },
    { k: "wallet", title: "Crypto wallet", sub: "Direkta mula sa wallet (tBNB)" },
  ];

  return (
    <>
      <div className="bh-shade" onClick={onClose} />
      <div className="bh-sheet" role="dialog" aria-label="Magbayad">
        <div className="bh-grab" />
        <div className="bh-sec">
          <div>
            <div className="bh-it" style={{ fontSize: 22 }}>Magbayad {peso(amount)}</div>
            <div className="bh-muted">{state.you?.kg} kilo ng {state.listing.cropName} · ligtas sa escrow hanggang dumating</div>
          </div>
          <button className="bh-back" aria-label="Isara" onClick={onClose}><Icon d={ICONS.close} /></button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {options.map((o) => (
            <button key={o.k} className={`bh-crop ${method === o.k ? "on" : ""}`} style={{ flexDirection: "row", justifyContent: "flex-start", gap: 12, padding: "12px 14px", textAlign: "left" }} onClick={() => setMethod(o.k)}>
              <span style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${method === o.k ? "var(--g5)" : "#b9c4bd"}`, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                {method === o.k && <i style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--g5)" }} />}
              </span>
              <span style={{ flex: 1 }}>
                <b style={{ fontSize: 14, display: "block" }}>{o.title}</b>
                <span className="bh-muted" style={{ fontSize: 11.5 }}>{o.sub}</span>
              </span>
              {o.tag && <span className="bh-pill ai" style={{ fontSize: 10, padding: "3px 8px" }}><i />{o.tag}</span>}
            </button>
          ))}
        </div>

        {method === "gcash" && (
          <>
            <div className="bh-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              <b style={{ fontSize: 13.5 }}>1. Ipadala ang {peso(amount)} sa GCash</b>
              <div className="bh-muted">BAYANIHAI Escrow · <b>0900 000 0000</b> <span style={{ fontSize: 11 }}>(demo number)</span></div>
              <b style={{ fontSize: 13.5, marginTop: 6 }}>2. I-upload ang screenshot ng resibo</b>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="bh-chip" onClick={() => fileRef.current?.click()}>Pumili ng larawan</button>
                <button className="bh-chip" onClick={() => { const r = demoReceipt(amount); setLastDemo(r); setImage(r); setTried(false); }}>Demo resibo</button>
                {lastDemo && image !== lastDemo && (
                  <button className="bh-chip" onClick={() => { setImage(lastDemo); setTried(false); }}>Ulitin ang huling resibo</button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setImage(await compress(f)); setTried(false); } e.target.value = ""; }} />
              {image && <img src={image} alt="Resibo" style={{ width: 96, borderRadius: 10, border: "1px solid var(--line)", marginTop: 4 }} />}
            </div>

            {check && (
              <div className="bh-card" style={{ padding: 14, borderColor: check.ok ? "rgba(31,157,82,.5)" : "rgba(226,75,26,.5)" }}>
                <div className="bh-sec">
                  <b style={{ fontSize: 13.5 }}>Sinuri ng AI ang resibo</b>
                  <span className={`bh-pill ${check.ok ? "ok" : ""}`} style={{ fontSize: 10.5, padding: "3px 9px" }}><i />{check.ok ? "Tanggap" : "Hindi tanggap"}</span>
                </div>
                <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
                  {check.checks.map((c) => (
                    <div key={c.label} style={{ fontSize: 12.5, fontWeight: 600, color: c.ok ? "var(--g7)" : "var(--redink)" }}>{c.ok ? "✓" : "✗"} {c.label}</div>
                  ))}
                </div>
                <div style={{ marginTop: 8, fontSize: 12.5, fontStyle: "italic", color: "var(--hint)" }}>{check.summary_tl}</div>
              </div>
            )}

            <button
              className="bh-btn pulse"
              disabled={!image || !!busy}
              onClick={submitGcash}
            >
              {busy === "pay-gcash" ? <><span className="bh-spinner" /> Binabasa ng AI ang resibo…</> : "Ipasuri sa AI at i-lock sa escrow"}
            </button>
          </>
        )}

        {method === "cash" && (
          <>
            <div className="bh-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              <b style={{ fontSize: 13.5 }}>Iabot ang {peso(amount)} sa barangay coordinator</b>
              <div className="bh-muted">Kapag kinumpirma ng coordinator na natanggap niya, ila-lock ito sa escrow at ire-record sa BNB Smart Chain. Hindi ito mapupunta sa magsasaka hangga&apos;t hindi dumarating ang ani.</div>
            </div>
            <button className="bh-btn pulse" disabled={!!busy || !!state.cashPending} onClick={async () => { await act("pay-cash-intent"); onDone(); }}>
              {busy === "pay-cash-intent" ? <><span className="bh-spinner" /> Sandali…</> : state.cashPending ? "Hinihintay na ang coordinator" : `Magbabayad ako ng cash · ${peso(amount)}`}
            </button>
          </>
        )}

        {method === "wallet" && (
          <>
            <div className="bh-card" style={{ padding: 14 }}>
              <div className="bh-muted">Para sa may crypto wallet: direktang ila-lock ang bayad sa escrow contract.</div>
            </div>
            <button className="bh-btn pulse" disabled={!!busy} onClick={() => act("pay", { who: "you" })}>
              {busy === "pay" ? <><span className="bh-spinner" /> Pinoproseso sa blockchain…</> : `Bayaran mula sa wallet · ${peso(amount)}`}
            </button>
          </>
        )}
      </div>
    </>
  );
}
