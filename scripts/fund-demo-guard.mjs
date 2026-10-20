#!/usr/bin/env node
/**
 * Explicitly fund the project's known PortalDot V3 testnet guard for its tiny
 * demo transfer. This is not a generic payment tool; destination and amount
 * are fixed, network/deployment/signer are checked, and broadcast is opt-in.
 */
import "dotenv/config";
import { JsonRpcProvider, Wallet, Contract, keccak256, formatEther } from "ethers";

const EXPECTED_CHAIN_ID = 420420777n;
const EXPECTED_DEPLOYER = "0x4c07B4f328FA738290Db96BCE2F9CBc4d020D2CB";
const EXPECTED_GUARD = "0x3f2f484484fbE6e224d058fDfDB6B5A14F09655b";
const EXPECTED_CODE_HASH = "0xb3d71ff82b4b654c7bafe855ce13b0dc277627a046e3190f6f6e0ee5eb7f7671";
const EXPECTED_AUTHORITY = "0x48F9B07d37b5AF744BA8195c4d6740145b593ea6";
const FUND_WEI = 1_000_000n;
const argv = new Set(process.argv.slice(2));
const broadcast = argv.has("--broadcast");
const confirm = argv.has("--confirm-testnet-funding");

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in the untracked .env.`);
  return value;
}
if (broadcast && !confirm) {
  console.error("Refusing to broadcast without --confirm-testnet-funding.");
  process.exit(2);
}
if (argv.has("--help")) {
  console.log("Usage: node scripts/fund-demo-guard.mjs [--broadcast --confirm-testnet-funding]\nDefault mode is read-only; fixed destination and amount: 1,000,000 EVM wei to PortalDotAgentGuard.");
  process.exit(0);
}

const rpcUrl = required("PORTALDOT_RPC_URL");
const configuredChain = BigInt(required("PORTALDOT_CHAIN_ID"));
const guardAddress = required("PORTALDOT_GUARD_ADDRESS");
const configuredCodeHash = required("PORTALDOT_GUARD_CODE_HASH").toLowerCase();
const authority = required("AUTHORITY_SIGNER_ADDRESS");
const estimateFrom = required("DEPLOYMENT_ESTIMATE_FROM");
const privateKey = required("DEPLOYER_PRIVATE_KEY");
if (configuredChain !== EXPECTED_CHAIN_ID) throw new Error("Configured chain ID is not the known PortalDot V3 testnet.");
if (guardAddress.toLowerCase() !== EXPECTED_GUARD.toLowerCase()) throw new Error("Guard address differs from the known deployed PortalDotAgentGuard.");
if (configuredCodeHash !== EXPECTED_CODE_HASH.toLowerCase()) throw new Error("Configured code hash differs from the recorded deployment hash.");
if (authority.toLowerCase() !== EXPECTED_AUTHORITY.toLowerCase()) throw new Error("Authority signer differs from the recorded deployment signer.");

const provider = new JsonRpcProvider(rpcUrl);
try {
  const wallet = new Wallet(privateKey, provider);
  const network = await provider.getNetwork();
  if (network.chainId !== EXPECTED_CHAIN_ID) throw new Error(`RPC chain ID ${network.chainId} does not match the expected testnet.`);
  if (wallet.address.toLowerCase() !== EXPECTED_DEPLOYER.toLowerCase() ||
      estimateFrom.toLowerCase() !== EXPECTED_DEPLOYER.toLowerCase() ||
      wallet.address.toLowerCase() !== estimateFrom.toLowerCase()) {
    throw new Error("Local deployer key, expected demo deployer and DEPLOYMENT_ESTIMATE_FROM do not match.");
  }

  const code = await provider.getCode(EXPECTED_GUARD);
  if (code === "0x") throw new Error("No contract bytecode exists at the expected guard address.");
  const actualCodeHash = keccak256(code);
  if (actualCodeHash.toLowerCase() !== EXPECTED_CODE_HASH.toLowerCase()) throw new Error("Live guard runtime code hash does not match the recorded hash.");
  const guard = new Contract(EXPECTED_GUARD, ["function authoritySigner() view returns (address)"], provider);
  const liveSigner = await guard.authoritySigner();
  if (liveSigner.toLowerCase() !== EXPECTED_AUTHORITY.toLowerCase()) throw new Error("Live authoritySigner() does not match the recorded signer.");

  const [balanceBefore, guardBalanceBefore, feeData] = await Promise.all([
    provider.getBalance(wallet.address),
    provider.getBalance(EXPECTED_GUARD),
    provider.getFeeData()
  ]);
  if (guardBalanceBefore >= FUND_WEI) {
    console.log(JSON.stringify({
      status: "already_funded", broadcast: false,
      chainId: network.chainId.toString(), guardAddress: EXPECTED_GUARD,
      guardBalanceWei: guardBalanceBefore.toString(), requiredWei: FUND_WEI.toString(),
      note: "No transaction was sent because the guard already holds the demo amount."
    }, null, 2));
    process.exit(0);
  }
  if (guardBalanceBefore !== 0n) throw new Error("Guard balance is non-zero but below the demo amount; refusing to top up an unexpected state.");

  const gasEstimate = await provider.estimateGas({ from: wallet.address, to: EXPECTED_GUARD, value: FUND_WEI });
  const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas;
  if (!gasPrice || gasPrice <= 0n) throw new Error("RPC did not provide a usable gas price.");
  const gasLimit = gasEstimate * 120n / 100n;
  const feeCap = gasLimit * gasPrice;
  if (balanceBefore < FUND_WEI + feeCap) {
    throw new Error(`Deployer balance ${balanceBefore} wei is below funding amount plus 20% gas limit estimate ${(FUND_WEI + feeCap).toString()} wei.`);
  }

  const report = {
    mode: broadcast ? "broadcast" : "dry_run",
    network: "PortalDot V3 testnet",
    chainId: network.chainId.toString(),
    deployerAddress: wallet.address,
    guardAddress: EXPECTED_GUARD,
    amountWei: FUND_WEI.toString(),
    amountEvmPOT: formatEther(FUND_WEI),
    guardBalanceWeiBefore: guardBalanceBefore.toString(),
    estimatedGas: gasEstimate.toString(),
    gasLimitWithMargin: gasLimit.toString(),
    gasPriceWei: gasPrice.toString(),
    maxEstimatedFeeWei: feeCap.toString(),
    deployerBalanceWei: balanceBefore.toString(),
    deployedCodeHashMatches: true,
    authoritySignerMatches: true,
    transactionHash: null,
    receiptStatus: null,
    blockNumber: null
  };
  if (!broadcast) {
    console.log(JSON.stringify({ ...report, note: "Read-only dry run. Nothing was broadcast." }, null, 2));
    process.exit(0);
  }

  const tx = await wallet.sendTransaction({
    to: EXPECTED_GUARD,
    value: FUND_WEI,
    gasLimit,
    gasPrice,
    chainId: EXPECTED_CHAIN_ID
  });
  report.transactionHash = tx.hash;
  console.log(JSON.stringify({ ...report, status: "submitted_waiting_for_receipt" }, null, 2));
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error("Funding transaction did not produce a successful receipt.");
  const guardBalanceAfter = await provider.getBalance(EXPECTED_GUARD);
  if (guardBalanceAfter < FUND_WEI) throw new Error("Funding receipt succeeded, but the guard balance is below the demo amount.");
  console.log(JSON.stringify({
    status: "funded",
    network: "PortalDot V3 testnet",
    chainId: network.chainId.toString(),
    deployerAddress: wallet.address,
    guardAddress: EXPECTED_GUARD,
    amountWei: FUND_WEI.toString(),
    transactionHash: receipt.hash,
    receiptStatus: receipt.status,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    guardBalanceWeiAfter: guardBalanceAfter.toString(),
    note: "The only broadcast is the fixed minimal funding transfer to the known guard; this script does not execute an authorized payment."
  }, null, 2));
} finally {
  await provider.destroy();
}
