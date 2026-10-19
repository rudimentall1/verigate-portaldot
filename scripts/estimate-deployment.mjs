import "dotenv/config";
import { createRequire } from "node:module";
import { ethers as ethersLib } from "ethers";

const require = createRequire(import.meta.url);
const { requiredNetworkConfig, rpc, rpcResult, readGenesisHash } = require("./preflight.js");
const { parseHexQuantity, formatUnitsExact, calculateDeploymentCost } = require("./deployment-estimate.js");

async function main() {
  const config = requiredNetworkConfig();
  const actualChainId = BigInt(await rpc(config.rpcUrl, "eth_chainId"));
  if (actualChainId !== config.expectedChainId) {
    throw new Error(`RPC chain ID ${actualChainId} does not match configured ${config.expectedChainId}; no estimate made.`);
  }

  let actualGenesisHash = null;
  if (config.expectedGenesisHash) {
    actualGenesisHash = await readGenesisHash(config.rpcUrl, config.expectedGenesisHash);
  }

  const authoritySigner = (process.env.AUTHORITY_SIGNER_ADDRESS || "").trim();
  if (!authoritySigner || !ethersLib.isAddress(authoritySigner) || ethersLib.getAddress(authoritySigner) === ethersLib.ZeroAddress) {
    throw new Error("AUTHORITY_SIGNER_ADDRESS must be a valid non-zero EVM address so the exact deployment init code can be estimated.");
  }

  // This is a public address only. The script never signs or sends a transaction.
  const estimateFrom = (process.env.DEPLOYMENT_ESTIMATE_FROM || "").trim() ||
    (process.env.DEPLOYER_PRIVATE_KEY ? new ethersLib.Wallet(process.env.DEPLOYER_PRIVATE_KEY).address : "");
  if (!estimateFrom || !ethersLib.isAddress(estimateFrom)) {
    throw new Error(
      "Set DEPLOYMENT_ESTIMATE_FROM to the public EVM address that will pay for deployment. " +
      "Do not paste a private key into this setting."
    );
  }

  const hre = (await import("hardhat")).default;
  const { ethers: localEthers } = await hre.network.create();
  const factory = await localEthers.getContractFactory("PortalDotAgentGuard");
  const deploymentTx = await factory.getDeployTransaction(ethersLib.getAddress(authoritySigner));
  if (typeof deploymentTx.data !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(deploymentTx.data)) {
    throw new Error("Compiled PortalDotAgentGuard creation bytecode is missing or malformed; run npm run compile.");
  }

  const initCodeBytes = (deploymentTx.data.length - 2) / 2;
  const estimateResponse = await rpcResult(config.rpcUrl, "eth_estimateGas", [{
    from: ethersLib.getAddress(estimateFrom),
    data: deploymentTx.data
  }]);
  const gasUnits = parseHexQuantity(estimateResponse, "eth_estimateGas result");
  const gasPriceWei = parseHexQuantity(await rpc(config.rpcUrl, "eth_gasPrice"), "eth_gasPrice result");
  const balanceWei = parseHexQuantity(
    await rpcResult(config.rpcUrl, "eth_getBalance", [ethersLib.getAddress(estimateFrom), "latest"]),
    "eth_getBalance result"
  );
  const calc = calculateDeploymentCost({
    gasUnits,
    gasPriceWei,
    balanceWei,
    safetyMarginBps: 2000
  });

  const result = {
    network: "PortalDot V3 EVM Testnet",
    rpcOrigin: new URL(config.rpcUrl).origin,
    expectedChainId: config.expectedChainId.toString(),
    actualChainId: actualChainId.toString(),
    genesisHashPinConfigured: Boolean(config.expectedGenesisHash),
    ...(actualGenesisHash ? { genesisHash: actualGenesisHash } : {}),
    deployerAddress: ethersLib.getAddress(estimateFrom),
    authoritySigner: ethersLib.getAddress(authoritySigner),
    contract: "PortalDotAgentGuard",
    creationBytecodeBytes: initCodeBytes,
    estimatedGasUnits: gasUnits.toString(),
    gasPriceWei: gasPriceWei.toString(),
    estimatedCostWei: calc.estimatedCostWei.toString(),
    estimatedCostPot: formatUnitsExact(calc.estimatedCostWei, 18, 6),
    safetyMarginPercent: "20",
    costWithSafetyMarginWei: calc.costWithMarginWei.toString(),
    costWithSafetyMarginPot: formatUnitsExact(calc.costWithMarginWei, 18, 6),
    deployerBalanceWei: balanceWei.toString(),
    deployerBalancePot: formatUnitsExact(balanceWei, 18, 6),
    budgetStatus: calc.isSufficient ? "sufficient_with_20_percent_margin" : "insufficient_for_20_percent_margin",
    shortfallWei: calc.shortfallWei.toString(),
    note: "Read-only estimate only: no private key is used to sign, no transaction is sent. PortalDot V3 may charge a code storage deposit through its gas estimate; confirm this result immediately before deployment. Values can change with bytecode, runtime state, gas price, and balance."
  };
  console.log(JSON.stringify(result, null, 2));
  if (!calc.isSufficient) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`Deployment estimate failed: ${error.message}`);
  process.exitCode = 1;
});
