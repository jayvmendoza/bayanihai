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
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
