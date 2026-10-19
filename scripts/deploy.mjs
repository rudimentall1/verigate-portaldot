import "dotenv/config";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { configuredGenesisHash, verifyGenesisHashIfConfigured } = require("./network-identity.js");
const { parseHexQuantity, calculateDeploymentCost, formatUnitsExact } = require("./deployment-estimate.js");
const hre = (await import("hardhat")).default;
const { ethers } = await hre.network.create();

async function main() {
  const rpcUrl = (process.env.PORTALDOT_RPC_URL || "").trim();
  const chainIdText = (process.env.PORTALDOT_CHAIN_ID || "").trim();
  if (!rpcUrl) {
    throw new Error("Refusing deployment: PORTALDOT_RPC_URL must be explicitly configured to the confirmed PortalDot EVM RPC endpoint.");
  }
  if (!chainIdText || !/^[1-9][0-9]*$/.test(chainIdText)) {
    throw new Error("Refusing deployment: PORTALDOT_CHAIN_ID must be explicitly set to the confirmed positive decimal chain ID.");
  }
  const expectedChainId = BigInt(chainIdText);
  const network = await ethers.provider.getNetwork();

  if (network.chainId !== expectedChainId) {
    throw new Error(`Refusing deployment: expected chain ID ${expectedChainId}, got ${network.chainId}`);
  }
  const expectedGenesisHash = configuredGenesisHash(process.env.PORTALDOT_GENESIS_HASH);
  if (!expectedGenesisHash) {
    throw new Error(
      "Refusing public deployment: PORTALDOT_GENESIS_HASH must be independently confirmed and pinned before deployment."
    );
  }
  const actualGenesisHash = await verifyGenesisHashIfConfigured(ethers.provider, expectedGenesisHash);
  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    throw new Error("DEPLOYER_PRIVATE_KEY is missing. Put it in an untracked .env file; never commit it.");
  }
  if (!process.env.AUTHORITY_SIGNER_ADDRESS || !ethers.isAddress(process.env.AUTHORITY_SIGNER_ADDRESS)) {
    throw new Error("AUTHORITY_SIGNER_ADDRESS must be the dedicated EVM bridge signer address.");
  }

  const authoritySigner = ethers.getAddress(process.env.AUTHORITY_SIGNER_ADDRESS);
  if (authoritySigner === ethers.ZeroAddress) {
    throw new Error("AUTHORITY_SIGNER_ADDRESS must not be the zero address.");
  }

  const [deployer] = await ethers.getSigners();
  const deployerAddress = ethers.getAddress(await deployer.getAddress());
  if (deployerAddress === authoritySigner) {
    throw new Error(
      "Refusing deployment: deployer and bridge authority signer must be different addresses. Use separate keys."
    );
  }

  const factory = await ethers.getContractFactory("PortalDotAgentGuard", deployer);

  // Fail closed before broadcasting if the deployer cannot cover the RPC's current
  // estimate plus a 20% margin. These are read-only RPC calls; no signing/broadcast
  // has happened at this point.
  const deploymentTx = await factory.getDeployTransaction(authoritySigner);
  if (typeof deploymentTx.data !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(deploymentTx.data)) {
    throw new Error("Refusing deployment: compiled contract creation bytecode is missing or malformed.");
  }
  const estimatedGasHex = await ethers.provider.send("eth_estimateGas", [{
    from: deployerAddress,
    data: deploymentTx.data
  }]);
  const gasPriceHex = await ethers.provider.send("eth_gasPrice", []);
  const balanceHex = await ethers.provider.send("eth_getBalance", [deployerAddress, "latest"]);
  const budget = calculateDeploymentCost({
    gasUnits: parseHexQuantity(estimatedGasHex, "eth_estimateGas result"),
    gasPriceWei: parseHexQuantity(gasPriceHex, "eth_gasPrice result"),
    balanceWei: parseHexQuantity(balanceHex, "eth_getBalance result"),
    safetyMarginBps: 2000
  });
  console.log(JSON.stringify({
    preDeploymentBudgetCheck: true,
    deployer: deployerAddress,
    estimatedCostPot: formatUnitsExact(budget.estimatedCostWei, 18, 6),
    requiredWithSafetyMarginPot: formatUnitsExact(budget.costWithMarginWei, 18, 6),
    deployerBalancePot: formatUnitsExact(budget.balanceWei, 18, 6),
    budgetStatus: budget.isSufficient ? "sufficient_with_20_percent_margin" : "insufficient_for_20_percent_margin",
    shortfallPot: formatUnitsExact(budget.shortfallWei, 18, 6)
  }, null, 2));
  if (!budget.isSufficient) {
    throw new Error(
      `Refusing deployment: balance ${formatUnitsExact(budget.balanceWei, 18, 6)} POT is below the estimated ` +
      `deployment cost plus 20% safety margin (${formatUnitsExact(budget.costWithMarginWei, 18, 6)} POT).`
    );
  }

  const guard = await factory.deploy(authoritySigner);
  const tx = guard.deploymentTransaction();
  const receipt = await tx.wait();
  const contractAddress = await guard.getAddress();
  const runtimeCode = await ethers.provider.getCode(contractAddress);
  if (typeof runtimeCode !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(runtimeCode)) {
    throw new Error("Deployment receipt exists but no runtime bytecode was found at the deployed address.");
  }

  console.log(JSON.stringify({
    network: "Configured EVM RPC (identity not proven by chain ID alone)",
    rpcOrigin: new URL(rpcUrl).origin,
    chainId: network.chainId.toString(),
    genesisHash: actualGenesisHash,
    genesisHashPinConfigured: Boolean(expectedGenesisHash),
    contract: "PortalDotAgentGuard",
    address: contractAddress,
    runtimeCodeHash: ethers.keccak256(runtimeCode),
    deployer: deployerAddress,
    authoritySigner,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    note: "A configured genesis hash adds an optional wrong-network check; without it, this script uses the configured HTTPS endpoint and chain ID. Independently verify transaction and bytecode before claiming live deployment evidence. Local Hardhat output is not live testnet evidence."
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
