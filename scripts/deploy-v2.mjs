import "dotenv/config";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { parseExpectedSubstrateGenesisHash, validateSubstrateRpcUrl, verifySubstrateGenesisHash } = require("./substrate-genesis.js");
const { rpcResult } = require("./preflight.js");
const { parseHexQuantity, calculateDeploymentCost, buildDeploymentTransactionOverrides, formatUnitsExact } = require("./deployment-estimate.js");
const hre = (await import("hardhat")).default;
const { ethers } = await hre.network.create();

async function main() {
  const rpcUrl = (process.env.PORTALDOT_RPC_URL || "").trim();
  const expectedChainIdText = (process.env.PORTALDOT_CHAIN_ID || "").trim();
  if (!rpcUrl || expectedChainIdText !== "420420777") {
    throw new Error("Refusing V2 deployment: configure the confirmed PortalDot RPC and PORTALDOT_CHAIN_ID=420420777.");
  }
  const network = await ethers.provider.getNetwork();
  const rpcChainId = parseHexQuantity(await rpcResult(rpcUrl, "eth_chainId", []), "eth_chainId");
  if (network.chainId !== 420420777n || rpcChainId !== 420420777n) {
    throw new Error("Refusing V2 deployment: provider and configured RPC must both report chain ID 420420777.");
  }
  const substrateRpcUrl = validateSubstrateRpcUrl(process.env.PORTALDOT_SUBSTRATE_RPC_URL);
  const expectedGenesis = parseExpectedSubstrateGenesisHash(process.env.PORTALDOT_SUBSTRATE_GENESIS_HASH);
  const actualGenesis = await verifySubstrateGenesisHash(substrateRpcUrl, expectedGenesis);

  const required = [
    "DEPLOYER_PRIVATE_KEY", "ADMIN_ADDRESS", "AUTHORITY_SIGNER_ADDRESS",
    "V2_INITIAL_RECIPIENT", "V2_MAX_PER_TRANSFER_WEI", "V2_WINDOW_LIMIT_WEI", "V2_WINDOW_SECONDS"
  ];
  for (const key of required) {
    if (!(process.env[key] || "").trim()) throw new Error(`Refusing V2 deployment: ${key} is missing; no transaction sent.`);
  }
  const admin = ethers.getAddress(process.env.ADMIN_ADDRESS);
  const authoritySigner = ethers.getAddress(process.env.AUTHORITY_SIGNER_ADDRESS);
  const initialRecipient = ethers.getAddress(process.env.V2_INITIAL_RECIPIENT);
  const maxPerTransfer = BigInt(process.env.V2_MAX_PER_TRANSFER_WEI);
  const windowLimit = BigInt(process.env.V2_WINDOW_LIMIT_WEI);
  const windowSeconds = Number(process.env.V2_WINDOW_SECONDS);
  if ([admin, authoritySigner, initialRecipient].some((a) => a === ethers.ZeroAddress)) throw new Error("Addresses must not be zero.");
  if (admin === authoritySigner) throw new Error("Admin and authority signer must be different addresses.");
  if (maxPerTransfer <= 0n || windowLimit < maxPerTransfer || !Number.isSafeInteger(windowSeconds) || windowSeconds <= 0) {
    throw new Error("Invalid V2 policy: require maxPerTransfer > 0, windowLimit >= maxPerTransfer, and windowSeconds > 0.");
  }
  const [deployer] = await ethers.getSigners();
  const deployerAddress = ethers.getAddress(await deployer.getAddress());
  if (deployerAddress === authoritySigner || deployerAddress === admin) {
    throw new Error("Deployer must be distinct from both admin and authority signer.");
  }

  const factory = await ethers.getContractFactory("PortalDotAgentGuardV2", deployer);
  const deploymentTx = await factory.getDeployTransaction(
    admin, authoritySigner, initialRecipient, maxPerTransfer, windowLimit, windowSeconds
  );
  const estimatedGas = parseHexQuantity(
    await rpcResult(rpcUrl, "eth_estimateGas", [{ from: deployerAddress, data: deploymentTx.data }]),
    "eth_estimateGas"
  );
  const latest = await rpcResult(rpcUrl, "eth_getBlockByNumber", ["latest", false]);
  if (!latest || typeof latest.baseFeePerGas !== "string") {
    throw new Error("Refusing V2 deployment: RPC did not return baseFeePerGas; no transaction sent.");
  }
  const baseFee = parseHexQuantity(latest.baseFeePerGas, "baseFeePerGas");
  const priorityFee = parseHexQuantity(await rpcResult(rpcUrl, "eth_maxPriorityFeePerGas", []), "priority fee");
  const maxFee = baseFee * 2n + priorityFee;
  const balance = parseHexQuantity(
    await rpcResult(rpcUrl, "eth_getBalance", [deployerAddress, "latest"]), "deployer balance"
  );
  const budget = calculateDeploymentCost({
    gasUnits: estimatedGas, gasPriceWei: maxFee, balanceWei: balance, safetyMarginBps: 2000
  });
  console.log(JSON.stringify({
    preBroadcastBudgetCheck: true,
    chainId: network.chainId.toString(),
    substrateGenesisHash: actualGenesis,
    deployer: deployerAddress,
    admin, authoritySigner, initialRecipient,
    maxPerTransferWei: maxPerTransfer.toString(),
    windowLimitWei: windowLimit.toString(),
    windowSeconds,
    estimatedGasUnits: estimatedGas.toString(),
    maxFeePerGasWei: maxFee.toString(),
    estimatedCostPot: formatUnitsExact(budget.estimatedCostWei, 18, 6),
    requiredWith20PercentMarginPot: formatUnitsExact(budget.costWithMarginWei, 18, 6),
    balancePot: formatUnitsExact(balance, 18, 6),
    sufficient: budget.isSufficient
  }, null, 2));
  if (!budget.isSufficient) throw new Error("Insufficient balance for estimated deployment plus 20% margin; no transaction sent.");

  const guard = await factory.deploy(admin, authoritySigner, initialRecipient, maxPerTransfer, windowLimit, windowSeconds,
    buildDeploymentTransactionOverrides({
      gasUnits: estimatedGas,
      maxFeePerGasWei: maxFee,
      maxPriorityFeePerGasWei: priorityFee
    })
  );
  const receipt = await guard.deploymentTransaction().wait();
  const address = await guard.getAddress();
  const code = await ethers.provider.getCode(address);
  const readback = {
    admin: await guard.admin(),
    authoritySigner: await guard.authoritySigner(),
    maxPerTransfer: (await guard.maxPerTransfer()).toString(),
    windowLimit: (await guard.windowLimit()).toString(),
    windowSeconds: (await guard.windowSeconds()).toString(),
    initialRecipientAllowed: await guard.allowedRecipients(initialRecipient)
  };
  if (readback.admin !== admin || readback.authoritySigner !== authoritySigner ||
      readback.maxPerTransfer !== maxPerTransfer.toString() ||
      readback.windowLimit !== windowLimit.toString() ||
      readback.windowSeconds !== String(windowSeconds) ||
      readback.initialRecipientAllowed !== true ||
      !/^0x(?:[0-9a-fA-F]{2})+$/.test(code)) {
    throw new Error("Deployment receipt exists but on-chain V2 readback validation failed. Preserve tx hash and investigate.");
  }
  console.log(JSON.stringify({
    network: "PortalDot V3 EVM testnet",
    chainId: "420420777",
    contract: "PortalDotAgentGuardV2",
    address,
    deploymentTx: receipt.hash,
    blockNumber: receipt.blockNumber,
    runtimeBytecodeHash: ethers.keccak256(code),
    readback,
    warning: "Testnet prototype; this output is evidence only after independent RPC receipt verification. Verigate Ed25519 remains verified off-chain."
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
