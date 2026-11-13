import "server-only";
import fs from "fs";
import path from "path";
import { DEFAULT_LISTING, type Listing } from "./listing";
import type { PriceSuggestion, ReceiptCheck, ReceiptRead } from "./ai";

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

/** How a buyer paid. GCash/cash are paid in pesos; the escrow is funded on their behalf and the
 *  payment proof (method + fingerprint of the receipt reference) is written on-chain with the lock. */
export type PayMethod = "gcash" | "cash" | "wallet";
export type PaymentRecord = {
  who: "you" | "neighbors";
  method: PayMethod;
  amountPesos: number;
  refMasked?: string; // e.g. ••••0123 (the full reference never leaves the server)
  proof?: string; // the memo written on-chain with the escrow lock
  aiVerified?: boolean;
  txHash: string;
  at: string;
};

export type State = {
  listing: Listing;
  priceSuggestion: PriceSuggestion | null; // last AI price suggestion, waiting for the farmer to post
  preorders: PreOrder[];
  reviews: GroupReview[];
  deals: DealRecord[];
  log: { at: string; text: string }[];
  payments: PaymentRecord[];
  lastReceipt: ReceiptCheck | null; // what the AI read from the last uploaded receipt
  cashPending: { amountPesos: number; at: string } | null; // buyer chose cash, waiting for the coordinator
  usedRefs: string[]; // sha256 of every accepted receipt reference; kept across resets
  receiptReads: { imageHash: string; read: ReceiptRead }[]; // AI reads by image fingerprint (same image = no new AI call); kept across resets
  round: string; // changes on every reset/new harvest, so background work from an old round is dropped
  autoRun: { at: string } | null; // the automatic AI Deal Maker is running in the background
  nextScenario?: "fail" | null; // presenter armed a refund test for the next deal
};

/** The automatic AI run is considered alive for 2 minutes (protects against a crashed background job). */
export const aiRunning = (s: State) => !!s.autoRun && Date.now() - Date.parse(s.autoRun.at) < 120_000;

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
    payments: [],
    lastReceipt: null,
    cashPending: null,
    usedRefs: [],
    receiptReads: [],
    round: Math.random().toString(36).slice(2, 10),
    autoRun: null,
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
// The Vercel integration may add a custom prefix (e.g. STORAGE_KV_REST_API_URL), so match by suffix.
function envBySuffix(...suffixes: string[]): string | undefined {
  for (const suffix of suffixes) {
    const key = Object.keys(process.env).find((k) => k === suffix || k.endsWith(`_${suffix}`));
    if (key && process.env[key]) return process.env[key];
  }
  return undefined;
}
const REDIS_URL = envBySuffix("KV_REST_API_URL", "UPSTASH_REDIS_REST_URL");
const REDIS_TOKEN = envBySuffix("KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_TOKEN");
const REDIS_KEY = "bayanihai:state";
export const STORE_KIND: "redis" | "file" = REDIS_URL && REDIS_TOKEN ? "redis" : "file";

/** Which storage is actually in use right now (shown in /api/state for troubleshooting). */
export const storeInUse = (): "redis" | "file" | "memory" => (STORE_KIND === "redis" ? "redis" : readOnlyDisk ? "memory" : "file");

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

// Last resort when there's no Redis and the disk is read-only (a Vercel deploy before Redis is connected):
// keep the state in this server instance's memory so the app still works. It isn't shared between
// instances and resets on cold starts, so connect Upstash Redis for a reliable public demo.
let memory: State | null = null;
let readOnlyDisk = false;

async function loadRaw(): Promise<Partial<State> | null> {
  if (STORE_KIND === "redis") {
    const raw = await redis(["GET", REDIS_KEY]);
    return typeof raw === "string" ? (JSON.parse(raw) as Partial<State>) : null;
  }
  if (readOnlyDisk) return memory;
  if (!fs.existsSync(FILE)) return memory;
  return JSON.parse(fs.readFileSync(FILE, "utf8")) as Partial<State>;
}

export async function writeState(state: State): Promise<void> {
  if (STORE_KIND === "redis") {
    await redis(["SET", REDIS_KEY, JSON.stringify(state)]);
    return;
  }
  memory = state;
  if (readOnlyDisk) return;
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    readOnlyDisk = true;
    console.warn("BAYANIHAI: can't write data/state.json (read-only disk?). Using in-memory state; connect Upstash Redis to share it.", err);
  }
}

export async function readState(): Promise<State> {
  const s = await loadRaw();
  // No state yet, or an older one from before Post Harvest existed: start fresh.
  if (!s || !s.listing) return resetState();
  return { priceSuggestion: null, payments: [], lastReceipt: null, cashPending: null, usedRefs: [], receiptReads: [], round: "legacy", autoRun: null, ...s } as State;
}

/** Fresh demo for the given listing (defaults to the current one, or Mang Ramon's carrots). */
export async function resetState(listing?: Listing): Promise<State> {
  const prev = await loadRaw();
  const current = listing ?? prev?.listing;
  const s = seed(current ?? DEFAULT_LISTING);
  s.usedRefs = prev?.usedRefs ?? []; // a receipt stays "used" even after a new round starts
  s.receiptReads = prev?.receiptReads ?? [];
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
