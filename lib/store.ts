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

export function readState(): State {
  if (!fs.existsSync(FILE)) writeState(seed());
  const s = JSON.parse(fs.readFileSync(FILE, "utf8")) as Partial<State>;
  // Older state files (before Post Harvest existed) have no listing: start fresh.
  if (!s.listing) return resetState();
  return { priceSuggestion: null, ...s } as State;
}

export function writeState(state: State): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
}

/** Fresh demo for the given listing (defaults to the current one, or Mang Ramon's carrots). */
export function resetState(listing?: Listing): State {
  let current = listing;
  if (!current && fs.existsSync(FILE)) current = (JSON.parse(fs.readFileSync(FILE, "utf8")) as Partial<State>).listing;
  const s = seed(current ?? DEFAULT_LISTING);
  writeState(s);
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
