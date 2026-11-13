import { NextResponse, after, type NextRequest } from "next/server";
import { PRESENTER_COOKIE, isPresenterOnly, presenterToken } from "@/lib/presenter";
import { createHash } from "crypto";
import { farmerAddress, haulerAddress, pesoToWei, wallet } from "@/lib/config";
import { chainNow, escrow, fastForward, readDeal } from "@/lib/chain";
import { checkReceipt, normalizeRef, reviewGroup, suggestPrice } from "@/lib/ai";
import { CROPS, type CropKey } from "@/lib/listing";
import { addLog, aiRunning, groupByPickup, readState, resetState, writeState, type DealRecord, type PayMethod, type State } from "@/lib/store";

export const dynamic = "force-dynamic";
// Gemini + waiting for a BSC block can take a while; give the serverless function room on Vercel.
export const maxDuration = 60;

const DAY = 86400;
const PICKUP = "Brgy. Holy Spirit";

type Body = { action: string; kg?: number; crop?: string; who?: "you" | "neighbors"; scenario?: "success" | "fail"; seconds?: number; image?: string; payFarmer?: boolean };

async function record(deal: DealRecord, label: string, sent: Promise<{ hash: string; wait: () => Promise<unknown> }>): Promise<string> {
  const tx = await sent;
  await tx.wait();
  deal.txs.push({ label, hash: tx.hash });
  return tx.hash;
}

const sha256 = (x: string) => createHash("sha256").update(x).digest("hex");
const METHOD_TL: Record<PayMethod, string> = { gcash: "GCash", cash: "cash", wallet: "crypto wallet" };
const METHOD_ID: Record<PayMethod, number> = { wallet: 0, gcash: 1, cash: 2 }; // BayanihaiEscrow.Method
const NO_PROOF = "0x" + "0".repeat(64);
const CONFIRM_WINDOW = 120; // demo: buyers have 2 minutes to confirm or dispute (production: e.g. 3 days)

/** The buyer's own payment for this round (each payment record is backed by its own on-chain transaction). */
const youPaid = (s: State) => s.payments.some((p) => p.who === "you");

/**
 * Locks the buyer's share in the escrow contract: the ONE place every payment goes. For GCash/cash the pesos were
 * paid off-chain (in production through an on-ramp straight into the contract), so the escrow is funded for the
 * buyer with the payment method and a proof fingerprint. The contract rejects a proof that was used before.
 */
async function lockForYou(s: State, deal: DealRecord, method: PayMethod, proof: string): Promise<string> {
  if (deal.youKg <= 0) throw new Error("You didn't join this group.");
  const c = escrow(wallet("you"));
  const value = pesoToWei(s.listing.buyerPricePerKg) * BigInt(deal.youKg);
  const label = method === "wallet" ? "You locked your payment" : `You locked your payment (${METHOD_TL[method]})`;
  return record(deal, label, c.joinDeal(deal.dealId, deal.youKg, METHOD_ID[method], proof, { value }));
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
  NotFarmer: "Only the farmer can mark the harvest delivered.",
  NotBuyerOrCoordinator: "Only a buyer in this deal or the barangay coordinator can confirm receipt.",
  NotBuyer: "Only a buyer in this deal can raise a dispute.",
  TooEarly: "The buyers' confirm window is still open.",
  ProofAlreadyUsed: "Nagamit na ang resibong ito (blocked by the smart contract).",
  BadParams: "Invalid request.",
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

/** AI Deal Maker: reviews every open group; for a full group the AI wallet creates the deal on-chain. */
async function runDealMaker(s: State, scenario: "success" | "fail"): Promise<DealRecord | null> {
  let created: DealRecord | null = null;
  const c = escrow(wallet("agent"));
  // Review all open groups at the same time (Gemini calls can take a few seconds each).
  const pending = groupByPickup(s.preorders).filter((g) => !s.deals.some((d) => d.pickup === g.pickup));
  const decisions = await Promise.all(pending.map((g) => reviewGroup(g, s.listing)));

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
        pesoToWei(s.listing.buyerPricePerKg),
        pesoToWei(s.listing.farmerPricePerKg),
        g.totalKg,
        now + fundingWindow,
        now + fundingWindow + (scenario === "fail" ? 90 : 3 * DAY),
        CONFIRM_WINDOW
      )
    );
    deal.dealId = Number(await c.dealCount());
    s.deals.push(deal);
    created = deal;
    addLog(s, `Deal #${deal.dealId} created on-chain for ${g.pickup}: ${g.totalKg} kg at ₱${s.listing.buyerPricePerKg}/kg.`);
  }
  return created;
}

/** The neighbors' (simulated) pre-orders pay into the escrow. */
async function payNeighbors(s: State, deal: DealRecord): Promise<void> {
  const kg = deal.totalKg - deal.youKg;
  if (kg <= 0) throw new Error("No neighbor orders to pay.");
  const c = escrow(wallet("neighbors"));
  const amountPesos = kg * s.listing.buyerPricePerKg;
  const txHash = await record(deal, "Neighbors locked their payments", c.joinDeal(deal.dealId, kg, METHOD_ID.wallet, NO_PROOF, { value: pesoToWei(s.listing.buyerPricePerKg) * BigInt(kg) }));
  s.payments.push({ who: "neighbors", method: "wallet", amountPesos, txHash, at: new Date().toISOString() });
  addLog(s, `Neighbors locked ₱${amountPesos.toLocaleString()} for ${kg} kg in escrow.`);
}

/**
 * Runs after a buyer joins, in the background (after the response is sent): the AI reviews the groups,
 * creates the deal on-chain when a group is full, and the simulated neighbors pay. People still do the rest:
 * the buyer pays, and only the coordinator can release the money.
 */
async function autoDeal(round: string): Promise<void> {
  const before = await readState();
  if (before.round !== round || !before.autoRun) return;
  const work: State = structuredClone(before);
  const scenario = before.nextScenario === "fail" ? "fail" : "success";
  try {
    const deal = await runDealMaker(work, scenario);
    if (deal) {
      addLog(work, "Auto: neighbors' pre-orders are paying into escrow.");
      await payNeighbors(work, deal);
    }
  } catch (err) {
    addLog(work, `⚠ Auto AI Deal Maker: ${errorMessage(err)}`);
  }
  // Merge onto the latest state (the buyer may have done something meanwhile); drop it if the round changed.
  const now = await readState();
  if (now.round !== round) return;
  now.reviews = work.reviews;
  now.deals = work.deals;
  now.payments = [...now.payments, ...work.payments.filter((p) => !now.payments.some((q) => q.txHash === p.txHash))];
  const fresh = work.log.filter((l) => !before.log.some((b) => b.at === l.at && b.text === l.text));
  now.log = [...fresh, ...now.log].slice(0, 40);
  now.autoRun = null;
  if (scenario === "fail") now.nextScenario = null; // the refund test applies to one deal only
  await writeState(now);
}

async function handle(s: State, body: Body): Promise<void> {
  switch (body.action) {
    case "reset": {
      Object.assign(s, await resetState());
      return;
    }

    case "price-suggest": {
      const crop = body.crop as CropKey;
      if (!CROPS[crop]) throw new Error("Choose a crop.");
      const kg = Math.round(Number(body.kg));
      if (!(kg >= 50 && kg <= 1000)) throw new Error("Harvest must be 50 to 1,000 kg.");
      const p = await suggestPrice(crop, kg);
      s.priceSuggestion = p;
      addLog(s, `AI Fair Pricing (${p.source}) for ${kg} kg ${p.cropName}: ₱${p.farmerPricePerKg}/kg to farmer, ₱${p.buyerPricePerKg}/kg for buyers (market ₱${p.marketPricePerKg}, middleman ₱${p.middlemanPricePerKg}).`);
      return;
    }

    case "post-harvest": {
      const p = s.priceSuggestion;
      if (!p) throw new Error("Ask the AI for a fair price first.");
      // Posting a new harvest starts a fresh round: new listing, neighbors pre-order it.
      const listing = {
        ...s.listing,
        crop: p.crop,
        cropName: p.cropName,
        farmerPricePerKg: p.farmerPricePerKg,
        transportPerKg: p.transportPerKg,
        buyerPricePerKg: p.buyerPricePerKg,
        marketPricePerKg: p.marketPricePerKg,
        middlemanPricePerKg: p.middlemanPricePerKg,
        minKg: p.kg,
        priceSource: p.source,
        priceReason: p.reason_tl,
      };
      Object.assign(s, await resetState(listing));
      addLog(s, `${listing.farmer} posted ${listing.minKg} kg of ${listing.cropName} at ₱${listing.farmerPricePerKg}/kg (buyers pay ₱${listing.buyerPricePerKg}/kg).`);
      return;
    }

    case "order": {
      const kg = Math.round(Number(body.kg));
      if (!(kg >= 1 && kg <= 5)) throw new Error("Choose 1 to 5 kilos.");
      if (s.deals.some((d) => d.pickup === PICKUP)) throw new Error("This group already has a deal. Reset the demo to order again.");
      s.preorders = s.preorders.filter((o) => !o.isYou);
      s.preorders.push({ id: "you", name: "Ikaw", pickup: PICKUP, kg, isYou: true });
      addLog(s, `You joined ${PICKUP} with ${kg} kg (no payment yet).`);
      // Automatic: the AI Deal Maker reviews the groups right away, in the background.
      if (!aiRunning(s)) {
        s.autoRun = { at: new Date().toISOString() };
        addLog(s, "AI Deal Maker started automatically.");
        const round = s.round;
        after(() => autoDeal(round));
      }
      return;
    }

    case "set-scenario": {
      // Presenter: make the NEXT automatic deal a refund test (90-second deadline).
      s.nextScenario = body.scenario === "fail" ? "fail" : null;
      addLog(s, s.nextScenario ? "Refund test armed: the next deal gets a 90-second deadline." : "Refund test turned off.");
      return;
    }

    case "deal-maker": {
      if (aiRunning(s)) throw new Error("The AI Deal Maker is already running (it starts automatically when a buyer joins).");
      await runDealMaker(s, body.scenario === "fail" ? "fail" : "success");
      return;
    }

    case "pay": {
      const deal = latestDeal(s);
      const who = body.who === "neighbors" ? "neighbors" : "you";
      const kg = who === "you" ? deal.youKg : deal.totalKg - deal.youKg;
      if (kg <= 0) throw new Error(who === "you" ? "You didn't join this group." : "No neighbor orders to pay.");
      if (who === "neighbors") {
        if (s.payments.some((p) => p.who === "neighbors")) throw new Error("The neighbors already paid.");
        await payNeighbors(s, deal);
        return;
      }
      if (youPaid(s)) throw new Error("Bayad ka na sa deal na ito.");
      const amountPesos = kg * s.listing.buyerPricePerKg;
      const txHash = await lockForYou(s, deal, "wallet", NO_PROOF);
      s.payments.push({ who, method: "wallet", amountPesos, txHash, at: new Date().toISOString() });
      addLog(s, `You locked ₱${amountPesos.toLocaleString()} for ${kg} kg in escrow.`);
      return;
    }

    case "pay-gcash": {
      // Buyer paid with GCash and uploads the receipt. The AI reads it, the rules decide, then the escrow is funded.
      const deal = latestDeal(s);
      if (deal.youKg <= 0) throw new Error("You didn't join this group.");
      if (youPaid(s)) throw new Error("Bayad ka na sa deal na ito.");
      const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.image ?? "");
      if (!m) throw new Error("Mag-upload ng larawan ng resibo (PNG o JPG).");
      if (m[2].length > 4_000_000) throw new Error("Masyadong malaki ang larawan.");
      const expected = deal.youKg * s.listing.buyerPricePerKg;
      const imageHash = sha256(m[2]);
      const cached = s.receiptReads.find((r) => r.imageHash === imageHash)?.read ?? null;
      const check = await checkReceipt({ mime: m[1], base64: m[2] }, expected, (ref) => s.usedRefs.includes(sha256(ref)), cached);
      if (check.read && !cached) s.receiptReads = [{ imageHash, read: check.read }, ...s.receiptReads].slice(0, 30);
      s.lastReceipt = check;
      addLog(s, `AI receipt check (${check.source}): ${check.ok ? "PASSED" : "REJECTED"}. ${check.summary_tl}`);
      if (!check.ok) throw new Error(check.summary_tl);

      const refHash = sha256(normalizeRef(check.read?.reference_no));
      const proof = "0x" + refHash; // the contract stores it and refuses it a second time
      const txHash = await lockForYou(s, deal, "gcash", proof);
      s.usedRefs.push(refHash); // only after the lock succeeds
      s.payments.push({ who: "you", method: "gcash", amountPesos: expected, refMasked: check.refMasked ?? undefined, proof, aiVerified: true, txHash, at: new Date().toISOString() });
      addLog(s, `GCash ₱${expected.toLocaleString()} verified by AI (ref ${check.refMasked}) and locked in the escrow contract with its receipt fingerprint.`);
      return;
    }

    case "pay-cash-intent": {
      // Buyer will hand cash to the barangay coordinator. Nothing moves on-chain until the coordinator confirms.
      const deal = latestDeal(s);
      if (deal.youKg <= 0) throw new Error("You didn't join this group.");
      if (youPaid(s)) throw new Error("Bayad ka na sa deal na ito.");
      const amountPesos = deal.youKg * s.listing.buyerPricePerKg;
      s.cashPending = { amountPesos, at: new Date().toISOString() };
      addLog(s, `You chose to pay ₱${amountPesos.toLocaleString()} in cash to the barangay coordinator.`);
      return;
    }

    case "cash-received": {
      // Coordinator confirms the cash; the escrow is funded and the cash receipt is recorded on-chain.
      const deal = latestDeal(s);
      if (!s.cashPending) throw new Error("No cash payment is waiting for confirmation.");
      const amountPesos = s.cashPending.amountPesos;
      const proof = "0x" + sha256(`cash|${wallet("coordinator").address}|deal:${deal.dealId}|${s.cashPending.at}`);
      const txHash = await lockForYou(s, deal, "cash", proof);
      s.cashPending = null;
      s.payments.push({ who: "you", method: "cash", amountPesos, proof, txHash, at: new Date().toISOString() });
      addLog(s, `Coordinator confirmed ₱${amountPesos.toLocaleString()} cash. Locked in escrow and recorded on-chain.`);
      return;
    }

    case "mark-delivered": {
      // The farmer says the harvest was delivered. The money stays in the escrow until the buyer side confirms.
      const deal = latestDeal(s);
      await record(deal, "Farmer marked the harvest delivered", escrow(wallet("farmer")).markDelivered(deal.dealId));
      addLog(s, `${s.listing.farmer} marked the harvest delivered. Buyers have ${CONFIRM_WINDOW / 60} minutes to confirm or report a problem.`);
      return;
    }

    case "receive": {
      // A buyer confirms the produce arrived -> the contract pays the farmer and the hauler.
      const deal = latestDeal(s);
      await record(deal, "Buyer confirmed receipt", escrow(wallet("you")).confirmReceived(deal.dealId));
      const d = await readDeal(deal.dealId);
      addLog(s, `Buyer confirmed receipt. Farmer received ₱${(d.fundedKg * d.farmerPricePerKg).toLocaleString()}, hauler ₱${(d.fundedKg * (d.pricePerKg - d.farmerPricePerKg)).toLocaleString()}.`);
      return;
    }

    case "confirm": {
      // Coordinator confirms receipt for the whole pickup group (same effect as a buyer confirming).
      const deal = latestDeal(s);
      await record(deal, "Coordinator confirmed receipt", escrow(wallet("coordinator")).confirmReceived(deal.dealId));
      const d = await readDeal(deal.dealId);
      addLog(s, `Coordinator confirmed receipt. Farmer received ₱${(d.fundedKg * d.farmerPricePerKg).toLocaleString()}, hauler ₱${(d.fundedKg * (d.pricePerKg - d.farmerPricePerKg)).toLocaleString()}.`);
      return;
    }

    case "dispute": {
      // A buyer reports the produce did not arrive: the auto-payout is blocked and the coordinator decides.
      const deal = latestDeal(s);
      await record(deal, "Buyer reported a problem", escrow(wallet("you")).dispute(deal.dealId));
      addLog(s, "A buyer reported that the delivery did not arrive. The money stays locked until the coordinator decides.");
      return;
    }

    case "resolve": {
      // Coordinator settles a dispute: pay the farmer, or let the buyers claim refunds.
      const deal = latestDeal(s);
      const payFarmer = body.payFarmer === true;
      await record(deal, payFarmer ? "Coordinator resolved: pay farmer" : "Coordinator resolved: refund buyers", escrow(wallet("coordinator")).resolveDispute(deal.dealId, payFarmer));
      addLog(s, payFarmer ? "Coordinator checked the delivery: the farmer is paid." : "Coordinator checked the delivery: buyers can now claim refunds.");
      return;
    }

    case "claim-window": {
      // Nobody confirmed or disputed in time: the farmer is paid (anyone can trigger it).
      const deal = latestDeal(s);
      await record(deal, "Farmer claimed after the confirm window", escrow(wallet("farmer")).claimAfterWindow(deal.dealId));
      addLog(s, "No buyer confirmed or disputed in time, so the contract paid the farmer.");
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
        refunded += kg * s.listing.buyerPricePerKg;
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

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Body;

  // Public deployment: presenter-only actions need the cookie set by the /demo login (see middleware.ts).
  const password = process.env.DEMO_PASSWORD;
  if (password && isPresenterOnly(body.action, body.who)) {
    if (req.cookies.get(PRESENTER_COOKIE)?.value !== (await presenterToken(password))) {
      return NextResponse.json({ ok: false, error: "Presenter only: open /demo and log in first." }, { status: 401 });
    }
  }

  const s = await readState();
  try {
    await handle(s, body);
    await writeState(s);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = errorMessage(err);
    addLog(s, `⚠ ${msg}`);
    await writeState(s);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
