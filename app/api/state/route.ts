import { NextResponse } from "next/server";
import { EXPLORER_URL, IS_LOCAL } from "@/lib/config";
import { chainNow, loadDeployment, readDeal } from "@/lib/chain";
import { aiRunning, groupByPickup, readState, storeInUse } from "@/lib/store";
import { CROPS } from "@/lib/listing";
import type { AppState, DealView } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  let s;
  try {
    s = await readState();
  } catch (err) {
    // e.g. wrong Redis credentials: say so instead of an empty 500, so the screens can show it.
    return NextResponse.json({ fatal: `Storage error: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
  const deployment = loadDeployment();
  const you = s.preorders.find((o) => o.isYou);

  const groups = groupByPickup(s.preorders).map((g) => ({
    ...g,
    review: [...s.reviews].reverse().find((r) => r.pickup === g.pickup),
  }));

  const state: AppState = {
    chain: {
      ok: false,
      network: deployment?.network ?? "not deployed",
      isLocal: IS_LOCAL,
      explorer: EXPLORER_URL,
      contract: deployment?.address,
      escrowPesos: 0,
      now: Math.floor(Date.now() / 1000),
    },
    listing: s.listing,
    priceSuggestion: s.priceSuggestion,
    crops: Object.values(CROPS),
    groups,
    you: you ? { kg: you.kg, pickup: you.pickup } : null,
    deal: null,
    log: s.log,
    payments: s.payments,
    lastReceipt: s.lastReceipt,
    cashPending: s.cashPending,
    aiRunning: aiRunning(s),
    refundTestArmed: s.nextScenario === "fail",
  };

  try {
    if (!deployment) throw new Error("Contract not deployed yet. Run: npm run deploy:local");
    state.chain.now = await chainNow();
    state.chain.ok = true;

    const record = s.deals.at(-1);
    if (record) {
      const chain = await readDeal(record.dealId);
      // On testnet one demo wallet can play both the buyer and the neighbors, so who-paid-what comes from the
      // payment records (each backed by its own on-chain transaction), not from that shared wallet's balance.
      const youLockedKg = s.payments.some((p) => p.who === "you") ? record.youKg : 0;
      const neighborsLockedKg = s.payments.some((p) => p.who === "neighbors") ? record.totalKg - record.youKg : 0;
      const released = chain.status === "Released";
      const deal: DealView = {
        ...record,
        chain,
        youLockedKg,
        neighborsLockedKg,
        farmerReceived: released ? chain.fundedKg * chain.farmerPricePerKg : 0,
        haulerReceived: released ? chain.fundedKg * (chain.pricePerKg - chain.farmerPricePerKg) : 0,
      };
      state.deal = deal;
    }
    // Show the money held for THIS round's deal. (The contract balance can also include deals from rounds that
    // were reset mid-way; that money stays safe and becomes refundable to its buyers after the deadline.)
    const st = state.deal?.chain;
    state.chain.escrowPesos = st && (st.status === "Open" || st.status === "Funded") ? st.fundedKg * st.pricePerKg : 0;
  } catch (err) {
    state.chain.error = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({ ...state, store: storeInUse() });
}
