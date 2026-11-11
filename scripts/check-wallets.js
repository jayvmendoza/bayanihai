// Prints each demo role's ADDRESS and tBNB balance (never the private keys). Usage: npm run check:wallets
require("./load-env");
const { JsonRpcProvider, Wallet, formatEther } = require("ethers");

const rpc = process.env.RPC_URL;
if (!rpc) {
  console.log("RPC_URL is not set in .env.local (still in local Hardhat mode).");
  process.exit(1);
}

const provider = new JsonRpcProvider(rpc);
const fromKey = (name) => (process.env[name] ? new Wallet(process.env[name]).address : null);

const roles = [
  ["Deployer", fromKey("DEPLOYER_PRIVATE_KEY"), true],
  ["Coordinator", fromKey("COORDINATOR_PRIVATE_KEY") || fromKey("DEMO_PRIVATE_KEY"), true],
  ["AI agent", fromKey("AGENT_PRIVATE_KEY"), true],
  ["Buyer (you)", fromKey("BUYER_PRIVATE_KEY") || fromKey("DEMO_PRIVATE_KEY"), true],
  ["Neighbors", fromKey("NEIGHBORS_PRIVATE_KEY") || fromKey("DEMO_PRIVATE_KEY"), true],
  ["Farmer", process.env.FARMER_ADDRESS || null, false],
  ["Hauler", process.env.HAULER_ADDRESS || null, false],
];

(async () => {
  const net = await provider.getNetwork();
  console.log(`Network chainId ${net.chainId}${net.chainId === 97n ? " (BSC Testnet ✓)" : " (⚠ not BSC Testnet 97)"}\n`);
  let ok = true;
  for (const [role, address, needsGas] of roles) {
    if (!address) {
      console.log(`✗ ${role.padEnd(12)} MISSING in .env.local`);
      ok = false;
      continue;
    }
    const bal = Number(formatEther(await provider.getBalance(address)));
    const low = needsGas && bal < 0.005;
    if (low) ok = false;
    console.log(`${low ? "✗" : "✓"} ${role.padEnd(12)} ${address}  ${bal.toFixed(4)} tBNB${low ? "  ← needs at least 0.005 tBNB" : ""}`);
  }
  const agentAddr = fromKey("AGENT_PRIVATE_KEY");
  if (agentAddr && process.env.AGENT_ADDRESS && agentAddr.toLowerCase() !== process.env.AGENT_ADDRESS.toLowerCase()) {
    console.log("\n✗ AGENT_ADDRESS does not match AGENT_PRIVATE_KEY. They must be the same account.");
    ok = false;
  }
  console.log(ok ? "\nAll set. Run: npm run deploy:testnet" : "\nFix the ✗ lines above, then run this again.");
})().catch((e) => {
  console.error("Could not reach the RPC:", e.shortMessage || e.message);
  process.exit(1);
});
