import { NextResponse } from "next/server";
import type { ContractTransactionResponse } from "ethers";
import { farmerAddress, haulerAddress, pesoToWei, wallet } from "@/lib/config";
import { chainNow, escrow, fastForward, readDeal } from "@/lib/chain";
import { reviewGroup } from "@/lib/ai";
import { LISTING } from "@/lib/listing";
import { addLog, groupByPickup, readState, resetState, writeState, type DealRecord, type State } from "@/lib/store";

export const dynamic = "force-dynamic";

const DAY = 86400;
const PICKUP = "Brgy. Holy Spirit";

type Body = { action: string; kg?: number; who?: "you" | "neighbors"; scenario?: "success" | "fail"; seconds?: number };

async function record(deal: DealRecord, label: string, sent: Promise<ContractTransactionResponse>) {
  const tx = await sent;
  await tx.wait();
  deal.txs.push({ label, hash: tx.hash });
}

function latestDeal(s: State): DealRecord {
  const d = s.deals.at(-1);
  if (!d) throw new Error("No deal yet. Run the AI Deal Maker first.");
  return d;
}

// Plain-language explanations for the contract's custom errors.
const FRIENDLY: Record<string, string> = {
  NotAgent: "Only the AI agent can create deals.",
  NotCoordinator: "Only the barangay coordinator can confirm delivery.",
  WrongStatus: "Not allowed at this step (check the deal status).",
  DeadlinePassed: "The deadline has passed.",
  WrongAmount: "Wrong payment amount.",
  OverTarget: "Already paid, or this would go over the group target.",
  NotRefundable: "Refunds open only if the group fails or delivery doesn't happen in time.",
  NothingToRefund: "Nothing to refund.",
};

function errorMessage(err: unknown): string {
  const e = err as { revert?: { name?: string }; data?: string; info?: { error?: { data?: string | { data?: string } } }; shortMessage?: string; message?: string };
  let name = e?.revert?.name;
  if (!name) {
    const raw = e?.data ?? e?.info?.error?.data;
    const data = typeof raw === "string" ? raw : raw?.data;
    if (data) {
      try {
        name = escrow().interface.parseError(data)?.name;
      } catch {
        /* not one of ours */
      }
    }
  }
  if (name) return `Contract rejected (${name}): ${FRIENDLY[name] ?? ""}`.trim();
  return e?.shortMessage || e?.message || String(err);
}

async function handle(s: State, body: Body): Promise<void> {
  switch (body.action) {
    case "reset": {
      Object.assign(s, resetState());
      return;
    }

    case "order": {
      const kg = Math.round(Number(body.kg));
      if (!(kg >= 1 && kg <= 5)) throw new Error("Choose 1 to 5 kilos.");
      if (s.deals.some((d) => d.pickup === PICKUP)) throw new Error("This group already has a deal. Reset the demo to order again.");
      s.preorders = s.preorders.filter((o) => !o.isYou);
      s.preorders.push({ id: "you", name: "Ikaw", pickup: PICKUP, kg, isYou: true });
      addLog(s, `You joined ${PICKUP} with ${kg} kg (no payment yet).`);
      return;
    }

    case "deal-maker": {
      const scenario = body.scenario === "fail" ? "fail" : "success";
      const c = escrow(wallet("agent"));
      // Review all open groups at the same time (Gemini calls can take a few seconds each).
      const pending = groupByPickup(s.preorders).filter((g) => !s.deals.some((d) => d.pickup === g.pickup));
      const decisions = await Promise.all(pending.map((g) => reviewGroup(g)));

      for (const [i, g] of pending.entries()) {
        const ai = decisions[i];
        s.reviews.push({ pickup: g.pickup, totalKg: g.totalKg, buyerCount: g.buyerCount, ai, at: new Date().toISOString() });
        addLog(s, `AI (${ai.source}) reviewed ${g.pickup}: ${ai.create_deal ? "CREATE DEAL" : "WAIT"}. ${ai.reason}`);
        if (!ai.create_deal) continue;

        const now = await chainNow();
        const fundingWindow = scenario === "fail" ? 90 : DAY;
        const deal: DealRecord = { dealId: 0, pickup: g.pickup, totalKg: g.totalKg, buyerCount: g.buyerCount, youKg: g.youKg, scenario, ai, txs: [] };
        await record(
          deal,
          "AI agent created the deal",
          c.createDeal(
            farmerAddress(),
            haulerAddress(),
            wallet("coordinator").address,
            pesoToWei(LISTING.buyerPricePerKg),
            pesoToWei(LISTING.farmerPricePerKg),
            g.totalKg,
            now + fundingWindow,
            now + fundingWindow + (scenario === "fail" ? 90 : 3 * DAY)
          )
        );
        deal.dealId = Number(await c.dealCount());
        s.deals.push(deal);
        addLog(s, `Deal #${deal.dealId} created on-chain for ${g.pickup}: ${g.totalKg} kg at ₱${LISTING.buyerPricePerKg}/kg.`);
      }
      return;
    }

    case "pay": {
      const deal = latestDeal(s);
      const who = body.who === "neighbors" ? "neighbors" : "you";
      const kg = who === "you" ? deal.youKg : deal.totalKg - deal.youKg;
      if (kg <= 0) throw new Error(who === "you" ? "You didn't join this group." : "No neighbor orders to pay.");
      const c = escrow(wallet(who));
      const value = pesoToWei(LISTING.buyerPricePerKg) * BigInt(kg);
      await record(deal, who === "you" ? "You locked your payment" : "Neighbors locked their payments", c.joinDeal(deal.dealId, kg, { value }));
      addLog(s, `${who === "you" ? "You" : "Neighbors"} locked ₱${(kg * LISTING.buyerPricePerKg).toLocaleString()} for ${kg} kg in escrow.`);
      return;
    }

    case "confirm": {
      const deal = latestDeal(s);
      const c = escrow(wallet("coordinator"));
      await record(deal, "Coordinator confirmed delivery", c.confirmDelivery(deal.dealId));
      const d = await readDeal(deal.dealId);
      addLog(s, `Delivery confirmed. Farmer received ₱${(d.fundedKg * d.farmerPricePerKg).toLocaleString()}, hauler ₱${(d.fundedKg * (d.pricePerKg - d.farmerPricePerKg)).toLocaleString()}.`);
      return;
    }

    case "refund": {
      const deal = latestDeal(s);
      let refunded = 0;
      for (const who of ["you", "neighbors"] as const) {
        const c = escrow(wallet(who));
        const kg = Number(await c.kgOf(deal.dealId, wallet(who).address));
        if (kg === 0) continue;
        await record(deal, who === "you" ? "You claimed your refund" : "Neighbors claimed refunds", c.claimRefund(deal.dealId));
        refunded += kg * LISTING.buyerPricePerKg;
      }
      if (refunded === 0) throw new Error("Nothing to refund.");
      addLog(s, `Refunded ₱${refunded.toLocaleString()} back to buyers.`);
      return;
    }

    case "fast-forward": {
      const seconds = Math.max(1, Math.round(Number(body.seconds) || 120));
      await fastForward(seconds);
      addLog(s, `Fast-forwarded the local chain by ${seconds} seconds.`);
      return;
    }

    default:
      throw new Error(`Unknown action: ${body.action}`);
  }
}

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const s = readState();
  try {
    await handle(s, body);
    writeState(s);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = errorMessage(err);
    addLog(s, `⚠ ${msg}`);
    writeState(s);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
