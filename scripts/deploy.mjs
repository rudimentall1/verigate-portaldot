import "dotenv/config";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { parseExpectedSubstrateGenesisHash, validateSubstrateRpcUrl, verifySubstrateGenesisHash } = require("./substrate-genesis.js");
const { rpcResult, assertPortalDotTestnetChainId } = require("./preflight.js");
const { parseHexQuantity, calculateDeploymentCost, buildDeploymentTransactionOverrides, formatUnitsExact } = require("./deployment-estimate.js");
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
  const expectedChainId = assertPortalDotTestnetChainId(BigInt(chainIdText), "V1 deployment");
  const network = await ethers.provider.getNetwork();
  const rpcChainIdHex = await rpcResult(rpcUrl, "eth_chainId", []);
  const rpcChainId = parseHexQuantity(rpcChainIdHex, "eth_chainId result");

  if (network.chainId !== expectedChainId || rpcChainId !== expectedChainId || network.chainId !== rpcChainId) {
    throw new Error(`Refusing deployment: expected chain ID ${expectedChainId}, provider reports ${network.chainId}, configured RPC reports ${rpcChainId}`);
  }
  const substrateRpcUrl = validateSubstrateRpcUrl(process.env.PORTALDOT_SUBSTRATE_RPC_URL);
  const expectedSubstrateGenesisHash = parseExpectedSubstrateGenesisHash(process.env.PORTALDOT_SUBSTRATE_GENESIS_HASH);
  const actualSubstrateGenesisHash = await verifySubstrateGenesisHash(substrateRpcUrl, expectedSubstrateGenesisHash);
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
  const estimatedGasHex = await rpcResult(rpcUrl, "eth_estimateGas", [{
    from: deployerAddress,
    data: deploymentTx.data
  }]);
  const estimatedGas = parseHexQuantity(estimatedGasHex, "eth_estimateGas result");
  // Use the same explicit configured RPC fee model as the read-only estimator.
  // A missing EIP-1559 base fee is a hard stop; do not silently substitute another provider fee.
  const latestBlock = await rpcResult(rpcUrl, "eth_getBlockByNumber", ["latest", false]);
  if (!latestBlock || typeof latestBlock !== "object" || typeof latestBlock.baseFeePerGas !== "string") {
    throw new Error("Refusing deployment: configured RPC did not return baseFeePerGas; no transaction sent.");
  }
  const baseFeePerGas = parseHexQuantity(latestBlock.baseFeePerGas, "latest block baseFeePerGas");
  const maxPriorityFeePerGas = parseHexQuantity(
    await rpcResult(rpcUrl, "eth_maxPriorityFeePerGas", []),
    "eth_maxPriorityFeePerGas result"
  );
  const maxFeePerGas = (baseFeePerGas * 2n) + maxPriorityFeePerGas;
  if (maxFeePerGas <= 0n || maxPriorityFeePerGas > maxFeePerGas) {
    throw new Error("Refusing deployment: RPC returned invalid EIP-1559 fee parameters; no transaction sent.");
  }
  const balanceHex = await rpcResult(rpcUrl, "eth_getBalance", [deployerAddress, "latest"]);
  const budget = calculateDeploymentCost({
    gasUnits: estimatedGas,
    gasPriceWei: maxFeePerGas,
    balanceWei: parseHexQuantity(balanceHex, "eth_getBalance result"),
    safetyMarginBps: 2000
  });
  console.log(JSON.stringify({
    preDeploymentBudgetCheck: true,
    deployer: deployerAddress,
    feeModel: "EIP-1559 maxFeePerGas cap",
    estimatedGasUnits: estimatedGas.toString(),
    maxFeePerGasWei: maxFeePerGas.toString(),
    maxPriorityFeePerGasWei: maxPriorityFeePerGas.toString(),
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

  // The live PortalDot estimate is unusually large because pallet-revive may
  // account for code/storage deposits in eth_estimateGas. The estimate is not a
  // fee-only measurement. Keep the chain/genesis, signer, and balance guards above;
  // submit the exact estimate with the same max-fee cap and verify the receipt/code
  // below. This is a testnet deployment and may consume a substantial part of the
  // configured deployer's test balance. The SS58 mapping is not asserted here.

  // Pass the exact fee caps used in the budget check; do not let ethers silently
  // populate a different maxFeePerGas after the balance guard has passed.
  const transactionOverrides = buildDeploymentTransactionOverrides({
    gasUnits: estimatedGas,
    maxFeePerGasWei: maxFeePerGas,
    maxPriorityFeePerGasWei: maxPriorityFeePerGas
  });
  const guard = await factory.deploy(authoritySigner, transactionOverrides);
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
    substrateGenesisHash: actualSubstrateGenesisHash,
    substrateGenesisHashPinConfigured: true,
    contract: "PortalDotAgentGuard",
    address: contractAddress,
    runtimeCodeHash: ethers.keccak256(runtimeCode),
    deployer: deployerAddress,
    authoritySigner,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    note: "Deployment requires a pinned Substrate genesis hash and matching EVM chain ID. One RPC cannot authenticate itself. Independently verify transaction and bytecode before claiming live deployment evidence. Local Hardhat output is not live testnet evidence."
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});