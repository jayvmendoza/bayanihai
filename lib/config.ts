import "server-only";
import { HDNodeWallet, JsonRpcProvider, Wallet } from "ethers";

// Hardhat's public test mnemonic: these keys are known to everyone and only valid on a local chain.
const HARDHAT_MNEMONIC = "test test test test test test test test test test test junk";

export const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
export const IS_LOCAL = /127\.0\.0\.1|localhost/.test(RPC_URL);
export const WEI_PER_PESO = BigInt(process.env.WEI_PER_PESO || "1000000000000");
export const EXPLORER_URL = IS_LOCAL ? "" : process.env.EXPLORER_URL || "https://testnet.bscscan.com";

let provider: JsonRpcProvider | undefined;
export function getProvider(): JsonRpcProvider {
  // cacheTimeout -1: never reuse a cached nonce/block between quick back-to-back transactions
  // (otherwise a fast "pay then refund" can fail with "nonce has already been used").
  provider ??= new JsonRpcProvider(RPC_URL, undefined, { cacheTimeout: -1 });
  return provider;
}

function hardhatKey(index: number): string {
  return HDNodeWallet.fromPhrase(HARDHAT_MNEMONIC, undefined, `m/44'/60'/0'/0/${index}`).privateKey;
}

export type Role = "agent" | "coordinator" | "you" | "neighbors" | "farmer";

// Local Hardhat account index for each role (#0 deploys, #2 farmer, #3 hauler).
const ROLE_INDEX: Record<Role, number> = { agent: 1, coordinator: 4, you: 5, neighbors: 6, farmer: 2 };
const ROLE_ENV: Record<Role, string> = {
  agent: "AGENT_PRIVATE_KEY",
  coordinator: "COORDINATOR_PRIVATE_KEY",
  you: "BUYER_PRIVATE_KEY",
  neighbors: "NEIGHBORS_PRIVATE_KEY",
  farmer: "FARMER_PRIVATE_KEY",
};

export function wallet(role: Role): Wallet {
  const key =
    process.env[ROLE_ENV[role]] ||
    (role !== "agent" && role !== "farmer" ? process.env.DEMO_PRIVATE_KEY : undefined) ||
    (IS_LOCAL ? hardhatKey(ROLE_INDEX[role]) : undefined);
  if (!key) throw new Error(`Missing ${ROLE_ENV[role]} (or DEMO_PRIVATE_KEY) in .env.local`);
  return new Wallet(key, getProvider());
}

function addressFor(envName: string, hardhatIndex: number): string {
  const fromEnv = process.env[envName];
  if (fromEnv) return fromEnv;
  if (IS_LOCAL) return new Wallet(hardhatKey(hardhatIndex)).address;
  throw new Error(`Missing ${envName} in .env.local`);
}

// The farmer signs "delivered" with their own key; without a key we fall back to the configured address.
export const farmerAddress = () => (process.env.FARMER_PRIVATE_KEY ? new Wallet(process.env.FARMER_PRIVATE_KEY).address : addressFor("FARMER_ADDRESS", 2));
export const haulerAddress = () => addressFor("HAULER_ADDRESS", 3);

export const pesoToWei = (pesos: number) => BigInt(pesos) * WEI_PER_PESO;
