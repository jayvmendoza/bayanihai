import "server-only";
import fs from "fs";
import path from "path";
import { Contract, type ContractRunner } from "ethers";
import { getProvider, IS_LOCAL, WEI_PER_PESO } from "./config";
import testnetDeployment from "./deployments/bscTestnet.json";

export const STATUS = ["Open", "Funded", "Released", "Refunded"] as const;
export type DealStatus = (typeof STATUS)[number];

type Deployment = { network: string; chainId: number; address: string; agent: string; abi: unknown[] };

// Testnet: the committed deployment (bundled at build time, so it works on Vercel).
// Local Hardhat chain: lib/contract.json, written by `npm run deploy:local` (git-ignored).
export function loadDeployment(): Deployment | null {
  if (!IS_LOCAL) return testnetDeployment as Deployment;
  const file = path.join(process.cwd(), "lib", "contract.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as Deployment;
}

export function escrow(runner: ContractRunner = getProvider()): Contract {
  const d = loadDeployment();
  if (!d) throw new Error("Contract not deployed yet. Run: npm run deploy:local");
  return new Contract(d.address, d.abi as never, runner);
}

export type OnChainDeal = {
  dealId: number;
  status: DealStatus;
  targetKg: number;
  fundedKg: number;
  pricePerKg: number; // pesos
  farmerPricePerKg: number; // pesos
  fundingDeadline: number; // unix seconds
  deliveryDeadline: number;
  refundable: boolean;
};

const toPeso = (wei: bigint) => Number(wei / WEI_PER_PESO);

export async function readDeal(dealId: number): Promise<OnChainDeal> {
  const c = escrow();
  const d = await c.deals(dealId);
  return {
    dealId,
    status: STATUS[Number(d.status)],
    targetKg: Number(d.targetKg),
    fundedKg: Number(d.fundedKg),
    pricePerKg: toPeso(d.pricePerKg),
    farmerPricePerKg: toPeso(d.farmerPricePerKg),
    fundingDeadline: Number(d.fundingDeadline),
    deliveryDeadline: Number(d.deliveryDeadline),
    refundable: await c.isRefundable(dealId),
  };
}

export async function escrowBalancePesos(): Promise<number> {
  const d = loadDeployment();
  if (!d) return 0;
  return toPeso(await getProvider().getBalance(d.address));
}

export async function chainNow(): Promise<number> {
  // A local Hardhat chain only mines on transactions, so after idle time the latest block's timestamp is stale
  // (deadlines computed from it can already be in the past). Mine an empty block first to sync the clock.
  if (IS_LOCAL) await getProvider().send("evm_mine", []);
  const block = await getProvider().getBlock("latest");
  return block ? block.timestamp : Math.floor(Date.now() / 1000);
}

/** Local Hardhat only: jump the chain clock forward so deadlines pass during a live demo. */
export async function fastForward(seconds: number): Promise<void> {
  if (!IS_LOCAL) throw new Error("Fast-forward only works on the local Hardhat chain.");
  await getProvider().send("evm_increaseTime", [seconds]);
  await getProvider().send("evm_mine", []);
}
