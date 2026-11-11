import "server-only";
import fs from "fs";
import path from "path";
import { Contract, type ContractRunner } from "ethers";
import { getProvider, IS_LOCAL, WEI_PER_PESO } from "./config";

export const STATUS = ["Open", "Funded", "Released", "Refunded"] as const;
export type DealStatus = (typeof STATUS)[number];

type Deployment = { network: string; chainId: number; address: string; agent: string; abi: unknown[] };

export function loadDeployment(): Deployment | null {
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
  const block = await getProvider().getBlock("latest");
  return block ? block.timestamp : Math.floor(Date.now() / 1000);
}

/** Local Hardhat only: jump the chain clock forward so deadlines pass during a live demo. */
export async function fastForward(seconds: number): Promise<void> {
  if (!IS_LOCAL) throw new Error("Fast-forward only works on the local Hardhat chain.");
  await getProvider().send("evm_increaseTime", [seconds]);
  await getProvider().send("evm_mine", []);
}
