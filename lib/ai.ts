import "server-only";
import { CROPS, TRANSPORT_PER_KG, type CropKey, type Listing } from "./listing";
import type { AiDecision, Group } from "./store";

// Two AI jobs, same safety pattern:
//   1) Rules do the math (exact, can't hallucinate).
//   2) Gemini decides within those limits and explains it in Tagalog.
//   If Gemini is down or answers outside the limits, the rules still win.

// ---------------------------------------------------------------- Gemini helper

// Primary model first, then lighter backups if Gemini is busy (503/429) or slow.
function modelsToTry(): string[] {
  const primary = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  return [...new Set([primary, "gemini-3.5-flash", "gemini-3.1-flash-lite"])];
}

export type ImagePart = { mime: string; base64: string };

/** Asks Gemini for a JSON answer (optionally about an image). Returns null if no key is set or every model fails. */
async function geminiJSON<T>(prompt: string, tag: string, image?: ImagePart): Promise<T | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  // Ask every model at once and keep the FIRST valid answer, so one slow or busy model can't stall the demo.
  const stop = new AbortController();
  const ask = async (model: string): Promise<T> => {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: image ? [{ inline_data: { mime_type: image.mime, data: image.base64 } }, { text: prompt }] : [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
        }),
        signal: AbortSignal.any([stop.signal, AbortSignal.timeout(20000)]),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      return JSON.parse(text) as T;
    } catch (err) {
      throw new Error(`${model}: ${err instanceof Error ? (err.name === "TimeoutError" ? "timeout" : err.message) : String(err)}`);
    }
  };

  // Free-tier quotas (429) and busy models (503) are usually brief: one retry after a short pause.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const answer = await Promise.any(modelsToTry().map(ask));
      stop.abort(); // cancel the slower calls
      return answer;
    } catch (err) {
      const reasons = err instanceof AggregateError ? err.errors.map((e) => (e instanceof Error ? e.message : String(e))) : [String(err)];
      const busy = reasons.every((r) => /HTTP (429|503)/.test(r));
      if (attempt === 1 && busy) {
        console.warn(`[ai:${tag}] Gemini busy, retrying once:`, reasons.join(" | "));
        await new Promise((r) => setTimeout(r, 2500));
        continue;
      }
      console.warn(`[ai:${tag}] Gemini unavailable, using rules:`, reasons.join(" | "));
      return null;
    }
  }
  return null;
}

// ---------------------------------------------------------------- AI Deal Maker

function rulesDecision(g: Group, l: Listing): AiDecision {
  const ok = g.totalKg >= l.minKg;
  return ok
    ? {
        create_deal: true,
        reason: `${g.totalKg} kg from ${g.buyerCount} buyers meets the ${l.minKg} kg minimum. One truck trip.`,
        summary_tl: `Buo na ang grupo! ${g.buyerCount} kapitbahay sa ${g.pickup} ang sabay bibili ng ${l.cropName.toLowerCase()} kay ${l.farmer}.`,
        source: "rules",
      }
    : {
        create_deal: false,
        reason: `Only ${g.totalKg} kg from ${g.buyerCount} buyers. Needs ${l.minKg} kg for one truck trip.`,
        summary_tl: `Kulang pa ng ${l.minKg - g.totalKg} kilo. Hinihintay pa ang ibang sasali.`,
        source: "rules",
      };
}

export async function reviewGroup(g: Group, l: Listing): Promise<AiDecision> {
  const rules = rulesDecision(g, l);
  const prompt = [
    "You are the AI Deal Maker of BAYANIHAI, a group-buying app that connects Filipino farmers with nearby buyers.",
    "Decide whether to create an escrow deal on the blockchain for this buyer group.",
    "",
    `Listing: ${l.cropName} from ${l.farmer} (${l.origin}), harvest ${l.harvestDate}.`,
    `Farmer price: ₱${l.farmerPricePerKg}/kg (middleman pays ₱${l.middlemanPricePerKg}/kg).`,
    `Transport: ₱${l.transportPerKg}/kg. Buyer price: ₱${l.buyerPricePerKg}/kg (market: ₱${l.marketPricePerKg}/kg).`,
    `Truck minimum: ${l.minKg} kg.`,
    `Group: ${g.buyerCount} buyers at pickup point "${g.pickup}", total ${g.totalKg} kg.`,
    `Rule check result: ${rules.create_deal ? "PASSES" : "FAILS"} the minimum.`,
    "",
    'Reply ONLY with JSON: {"create_deal": boolean, "reason": string (one short English sentence), "summary_tl": string (one short friendly Tagalog sentence for buyers)}.',
  ].join("\n");

  const ai = await geminiJSON<Partial<AiDecision>>(prompt, "deal");
  if (!ai) return { ...rules, reason: process.env.GEMINI_API_KEY ? `${rules.reason} (Gemini unavailable, rules used.)` : rules.reason };
  return {
    // Gemini can say "wait" to a group that passes the rules, but can never approve one that fails them.
    create_deal: ai.create_deal === true && rules.create_deal,
    reason: String(ai.reason || rules.reason),
    summary_tl: String(ai.summary_tl || rules.summary_tl),
    source: "gemini",
  };
}

// ---------------------------------------------------------------- AI Fair Pricing

export type PriceSuggestion = {
  crop: CropKey;
  cropName: string;
  kg: number;
  farmerPricePerKg: number;
  buyerPricePerKg: number;
  transportPerKg: number;
  marketPricePerKg: number;
  middlemanPricePerKg: number;
  reason_tl: string;
  source: "gemini" | "rules";
};

/**
 * Fair-price window (the rules):
 *   - buyers must pay LESS than the market price  -> buyerPrice <= market - 5
 *   - the farmer must earn MORE than a middleman pays -> farmerPrice >= middleman * 1.5
 *   - buyerPrice = farmerPrice + transport (one shared truck trip)
 */
function priceWindow(c: { marketPricePerKg: number; middlemanPricePerKg: number }) {
  const maxBuyer = c.marketPricePerKg - 5;
  const minFarmer = Math.ceil(c.middlemanPricePerKg * 1.5);
  const minBuyer = Math.min(maxBuyer, minFarmer + TRANSPORT_PER_KG);
  return { minBuyer, maxBuyer };
}

export async function suggestPrice(crop: CropKey, kg: number): Promise<PriceSuggestion> {
  const c = CROPS[crop];
  const { minBuyer, maxBuyer } = priceWindow(c);
  const base = { crop, cropName: c.name, kg, transportPerKg: TRANSPORT_PER_KG, marketPricePerKg: c.marketPricePerKg, middlemanPricePerKg: c.middlemanPricePerKg };

  // Rules default: ₱10 below market for buyers, the rest (minus transport) to the farmer.
  const rulesBuyer = Math.max(minBuyer, Math.min(maxBuyer, c.marketPricePerKg - 10));
  const rules: PriceSuggestion = {
    ...base,
    buyerPricePerKg: rulesBuyer,
    farmerPricePerKg: rulesBuyer - TRANSPORT_PER_KG,
    reason_tl: `Mas mura ng ₱${c.marketPricePerKg - rulesBuyer} kaysa palengke para sa mamimili, at ₱${rulesBuyer - TRANSPORT_PER_KG} kada kilo para sa iyo imbes na ₱${c.middlemanPricePerKg} sa middleman.`,
    source: "rules",
  };

  const prompt = [
    "You are the AI Fair Pricing assistant of BAYANIHAI, a group-buying app that lets Filipino neighbors buy straight from farmers.",
    `A farmer is posting ${kg} kg of ${c.name} (${crop}).`,
    `Typical city market retail price: ₱${c.marketPricePerKg}/kg. Typical middleman farmgate price: ₱${c.middlemanPricePerKg}/kg.`,
    `Shared truck transport adds ₱${TRANSPORT_PER_KG}/kg to what buyers pay.`,
    `Pick ONE buyer price per kg as a whole number between ₱${minBuyer} and ₱${maxBuyer}.`,
    "Balance it: buyers should save versus the market, and the farmer should earn clearly more than the middleman price.",
    "",
    'Reply ONLY with JSON: {"buyer_price": number}.',
  ].join("\n");

  const ai = await geminiJSON<{ buyer_price?: number }>(prompt, "price");
  const picked = Math.round(Number(ai?.buyer_price));
  if (!ai || !Number.isFinite(picked)) return rules;

  // Safety: clamp Gemini's answer into the fair window.
  const buyer = Math.max(minBuyer, Math.min(maxBuyer, picked));
  const farmer = buyer - TRANSPORT_PER_KG;

  // Explanation is written from the FINAL numbers, so it can never overstate (e.g. "triple" when it's 1.75x).
  const explainPrompt = [
    "Write ONE short, friendly Tagalog sentence to a Filipino farmer explaining this price. Use ONLY these exact facts and numbers; do not compute or invent any other comparison (no 'doble', 'triple', or percentages unless given here):",
    `- Farmer gets ₱${farmer} per kilo instead of ₱${c.middlemanPricePerKg} from a middleman (₱${farmer - c.middlemanPricePerKg} more per kilo).`,
    `- Buyers pay ₱${buyer} per kilo instead of ₱${c.marketPricePerKg} at the market (they save ₱${c.marketPricePerKg - buyer}).`,
    'Reply ONLY with JSON: {"reason_tl": string}.',
  ].join("\n");
  const ex = await geminiJSON<{ reason_tl?: string }>(explainPrompt, "price-explain");

  return {
    ...base,
    buyerPricePerKg: buyer,
    farmerPricePerKg: farmer,
    reason_tl: String(ex?.reason_tl || `₱${farmer} kada kilo para sa iyo (₱${farmer - c.middlemanPricePerKg} higit sa middleman), at makakatipid ng ₱${c.marketPricePerKg - buyer} ang mamimili kumpara sa palengke.`),
    source: "gemini",
  };
}

// ---------------------------------------------------------------- AI Receipt Check (GCash / e-wallet)
// Gemini only READS the screenshot. The rules decide: the amount must match the order exactly,
// the reference number must look valid, and it must never have been used before.

export type ReceiptRead = {
  is_receipt: boolean;
  amount_php: number | null;
  reference_no: string | null;
  date: string | null;
  recipient: string | null;
  looks_edited: boolean;
};

export type ReceiptCheck = {
  ok: boolean;
  source: "gemini" | "none";
  read: ReceiptRead | null;
  expectedPesos: number;
  refMasked: string | null;
  checks: { label: string; ok: boolean }[];
  summary_tl: string;
};

export const maskRef = (ref: string) => `••••${ref.slice(-4)}`;
export const normalizeRef = (ref: string | null | undefined) => (ref ?? "").replace(/\D/g, "");

export async function checkReceipt(
  image: ImagePart,
  expectedPesos: number,
  isUsed: (ref: string) => boolean,
  cachedRead?: ReceiptRead | null // what the AI already read from this exact image (no new AI call needed)
): Promise<ReceiptCheck> {
  const prompt = [
    "You are checking a screenshot submitted as proof of an e-wallet (e.g. GCash) payment for a group-buy order.",
    "Read ONLY what is visible. Do not guess missing values; use null.",
    'Reply ONLY with JSON: {"is_receipt": boolean (is this a payment or money-transfer receipt at all), "amount_php": number|null (the amount sent, in pesos), "reference_no": string|null (the reference / transaction number, digits only), "date": string|null (YYYY-MM-DD), "recipient": string|null, "looks_edited": boolean (any visible signs of tampering such as mismatched fonts or overlaid numbers)}',
  ].join("\n");
  const read = cachedRead ?? (await geminiJSON<ReceiptRead>(prompt, "receipt", image));

  if (!read) {
    return {
      ok: false,
      source: "none",
      read: null,
      expectedPesos,
      refMasked: null,
      checks: [{ label: "Nabasa ng AI ang resibo", ok: false }],
      summary_tl: "Hindi mabasa ng AI ang resibo ngayon. Subukan ulit, o magbayad ng cash sa coordinator.",
    };
  }

  const ref = normalizeRef(read.reference_no);
  const amount = Number(read.amount_php);
  const checks = [
    { label: "Resibo ng bayad", ok: read.is_receipt === true },
    { label: `Halaga ay ₱${expectedPesos.toLocaleString("en-PH")}`, ok: Number.isFinite(amount) && Math.abs(amount - expectedPesos) < 0.5 },
    { label: "May valid na reference number", ok: ref.length >= 8 && ref.length <= 20 },
    { label: "Hindi pa nagamit ang resibo", ok: ref.length > 0 && !isUsed(ref) },
    { label: "Walang bakas ng pag-edit", ok: read.looks_edited !== true },
  ];
  const ok = checks.every((c) => c.ok);
  const firstBad = checks.find((c) => !c.ok);

  let summary_tl: string;
  if (ok) summary_tl = `Nabasa ng AI: ₱${amount.toLocaleString("en-PH")}, ref ${maskRef(ref)}. Tugma sa order mo.`;
  else if (firstBad?.label.startsWith("Hindi pa nagamit")) summary_tl = `Nagamit na ang resibong ito (ref ${maskRef(ref)}). Hindi puwedeng gamitin ulit.`;
  else if (firstBad?.label.startsWith("Halaga")) summary_tl = `Hindi tugma ang halaga: nakita ng AI ang ₱${Number.isFinite(amount) ? amount.toLocaleString("en-PH") : "?"}, pero ₱${expectedPesos.toLocaleString("en-PH")} ang order mo.`;
  else if (firstBad?.label === "Resibo ng bayad") summary_tl = "Hindi ito mukhang resibo ng bayad. Paki-upload ang screenshot ng GCash receipt.";
  else if (firstBad?.label.startsWith("May valid")) summary_tl = "Walang malinaw na reference number sa resibo.";
  else summary_tl = "Mukhang na-edit ang resibo. Hindi ito tatanggapin.";

  return { ok, source: "gemini", read, expectedPesos, refMasked: ref ? maskRef(ref) : null, checks, summary_tl };
}
