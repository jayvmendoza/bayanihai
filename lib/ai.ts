import "server-only";
import { LISTING } from "./listing";
import type { AiDecision, Group } from "./store";

// AI Deal Maker review step.
// 1) Rules do the math (exact, can't hallucinate).
// 2) Gemini reviews the group, decides, and explains it in Tagalog.
// Safety: Gemini can say "no" to a group that passes the rules, but can never approve one that fails them.

function rulesDecision(g: Group): AiDecision {
  const ok = g.totalKg >= LISTING.minKg;
  return ok
    ? {
        create_deal: true,
        reason: `${g.totalKg} kg from ${g.buyerCount} buyers meets the ${LISTING.minKg} kg minimum. One truck trip.`,
        summary_tl: `Buo na ang grupo! ${g.buyerCount} kapitbahay sa ${g.pickup} ang sabay bibili ng ${LISTING.crop.toLowerCase()} kay ${LISTING.farmer}.`,
        source: "rules",
      }
    : {
        create_deal: false,
        reason: `Only ${g.totalKg} kg from ${g.buyerCount} buyers. Needs ${LISTING.minKg} kg for one truck trip.`,
        summary_tl: `Kulang pa ng ${LISTING.minKg - g.totalKg} kilo. Hinihintay pa ang ibang sasali.`,
        source: "rules",
      };
}

function buildPrompt(g: Group, rules: AiDecision): string {
  return [
    "You are the AI Deal Maker of BAYANIHAI, a group-buying app that connects Filipino farmers with nearby buyers.",
    "Decide whether to create an escrow deal on the blockchain for this buyer group.",
    "",
    `Listing: ${LISTING.crop} from ${LISTING.farmer} (${LISTING.origin}), harvest ${LISTING.harvestDate}.`,
    `Farmer price: ₱${LISTING.farmerPricePerKg}/kg (middleman pays ₱${LISTING.middlemanPricePerKg}/kg).`,
    `Transport: ₱${LISTING.transportPerKg}/kg. Buyer price: ₱${LISTING.buyerPricePerKg}/kg (market: ₱${LISTING.marketPricePerKg}/kg).`,
    `Truck minimum: ${LISTING.minKg} kg.`,
    `Group: ${g.buyerCount} buyers at pickup point "${g.pickup}", total ${g.totalKg} kg.`,
    `Rule check result: ${rules.create_deal ? "PASSES" : "FAILS"} the minimum.`,
    "",
    "Reply ONLY with JSON: {\"create_deal\": boolean, \"reason\": string (one short English sentence), \"summary_tl\": string (one short friendly Tagalog sentence for buyers)}.",
  ].join("\n");
}

// Primary model first, then lighter backups if Gemini is busy (503/429) or slow.
function modelsToTry(): string[] {
  const primary = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  return [...new Set([primary, "gemini-3.5-flash", "gemini-3.1-flash-lite"])];
}

async function askGemini(model: string, key: string, prompt: string): Promise<Partial<AiDecision>> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`${model}: HTTP ${res.status}`);
  const data = await res.json();
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return JSON.parse(text) as Partial<AiDecision>;
}

export async function reviewGroup(g: Group): Promise<AiDecision> {
  const rules = rulesDecision(g);
  const key = process.env.GEMINI_API_KEY;
  if (!key) return rules;

  const prompt = buildPrompt(g, rules);
  const failures: string[] = [];
  for (const model of modelsToTry()) {
    try {
      const parsed = await askGemini(model, key, prompt);
      return {
        create_deal: parsed.create_deal === true && rules.create_deal,
        reason: String(parsed.reason || rules.reason),
        summary_tl: String(parsed.summary_tl || rules.summary_tl),
        source: "gemini",
      };
    } catch (err) {
      failures.push(err instanceof Error ? `${model}: ${err.name === "TimeoutError" ? "timeout" : err.message}` : String(err));
    }
  }
  console.warn("[ai] Gemini unavailable, using rules:", failures.join(" | "));
  return { ...rules, reason: `${rules.reason} (Gemini unavailable, rules used.)` };
}
