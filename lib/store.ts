import "server-only";
import fs from "fs";
import path from "path";
import { DEFAULT_LISTING, type Listing } from "./listing";
import type { PriceSuggestion } from "./ai";

// Off-chain demo state (pre-orders, AI decisions, tx history), kept in a JSON file.
// The money itself always lives on-chain in the escrow contract.

export type PreOrder = { id: string; name: string; pickup: string; kg: number; isYou?: boolean };

export type AiDecision = {
  create_deal: boolean;
  reason: string;
  summary_tl: string;
  source: "gemini" | "rules";
};

export type GroupReview = { pickup: string; totalKg: number; buyerCount: number; ai: AiDecision; at: string };

export type TxRecord = { label: string; hash: string };

export type DealRecord = {
  dealId: number;
  pickup: string;
  totalKg: number;
  buyerCount: number;
  youKg: number;
  scenario: "success" | "fail";
  ai: AiDecision;
  txs: TxRecord[];
};

export type State = {
  listing: Listing;
  priceSuggestion: PriceSuggestion | null; // last AI price suggestion, waiting for the farmer to post
  preorders: PreOrder[];
  reviews: GroupReview[];
  deals: DealRecord[];
  log: { at: string; text: string }[];
};

const FILE = path.join(process.cwd(), "data", "state.json");

const NAMES = ["Aling Nena", "Mang Jose", "Ate Liza", "Kuya Ben", "Lola Rosa", "Tita Marites", "Mang Lito", "Ate Joy", "Kuya Dan", "Aling Cora", "Tito Boy"];
export const YOUR_KG_SLOT = 5; // neighbors leave the last 5 kg for "you" to complete the group

function seed(listing: Listing = DEFAULT_LISTING): State {
  const preorders: PreOrder[] = [];
  // Neighbors in Brgy. Holy Spirit pre-order everything except the last 5 kg (3-4 kg each).
  const neighborsKg = listing.minKg - YOUR_KG_SLOT;
  const count = Math.max(1, Math.round(neighborsKg / 3.3));
  const base = Math.floor(neighborsKg / count);
  const extra = neighborsKg - base * count;
  for (let i = 0; i < count; i++) {
    preorders.push({ id: `hs-${i}`, name: `${NAMES[i % NAMES.length]} ${Math.floor(i / NAMES.length) + 1}`, pickup: "Brgy. Holy Spirit", kg: i < extra ? base + 1 : base });
  }
  // A smaller group that is NOT viable yet (40 kg, below the truck minimum).
  for (let i = 0; i < 10; i++) {
    preorders.push({ id: `pb-${i}`, name: `${NAMES[(i + 3) % NAMES.length]} P`, pickup: "Brgy. Poblacion", kg: 4 });
  }
  return {
    listing,
    priceSuggestion: null,
    preorders,
    reviews: [],
    deals: [],
    log: [
      {
        at: new Date().toISOString(),
        text: `Demo ready: ${listing.minKg} kg of ${listing.cropName} from ${listing.farmer}. ${count} neighbors pre-ordered ${neighborsKg} kg in Brgy. Holy Spirit, 10 in Brgy. Poblacion.`,
      },
    ],
  };
}

// ---------- persistence ----------
// Vercel can't keep files between requests, so with an Upstash Redis store (env vars from the Vercel
// integration) the state lives in Redis. Locally it stays in data/state.json, as before.
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_KEY = "bayanihai:state";
export const STORE_KIND: "redis" | "file" = REDIS_URL && REDIS_TOKEN ? "redis" : "file";

async function redis(command: unknown[]): Promise<unknown> {
  const res = await fetch(REDIS_URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (!res.ok || data.error) throw new Error(`Redis: ${data.error ?? res.status}`);
  return data.result;
}

async function loadRaw(): Promise<Partial<State> | null> {
  if (STORE_KIND === "redis") {
    const raw = await redis(["GET", REDIS_KEY]);
    return typeof raw === "string" ? (JSON.parse(raw) as Partial<State>) : null;
  }
  if (!fs.existsSync(FILE)) return null;
  return JSON.parse(fs.readFileSync(FILE, "utf8")) as Partial<State>;
}

export async function writeState(state: State): Promise<void> {
  if (STORE_KIND === "redis") {
    await redis(["SET", REDIS_KEY, JSON.stringify(state)]);
    return;
  }
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
}

export async function readState(): Promise<State> {
  const s = await loadRaw();
  // No state yet, or an older one from before Post Harvest existed: start fresh.
  if (!s || !s.listing) return resetState();
  return { priceSuggestion: null, ...s } as State;
}

/** Fresh demo for the given listing (defaults to the current one, or Mang Ramon's carrots). */
export async function resetState(listing?: Listing): Promise<State> {
  const current = listing ?? (await loadRaw())?.listing;
  const s = seed(current ?? DEFAULT_LISTING);
  await writeState(s);
  return s;
}

export function addLog(state: State, text: string): void {
  state.log.unshift({ at: new Date().toISOString(), text });
  state.log = state.log.slice(0, 40);
}

export type Group = { pickup: string; totalKg: number; buyerCount: number; youKg: number };

export function groupByPickup(preorders: PreOrder[]): Group[] {
  const map = new Map<string, Group>();
  for (const o of preorders) {
    const g = map.get(o.pickup) ?? { pickup: o.pickup, totalKg: 0, buyerCount: 0, youKg: 0 };
    g.totalKg += o.kg;
    g.buyerCount += 1;
    if (o.isYou) g.youKg += o.kg;
    map.set(o.pickup, g);
  }
  return [...map.values()];
}
