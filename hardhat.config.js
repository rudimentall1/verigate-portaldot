require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const networks = {
  hardhat: { chainId: 31337 }
};

const portalDotRpcUrl = (process.env.PORTALDOT_RPC_URL || "").trim();
const portalDotChainIdText = (process.env.PORTALDOT_CHAIN_ID || "").trim();

// Keep PortalDot out of Hardhat's network list until both values are explicit.
// This prevents direct Hardhat commands from silently targeting an unverified RPC.
if (portalDotRpcUrl && portalDotChainIdText) {
  if (!/^[1-9][0-9]*$/.test(portalDotChainIdText)) {
    throw new Error("PORTALDOT_CHAIN_ID must be a canonical positive decimal integer.");
  }

  const parsedUrl = new URL(portalDotRpcUrl);
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("PORTALDOT_RPC_URL must use HTTP or HTTPS.");
  }

  const chainId = Number(portalDotChainIdText);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error("PORTALDOT_CHAIN_ID must be a positive safe integer.");
  }

  networks.portaldot = {
    url: portalDotRpcUrl,
    chainId,
    accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : []
  };
}

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } }
  },
  networks,
  mocha: { timeout: 30000 }
};
