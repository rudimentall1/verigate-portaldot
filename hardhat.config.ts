import { defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import "dotenv/config";

const simulatedChainIdText = (process.env.PORTALDOT_SIMULATED_CHAIN_ID || "31337").trim();
if (!/^[1-9][0-9]*$/.test(simulatedChainIdText) ||
    !Number.isSafeInteger(Number(simulatedChainIdText))) {
  throw new Error("PORTALDOT_SIMULATED_CHAIN_ID must be a positive safe integer.");
}
const simulatedChainId = Number(simulatedChainIdText);

const networks: Record<string, any> = {
  hardhatMainnet: { type: "edr-simulated", chainType: "l1", chainId: simulatedChainId }
};

const rpcUrl = (process.env.PORTALDOT_RPC_URL || "").trim();
const chainIdText = (process.env.PORTALDOT_CHAIN_ID || "").trim();
if (Boolean(rpcUrl) !== Boolean(chainIdText)) {
  throw new Error("PORTALDOT_RPC_URL and PORTALDOT_CHAIN_ID must be configured together.");
}
if (rpcUrl && chainIdText) {
  if (!/^[1-9][0-9]*$/.test(chainIdText)) {
    throw new Error("PORTALDOT_CHAIN_ID must be a canonical positive decimal integer.");
  }
  const parsedUrl = new URL(rpcUrl);
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("PORTALDOT_RPC_URL must use HTTP or HTTPS.");
  }
  if (parsedUrl.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(parsedUrl.hostname)) {
    throw new Error("Remote RPC endpoints must use HTTPS.");
  }
  const chainId = Number(chainIdText);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error("PORTALDOT_CHAIN_ID must be a positive safe integer.");
  }
  networks.portaldot = {
    type: "http",
    chainType: "generic",
    url: rpcUrl,
    chainId,
    accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : []
  };
}

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  solidity: { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 200 } } },
  networks
});
