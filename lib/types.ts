// Shapes shared by the API and the screens (type-only, safe to import in client code).
import type { Listing } from "./listing";
import type { DealRecord, GroupReview } from "./store";
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
  groups: GroupView[];
  you: { kg: number; pickup: string } | null;
  deal: DealView | null;
  log: { at: string; text: string }[];
};
