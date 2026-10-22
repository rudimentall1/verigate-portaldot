import "dotenv/config";
import { createRequire } from "node:module";
import { ethers as ethersLib } from "ethers";

const require = createRequire(import.meta.url);
const {
  parseExpectedSubstrateGenesisHash,
  validateSubstrateRpcUrl,
  verifySubstrateGenesisHash
} = require("./substrate-genesis.js");
const { rpcResult } = require("./preflight.js");
const {
  parseHexQuantity,
  calculateDeploymentCost,
  formatUnitsExact
} = require("./deployment-estimate.js");
const hre = (await import("hardhat")).default;

async function main() {
  const rpcUrl = (process.env.PORTALDOT_RPC_URL || "").trim();
  if (!rpcUrl || (process.env.PORTALDOT_CHAIN_ID || "").trim() !== "420420777") {
    throw new Error("Configure PORTALDOT_RPC_URL and PORTALDOT_CHAIN_ID=420420777; no transaction sent.");
  }

  const privateKey = (process.env.DEPLOYER_PRIVATE_KEY || "").trim();
  if (!privateKey) throw new Error("DEPLOYER_PRIVATE_KEY is required to quote the actual deployer balance; no transaction sent.");
  const deployerAddress = ethersLib.getAddress(new ethersLib.Wallet(
    privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`
  ).address);

  const required = [
    "ADMIN_ADDRESS", "AUTHORITY_SIGNER_ADDRESS", "V2_INITIAL_RECIPIENT",
    "V2_MAX_PER_TRANSFER_WEI", "V2_WINDOW_LIMIT_WEI", "V2_WINDOW_SECONDS"
  ];
  for (const key of required) {
    if (!(process.env[key] || "").trim()) {
      throw new Error(`${key} is required for a V2 estimate; no transaction sent.`);
    }
  }

  const admin = ethersLib.getAddress(process.env.ADMIN_ADDRESS);
  const authoritySigner = ethersLib.getAddress(process.env.AUTHORITY_SIGNER_ADDRESS);
  const initialRecipient = ethersLib.getAddress(process.env.V2_INITIAL_RECIPIENT);
  const maxPerTransfer = BigInt(process.env.V2_MAX_PER_TRANSFER_WEI);
  const windowLimit = BigInt(process.env.V2_WINDOW_LIMIT_WEI);
  const windowSeconds = Number(process.env.V2_WINDOW_SECONDS);

  if ([admin, authoritySigner, initialRecipient].some(a => a === ethersLib.ZeroAddress)) {
    throw new Error("V2 role addresses must not be zero.");
  }
  if (admin === authoritySigner || deployerAddress === admin || deployerAddress === authoritySigner) {
    throw new Error("Deployer, admin and authority signer must be three distinct addresses.");
  }
  if ([deployerAddress, admin, authoritySigner].includes(initialRecipient)) {
    throw new Error("V2 initial recipient must be separate from deployer, admin and authority signer.");
  }
  if (maxPerTransfer <= 0n || windowLimit < maxPerTransfer ||
      !Number.isSafeInteger(windowSeconds) || windowSeconds <= 0) {
    throw new Error("Invalid V2 policy values.");
  }

  const networkConfig = await (async () => {
    const { ethers } = await hre.network.create();
    return { ethers, network: await ethers.provider.getNetwork() };
  })();
  const rpcChainId = parseHexQuantity(await rpcResult(rpcUrl, "eth_chainId", []), "eth_chainId");
  if (networkConfig.network.chainId !== 420420777n || rpcChainId !== 420420777n) {
    throw new Error("Provider and configured RPC must both report chain ID 420420777; no transaction sent.");
  }
  const substrateRpcUrl = validateSubstrateRpcUrl(process.env.PORTALDOT_SUBSTRATE_RPC_URL);
  const expectedGenesis = parseExpectedSubstrateGenesisHash(process.env.PORTALDOT_SUBSTRATE_GENESIS_HASH);
  const actualGenesis = await verifySubstrateGenesisHash(substrateRpcUrl, expectedGenesis);

  const factory = await networkConfig.ethers.getContractFactory("PortalDotAgentGuardV2");
  const deploymentTx = await factory.getDeployTransaction(
    admin, authoritySigner, initialRecipient, maxPerTransfer, windowLimit, windowSeconds
  );
  if (typeof deploymentTx.data !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(deploymentTx.data)) {
    throw new Error("V2 creation bytecode is missing or malformed; run npm run compile.");
  }

  const estimatedGas = parseHexQuantity(
    await rpcResult(rpcUrl, "eth_estimateGas", [{ from: deployerAddress, data: deploymentTx.data }]),
    "eth_estimateGas"
  );
  const latest = await rpcResult(rpcUrl, "eth_getBlockByNumber", ["latest", false]);
  if (!latest || typeof latest.baseFeePerGas !== "string") {
    throw new Error("PortalDot RPC did not return baseFeePerGas; no budget estimate made.");
  }
  const baseFee = parseHexQuantity(latest.baseFeePerGas, "baseFeePerGas");
  const priorityFee = parseHexQuantity(await rpcResult(rpcUrl, "eth_maxPriorityFeePerGas", []), "priority fee");
  const maxFee = baseFee * 2n + priorityFee;
  const balance = parseHexQuantity(
    await rpcResult(rpcUrl, "eth_getBalance", [deployerAddress, "latest"]),
    "deployer balance"
  );
  const budget = calculateDeploymentCost({
    gasUnits: estimatedGas,
    gasPriceWei: maxFee,
    balanceWei: balance,
    safetyMarginBps: 2000
  });

  console.log(JSON.stringify({
    mode: "read-only; no signing or broadcast",
    network: "PortalDot V3 EVM Testnet",
    rpcOrigin: new URL(rpcUrl).origin,
    chainId: rpcChainId.toString(),
    substrateGenesisHash: actualGenesis,
    deployer: deployerAddress,
    admin,
    authoritySigner,
    initialRecipient,
    maxPerTransferWei: maxPerTransfer.toString(),
    windowLimitWei: windowLimit.toString(),
    windowSeconds,
    creationBytecodeBytes: (deploymentTx.data.length - 2) / 2,
    estimatedGasUnits: estimatedGas.toString(),
    maxFeePerGasWei: maxFee.toString(),
    estimatedCostPot: formatUnitsExact(budget.estimatedCostWei, 18, 6),
    requiredWith20PercentMarginPot: formatUnitsExact(budget.costWithMarginWei, 18, 6),
    deployerBalanceWei: balance.toString(),
    deployerBalancePot: formatUnitsExact(balance, 18, 6),
    budgetStatus: budget.isSufficient ? "sufficient_with_20_percent_margin" : "insufficient_for_20_percent_margin",
    shortfallPot: formatUnitsExact(budget.shortfallWei, 18, 6),
    note: "An estimate is not proof of successful deployment. Compare reported EVM balance with the recently transferred native tPOT before broadcasting."
  }, null, 2));

  if (!budget.isSufficient) process.exitCode = 2;
}

main().catch(error => {
  console.error(`V2 deployment estimate failed: ${error.message}`);
  process.exitCode = 1;
});
