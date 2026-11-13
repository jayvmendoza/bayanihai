"use client";
// Shared building blocks for the BAYANIHAI buyer (/) and farmer (/farmer) apps, in the team's design.
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import "@/app/bh.css";
import { Produce, ProduceDefs } from "@/components/Produce";
import { peso } from "@/lib/useAppState";
import type { CropKey } from "@/lib/listing";
import type { AppState } from "@/lib/types";

export const PICKUP = "Brgy. Holy Spirit";
export const HARVEST_KG = [150, 200, 300];
export const st = (i: number) => ({ "--i": i }) as CSSProperties;

export function Icon({ d, children }: { d?: string; children?: ReactNode }) {
  return (
    <svg className="bh-ic" viewBox="0 0 24 24" aria-hidden>
      {d ? <path d={d} /> : children}
    </svg>
  );
}

export const ICONS = {
  home: "M4 11l8-7 8 7v9H4zM10 20v-6h4v6",
  plus: "M12 5v14M5 12h14",
  back: "M15 5l-7 7 7 7",
  close: "M6 6l12 12M18 6L6 18",
};
export const GridIcon = () => (
  <Icon>
    <rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" />
  </Icon>
);
export const LockIcon = () => (
  <Icon>
    <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Icon>
);
export const UserIcon = () => (
  <Icon>
    <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" />
  </Icon>
);
export const PeopleIcon = () => (
  <Icon>
    <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6" />
  </Icon>
);

/** Animated number that eases from its previous value to the new one. */
export function Count({ to }: { to: number }) {
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

/** Where the buyers' group stands, from real state. */
export function progressOf(s: AppState) {
  const group = s.groups.find((g) => g.pickup === PICKUP);
  if (s.deal?.chain) {
    const { fundedKg, targetKg } = s.deal.chain;
    return { value: fundedKg, target: targetKg, label: "kilo ang bayad na", buyers: s.deal.buyerCount };
  }
  return { value: group?.totalKg ?? 0, target: s.listing.minKg, label: "kilo ang sumali", buyers: group?.buyerCount ?? 0 };
}

export function stockBadge(left: number, target: number) {
  const r = target > 0 ? left / target : 0;
  if (left <= 0) return { text: "Buo na!", bg: "#DDF2E4", fg: "#0E6631", line: "#1F9D52" };
  if (r <= 0.1) return { text: "Konti na lang", bg: "#FCE3D8", fg: "#B2380F", line: "#E24B1A" };
  if (r <= 0.5) return { text: "Sapat pa", bg: "#FBF0CF", fg: "#7A5A0C", line: "#D9A21B" };
  return { text: "Maraming slot", bg: "#DDF2E4", fg: "#0E6631", line: "#1F9D52" };
}

/** Screen navigation with the prototype's circular reveal, toasts, and the phone frame. */
export function useShell<S extends string>(initial: S) {
  const [scr, setScr] = useState<S>(initial);
  const [origin, setOrigin] = useState({ x: 184, y: 700 });
  const [toast, setToast] = useState<{ text: string; err?: boolean } | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);

  const go = (n: S, e?: MouseEvent) => {
    const r = screenRef.current?.getBoundingClientRect();
    setOrigin(e && r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: 184, y: 700 });
    setScr(n);
  };
  const say = (text: string, err = false) => {
    setToast({ text, err });
    setTimeout(() => setToast(null), err ? 3200 : 2000);
  };
  // The screen being entered gets the circular reveal from where the user tapped.
  const reveal = (n: S, extra?: CSSProperties) =>
    scr === n ? { className: "enter", style: { "--x": `${origin.x}px`, "--y": `${origin.y}px`, ...extra } as CSSProperties } : { className: "", style: extra };

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
  return { scr, setScr, go, say, reveal, frame };
}

/** Marks the page as embedded in /demo (no splash, no own phone frame). Returns true when embedded. */
export function useEmbed(onReady?: (embedded: boolean) => void) {
  useEffect(() => {
    const embed = new URLSearchParams(window.location.search).has("embed");
    if (embed) document.body.classList.add("embed");
    onReady?.(embed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Shows server errors as a red toast. */
export function useErrorToast(error: string | null, say: (t: string, err?: boolean) => void) {
  useEffect(() => {
    if (error) say(error, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);
}

export function ChainPill({ state }: { state: AppState }) {
  return (
    <span className={`bh-pill ${state.chain.ok ? "ok" : ""}`} style={{ fontSize: 10.5, padding: "4px 9px" }}>
      <i />
      {state.chain.ok ? (state.chain.isLocal ? "Local chain" : "BSC Testnet") : "Offline"}
    </span>
  );
}

/** BscScan links for every transaction of the current deal. */
export function TxProof({ state, style }: { state: AppState; style?: CSSProperties }) {
  const deal = state.deal;
  if (!deal || deal.txs.length === 0) return null;
  const explorer = state.chain.explorer;
  return (
    <div className="bh-card bh-st" style={{ width: "100%", padding: "10px 14px", textAlign: "left", flex: "none", ...style }}>
      <b style={{ fontSize: 13 }}>Patunay sa blockchain</b>
      {deal.txs.map((t) => (
        <div className="bh-tx" key={t.hash}>
          <span>{t.label}</span>
          {explorer ? (
            <a href={`${explorer}/tx/${t.hash}`} target="_blank" rel="noreferrer">{t.hash.slice(0, 10)}…</a>
          ) : (
            <span className="bh-muted">{t.hash.slice(0, 10)}…</span>
          )}
        </div>
      ))}
    </div>
  );
}

/** Buyer groups per pickup point, with the AI Deal Maker's decision for each. */
export function GroupsList({ state, onOpen, startIndex = 2 }: { state: AppState; onOpen?: (pickup: string, e: MouseEvent) => void; startIndex?: number }) {
  const { deal, listing } = state;
  const status = deal?.chain?.status;
  return (
    <>
      {state.groups.map((g, i) => {
        const ai = g.review?.ai;
        const isDeal = deal?.pickup === g.pickup;
        const gp = isDeal && deal?.chain ? Math.round((deal.chain.fundedKg / deal.chain.targetKg) * 100) : Math.min(100, Math.round((g.totalKg / listing.minKg) * 100));
        return (
          <button key={g.pickup} className="bh-card bh-st" style={{ ...st(startIndex + i), padding: 14, textAlign: "left", display: "flex", flexDirection: "column", gap: 8, flex: "none" }} onClick={(e) => onOpen?.(g.pickup, e)}>
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
    </>
  );
}

/** Truck on a dashed road; position 0-100 follows the deal status. */
export function Road({ at, style }: { at: number; style?: CSSProperties }) {
  return (
    <div className="bh-road bh-st" style={style}>
      <svg className="bh-truck" width={54} height={34} viewBox="0 0 54 34" style={{ left: `calc(${at}% - ${(54 * at) / 100}px)` }}>
        <rect x="0" y="6" width="34" height="20" rx="3" fill="var(--g7)" />
        <path d="M34 12h12l6 8v6H34z" fill="var(--or)" />
        <circle cx="12" cy="28" r="5" fill="#0c0f0d" /><circle cx="42" cy="28" r="5" fill="#0c0f0d" />
      </svg>
    </div>
  );
}

export type Step = { done: boolean; title: string; sub: string };
export function Steps({ steps, style }: { steps: Step[]; style?: CSSProperties }) {
  const firstOpen = steps.findIndex((s) => !s.done);
  return (
    <div className="bh-card bh-st" style={{ width: "100%", padding: 16, textAlign: "left", display: "flex", flexDirection: "column", gap: 14, flex: "none", ...style }}>
      {steps.map((s, i) => (
        <div key={i} className={`bh-step ${s.done ? "done" : i === firstOpen ? "now" : ""}`}>
          <div className="d">{s.done ? "✓" : i + 1}</div>
          <div><b>{s.title}</b><span>{s.sub}</span></div>
        </div>
      ))}
    </div>
  );
}

/** Farmer: post a harvest with an AI fair price. */
export function HarvestSheet({
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
            <div className="bh-muted">{state.listing.farmer} · {state.listing.origin}</div>
          </div>
          <button className="bh-back" aria-label="Isara" onClick={onClose}><Icon d={ICONS.close} /></button>
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

/** One-time confetti burst. */
export function Confetti({ top = 40 }: { top?: number }) {
  const [bits] = useState(() =>
    Array.from({ length: 22 }, (_, i) => {
      const a = Math.random() * 6.28;
      const m = 60 + Math.random() * 90;
      return { c: ["#E9B949", "#1F9D52", "#C94A15", "#8FD3A8"][i % 4], x: Math.cos(a) * m, y: Math.sin(a) * m };
    })
  );
  return (
    <div style={{ position: "absolute", left: "50%", top, pointerEvents: "none" }}>
      {bits.map((b, i) => (
        <i key={i} style={{ position: "absolute", width: 8, height: 8, borderRadius: 2, background: b.c, "--bx": `${b.x}px`, "--by": `${b.y}px`, animation: "bh-burst 1s ease-out both" } as CSSProperties} />
      ))}
    </div>
  );
}
