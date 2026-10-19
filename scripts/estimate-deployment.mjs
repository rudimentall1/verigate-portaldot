import "dotenv/config";
import { createRequire } from "node:module";
import { ethers as ethersLib } from "ethers";

const require = createRequire(import.meta.url);
const { requiredNetworkConfig, rpc, rpcResult } = require("./preflight.js");
const { verifySubstrateGenesisHash } = require("./substrate-genesis.js");
const { parseHexQuantity, formatUnitsExact, calculateDeploymentCost, buildDeploymentReadiness, deploymentEstimateExitCode, resolveEstimateAuthoritySigner, resolveEstimateFromAddresses } = require("./deployment-estimate.js");

async function main() {
  const config = requiredNetworkConfig();
  const actualChainId = BigInt(await rpc(config.rpcUrl, "eth_chainId"));
  if (actualChainId !== config.expectedChainId) {
    throw new Error(`RPC chain ID ${actualChainId} does not match configured ${config.expectedChainId}; no estimate made.`);
  }

  const actualSubstrateGenesisHash = await verifySubstrateGenesisHash(config.substrateRpcUrl, config.expectedSubstrateGenesisHash);

  // Estimation does not sign or deploy. If the real authority signer has not been
  // selected yet, use a clearly labelled non-zero placeholder; the constructor
  // argument is fixed-width, so this still builds valid init code for cost probing.
  // Actual deployment continues to require AUTHORITY_SIGNER_ADDRESS in deploy.mjs.
  const authoritySelection = resolveEstimateAuthoritySigner(process.env.AUTHORITY_SIGNER_ADDRESS);
  const authoritySignerIsPlaceholder = authoritySelection.isPlaceholder;
  const authoritySigner = authoritySelection.address;

  // This is a public address only. The script never signs or sends a transaction.
  // If both a public estimate target and local deployer key are configured, require
  // them to resolve to the same H160 so the quote cannot silently cover another account.
  const privateKeyAddress = process.env.DEPLOYER_PRIVATE_KEY
    ? new ethersLib.Wallet(process.env.DEPLOYER_PRIVATE_KEY).address
    : "";
  const estimateFrom = resolveEstimateFromAddresses(
    process.env.DEPLOYMENT_ESTIMATE_FROM,
    privateKeyAddress
  );
  if (!ethersLib.isAddress(estimateFrom)) {
    throw new Error("The selected deployer address is not a valid EVM address.");
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
  const feeData = await localEthers.provider.getFeeData();
  if (feeData.maxFeePerGas === null || feeData.maxPriorityFeePerGas === null) {
    throw new Error("RPC did not provide complete EIP-1559 fee data; no budget estimate made.");
  }
  const maxFeePerGas = feeData.maxFeePerGas;
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
  if (maxFeePerGas <= 0n || maxPriorityFeePerGas < 0n || maxPriorityFeePerGas > maxFeePerGas) {
    throw new Error("RPC returned invalid EIP-1559 fee parameters; no budget estimate made.");
  }
  const gasPriceWei = maxFeePerGas;
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

  const readiness = buildDeploymentReadiness({
    authoritySignerIsPlaceholder,
    balanceSufficient: calc.isSufficient
  });

  const result = {
    ...readiness,
    network: "PortalDot V3 EVM Testnet",
    rpcOrigin: new URL(config.rpcUrl).origin,
    expectedChainId: config.expectedChainId.toString(),
    actualChainId: actualChainId.toString(),
    substrateGenesisHashPinConfigured: true,
    substrateGenesisHash: actualSubstrateGenesisHash,
    deployerAddress: ethersLib.getAddress(estimateFrom),
    authoritySignerForEstimate: ethersLib.getAddress(authoritySigner),
    authoritySignerIsPlaceholder,
    contract: "PortalDotAgentGuard",
    creationBytecodeBytes: initCodeBytes,
    estimatedGasUnits: gasUnits.toString(),
    feeModel: "EIP-1559 maxFeePerGas cap",
    maxFeePerGasWei: maxFeePerGas.toString(),
    maxPriorityFeePerGasWei: maxPriorityFeePerGas.toString(),
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
    note: "Read-only estimate only: no private key is used to sign, no transaction is sent. If authoritySignerIsPlaceholder is true, this is only a preliminary cost probe and is not a deployment configuration. PortalDot V3 may charge a code storage deposit through its gas estimate; an underfunded sender may cause estimation to fail. Confirm with the real authority signer and sufficient balance immediately before deployment."
  };
  console.log(JSON.stringify(result, null, 2));

  // A successful read-only quote is never deployment authorization.
  process.exitCode = deploymentEstimateExitCode({
    balanceSufficient: calc.isSufficient,
    authoritySignerIsPlaceholder,
    readiness: readiness.readiness
  });
}

main().catch((error) => {
  console.error(`Deployment estimate failed: ${error.message}`);
  process.exitCode = 1;
});
