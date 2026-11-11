require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");

// Loaded from .env.local when present (same file the Next.js app uses).
require("./scripts/load-env");

const testnetAccounts = [process.env.DEPLOYER_PRIVATE_KEY].filter(Boolean);

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    localhost: { url: "http://127.0.0.1:8545" },
    bscTestnet: {
      url: process.env.RPC_URL || "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
      chainId: 97,
      accounts: testnetAccounts,
    },
  },
};
