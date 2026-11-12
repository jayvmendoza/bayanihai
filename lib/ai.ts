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

/** Asks Gemini for a JSON answer. Returns null if no key is set or every model fails. */
async function geminiJSON<T>(prompt: string, tag: string): Promise<T | null> {
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
          contents: [{ parts: [{ text: prompt }] }],
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

  try {
    const answer = await Promise.any(modelsToTry().map(ask));
    stop.abort(); // cancel the slower calls
    return answer;
  } catch (err) {
    const reasons = err instanceof AggregateError ? err.errors.map((e) => (e instanceof Error ? e.message : String(e))) : [String(err)];
    console.warn(`[ai:${tag}] Gemini unavailable, using rules:`, reasons.join(" | "));
    return null;
  }
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
    'Reply ONLY with JSON: {"buyer_price": number, "reason_tl": string (one short friendly Tagalog sentence to the farmer explaining the price)}.',
  ].join("\n");

  const ai = await geminiJSON<{ buyer_price?: number; reason_tl?: string }>(prompt, "price");
  const picked = Math.round(Number(ai?.buyer_price));
  if (!ai || !Number.isFinite(picked)) return rules;

  // Safety: clamp Gemini's answer into the fair window.
  const buyer = Math.max(minBuyer, Math.min(maxBuyer, picked));
  return {
    ...base,
    buyerPricePerKg: buyer,
    farmerPricePerKg: buyer - TRANSPORT_PER_KG,
    reason_tl: String(ai.reason_tl || rules.reason_tl),
    source: "gemini",
  };
}
