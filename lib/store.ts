import "server-only";
import fs from "fs";
import path from "path";

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
  preorders: PreOrder[];
  reviews: GroupReview[];
  deals: DealRecord[];
  log: { at: string; text: string }[];
};

const FILE = path.join(process.cwd(), "data", "state.json");

const NAMES = ["Aling Nena", "Mang Jose", "Ate Liza", "Kuya Ben", "Lola Rosa", "Tita Marites", "Mang Lito", "Ate Joy", "Kuya Dan", "Aling Cora", "Tito Boy"];

function seed(): State {
  const preorders: PreOrder[] = [];
  // 44 neighbors in Brgy. Holy Spirit ordering 145 kg total (you'll add the last 5 kg).
  for (let i = 0; i < 44; i++) {
    preorders.push({ id: `hs-${i}`, name: `${NAMES[i % NAMES.length]} ${Math.floor(i / NAMES.length) + 1}`, pickup: "Brgy. Holy Spirit", kg: i < 13 ? 4 : 3 });
  }
  // A smaller group that is NOT viable yet (40 kg, below the 150 kg truck minimum).
  for (let i = 0; i < 10; i++) {
    preorders.push({ id: `pb-${i}`, name: `${NAMES[(i + 3) % NAMES.length]} P`, pickup: "Brgy. Poblacion", kg: 4 });
  }
  return { preorders, reviews: [], deals: [], log: [{ at: new Date().toISOString(), text: "Demo data ready: 44 neighbors pre-ordered in Brgy. Holy Spirit, 10 in Brgy. Poblacion." }] };
}

export function readState(): State {
  if (!fs.existsSync(FILE)) writeState(seed());
  return JSON.parse(fs.readFileSync(FILE, "utf8")) as State;
}

export function writeState(state: State): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
}

export function resetState(): State {
  const s = seed();
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
