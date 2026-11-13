// Shapes shared by the API and the screens (type-only, safe to import in client code).
import type { CropInfo, Listing } from "./listing";
import type { PriceSuggestion, ReceiptCheck } from "./ai";
import type { DealRecord, GroupReview, PaymentRecord } from "./store";
import type { OnChainDeal } from "./chain";

export type GroupView = {
  pickup: string;
  totalKg: number;
  buyerCount: number;
  youKg: number;
  review?: GroupReview;
};

export type DealView = DealRecord & {
  chain: OnChainDeal | null;
  youLockedKg: number;
  neighborsLockedKg: number;
  farmerReceived: number; // pesos, after release
  haulerReceived: number;
};

export type AppState = {
  chain: {
    ok: boolean;
    error?: string;
    network: string;
    isLocal: boolean;
    explorer: string;
    contract?: string;
    escrowPesos: number;
    now: number;
  };
  listing: Listing;
  priceSuggestion: PriceSuggestion | null;
  crops: CropInfo[];
  groups: GroupView[];
  you: { kg: number; pickup: string } | null;
  deal: DealView | null;
  log: { at: string; text: string }[];
  payments: PaymentRecord[];
  lastReceipt: ReceiptCheck | null;
  cashPending: { amountPesos: number; at: string } | null;
  aiRunning: boolean; // the AI Deal Maker is reviewing groups right now (runs automatically when a buyer joins)
  refundTestArmed: boolean; // the next deal will be a refund test (90-second deadline)
};
