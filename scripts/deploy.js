// Deploys BayanihaiEscrow and writes the address + ABI to lib/contract.json for the web app.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();

  // The AI Deal Maker wallet. Locally we use Hardhat account #1; on testnet set AGENT_ADDRESS.
  let agent = process.env.AGENT_ADDRESS;
  if (!agent) {
    if (network.name === "bscTestnet") throw new Error("Set AGENT_ADDRESS in .env.local before deploying to testnet.");
    agent = (await ethers.getSigners())[1].address;
  }

  const escrow = await ethers.deployContract("BayanihaiEscrow", [agent]);
  await escrow.waitForDeployment();
  const address = await escrow.getAddress();

  const artifact = await hre.artifacts.readArtifact("BayanihaiEscrow");
  const out = path.join(__dirname, "..", "lib", "contract.json");
  fs.writeFileSync(
    out,
    JSON.stringify({ network: network.name, chainId: Number(network.config.chainId ?? 31337), address, agent, abi: artifact.abi }, null, 2)
  );

  console.log(`Deployer: ${deployer.address}`);
  console.log(`AI agent: ${agent}`);
  console.log(`BayanihaiEscrow deployed to ${address} on ${network.name}`);
  console.log(`Wrote ${path.relative(process.cwd(), out)}`);

  if (network.name === "bscTestnet") {
    // Public copy the deployed app reads (committed; it holds only the address + ABI).
    const pub = path.join(__dirname, "..", "lib", "deployments", "bscTestnet.json");
    fs.mkdirSync(path.dirname(pub), { recursive: true });
    fs.copyFileSync(out, pub);
    console.log(`Wrote ${path.relative(process.cwd(), pub)} (commit this so Vercel uses the new contract)`);

    // Everything needed for "Verify and Publish" on testnet.bscscan.com (no API key needed).
    const ctorArgs = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [agent]).slice(2);
    const lines = [
      `Contract address:   ${address}`,
      `Open:               https://testnet.bscscan.com/verifyContract?a=${address}`,
      `Compiler type:      Solidity (Single file)`,
      `Compiler version:   v0.8.24 (pick the +commit entry for 0.8.24)`,
      `License:            MIT`,
      `Optimization:       Yes, 200 runs`,
      `EVM version:        paris`,
      `Source code:        paste verify/BayanihaiEscrow.flat.sol`,
      `Constructor args:   ${ctorArgs}`,
    ];
    fs.writeFileSync(path.join(__dirname, "..", "verify", "bscscan-settings.txt"), lines.join("\n") + "\n");
    console.log("\nBscScan verification settings (also saved to verify/bscscan-settings.txt):");
    console.log(lines.join("\n"));
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
