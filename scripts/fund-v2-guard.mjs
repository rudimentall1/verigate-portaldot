#!/usr/bin/env node
/**
 * Read-only-by-default funder for the deployed PortalDotAgentGuardV2.
 * Broadcast requires both --broadcast and --confirm-v2-funding.
 */
import "dotenv/config";
import { createRequire } from "node:module";
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  formatEther,
  getAddress,
  keccak256
} from "ethers";

const require = createRequire(import.meta.url);
const {
  parseExpectedSubstrateGenesisHash,
  validateSubstrateRpcUrl,
  verifySubstrateGenesisHash
} = require("./substrate-genesis.js");

const EXPECTED_CHAIN_ID = 420420777n;
const EXPECTED_DEPLOYER = "0x4c07B4f328FA738290Db96BCE2F9CBc4d020D2CB";
const GUARD = {
  address: "0x87C494a5e4B0A8E055F283767579667E10E046C6",
  codeHash: "0x010a565cad83a33442d0f23f6fcb6f605a76082a5b58434813bedf84c54f0859",
  authoritySigner: "0x48F9B07d37b5AF744BA8195c4d6740145b593ea6",
  recipient: "0xa0fC1a7248955A159d54D84E48681d9cEbB86Be4",
  maxPerTransfer: 100000000000000000n,
  windowLimit: 500000000000000000n,
  windowSeconds: 3600n
};
const TARGET_GUARD_BALANCE = 110000000000000000n; // 0.11 POT, enough for one 0.1 POT demo transfer.
const args = new Set(process.argv.slice(2));
const broadcast = args.has("--broadcast");
const confirmed = args.has("--confirm-v2-funding");

const ABI = [
  "function authoritySigner() view returns (address)",
  "function maxPerTransfer() view returns (uint256)",
  "function windowLimit() view returns (uint256)",
  "function windowSeconds() view returns (uint256)",
  "function allowedRecipients(address) view returns (bool)",
  "event Deposited(address indexed sender,uint256 amount)"
];

async function main() {
  if (args.has("--help")) {
    console.log("Read-only by default. To fund only the V2 test guard, use: npm run fund:guard:v2 -- --broadcast --confirm-v2-funding");
    return;
  }
  if (broadcast !== confirmed) {
    throw new Error("Broadcast requires both flags: --broadcast --confirm-v2-funding. No transaction sent.");
  }
  const rpcUrl = (process.env.PORTALDOT_RPC_URL || "").trim();
  const chainIdText = (process.env.PORTALDOT_CHAIN_ID || "").trim();
  const substrateUrl = (process.env.PORTALDOT_SUBSTRATE_RPC_URL || "").trim();
  const genesisPin = (process.env.PORTALDOT_SUBSTRATE_GENESIS_HASH || "").trim();
  const privateKeyText = (process.env.DEPLOYER_PRIVATE_KEY || "").trim();
  if (!rpcUrl || chainIdText !== EXPECTED_CHAIN_ID.toString() || !substrateUrl || !genesisPin || !privateKeyText) {
    throw new Error("Require PortalDot RPC, chain ID 420420777, Substrate RPC/genesis pin and DEPLOYER_PRIVATE_KEY in .env.");
  }
  const wallet = new Wallet(privateKeyText.startsWith("0x") ? privateKeyText : `0x${privateKeyText}`);
  const sender = getAddress(wallet.address);
  if (sender !== getAddress(EXPECTED_DEPLOYER)) {
    throw new Error(`Configured deployer is ${sender}, expected ${EXPECTED_DEPLOYER}; no transaction sent.`);
  }

  const provider = new JsonRpcProvider(rpcUrl);
  try {
    const network = await provider.getNetwork();
    if (network.chainId !== EXPECTED_CHAIN_ID) throw new Error(`Wrong EVM chain ID: ${network.chainId}; no transaction sent.`);
    const validatedSubstrateUrl = validateSubstrateRpcUrl(substrateUrl);
    const expectedGenesis = parseExpectedSubstrateGenesisHash(genesisPin);
    const actualGenesis = await verifySubstrateGenesisHash(validatedSubstrateUrl, expectedGenesis);

    const [code, guardBalance, senderBalance, latestBlock] = await Promise.all([
      provider.getCode(GUARD.address),
      provider.getBalance(GUARD.address),
      provider.getBalance(sender),
      provider.getBlock("latest")
    ]);
    if (code === "0x" || keccak256(code).toLowerCase() !== GUARD.codeHash.toLowerCase()) {
      throw new Error("V2 runtime code is absent or its hash differs from the recorded deployment; no transaction sent.");
    }
    const guard = new Contract(GUARD.address, ABI, provider);
    const [authoritySigner, maxPerTransfer, windowLimit, windowSeconds, recipientAllowed] = await Promise.all([
      guard.authoritySigner(),
      guard.maxPerTransfer(),
      guard.windowLimit(),
      guard.windowSeconds(),
      guard.allowedRecipients(GUARD.recipient)
    ]);
    if (getAddress(authoritySigner) !== getAddress(GUARD.authoritySigner) ||
        BigInt(maxPerTransfer) !== GUARD.maxPerTransfer ||
        BigInt(windowLimit) !== GUARD.windowLimit ||
        BigInt(windowSeconds) !== GUARD.windowSeconds ||
        recipientAllowed !== true) {
      throw new Error("V2 guard readback differs from deployment evidence; no transaction sent.");
    }

    const value = guardBalance >= TARGET_GUARD_BALANCE ? 0n : TARGET_GUARD_BALANCE - guardBalance;
    let gasUnits = 0n;
    let maxFeePerGas = 0n;
    let priorityFee = 0n;
    let estimatedFee = 0n;
    let requiredWithMargin = 0n;
    if (value > 0n) {
      if (!latestBlock || latestBlock.baseFeePerGas == null) {
        throw new Error("RPC omitted latest baseFeePerGas; no funding transaction sent.");
      }
      gasUnits = await provider.estimateGas({ from: sender, to: GUARD.address, value });
      priorityFee = BigInt(await provider.send("eth_maxPriorityFeePerGas", []));
      maxFeePerGas = latestBlock.baseFeePerGas * 2n + priorityFee;
      estimatedFee = gasUnits * maxFeePerGas;
      requiredWithMargin = value + (estimatedFee * 12000n + 9999n) / 10000n;
      if (senderBalance < requiredWithMargin) {
        throw new Error(`Insufficient deployer balance: ${formatEther(senderBalance)} POT; required value plus 20% fee reserve ${formatEther(requiredWithMargin)} POT. No transaction sent.`);
      }
    }

    console.log(JSON.stringify({
      mode: broadcast ? "explicitly authorized V2 testnet funding" : "read-only preflight; no signing or broadcast",
      rpcOrigin: new URL(rpcUrl).origin,
      chainId: network.chainId.toString(),
      substrateGenesisHash: actualGenesis,
      deployer: sender,
      guardAddress: getAddress(GUARD.address),
      guardCodeHash: keccak256(code),
      guardBalancePotBefore: formatEther(guardBalance),
      targetGuardBalancePot: formatEther(TARGET_GUARD_BALANCE),
      transferValuePot: formatEther(value),
      estimatedGasUnits: gasUnits.toString(),
      maxFeePerGasWei: maxFeePerGas.toString(),
      estimatedFeePot: formatEther(estimatedFee),
      requiredWith20PercentFeeReservePot: formatEther(requiredWithMargin),
      deployerBalancePot: formatEther(senderBalance),
      recipientAllowed: recipientAllowed === true,
      broadcastRequested: broadcast
    }, null, 2));

    if (value === 0n) {
      console.log("V2 guard already has at least 0.11 POT; no funding transaction needed.");
      return;
    }
    if (!broadcast) {
      console.log("Preflight passed. To send exactly the amount required to bring the guard to 0.11 POT, rerun with both explicit confirmation flags.");
      return;
    }

    const tx = await wallet.connect(provider).sendTransaction({
      to: GUARD.address,
      value,
      gasLimit: (gasUnits * 12000n + 9999n) / 10000n,
      maxFeePerGas,
      maxPriorityFeePerGas: priorityFee
    });
    console.log(JSON.stringify({ status: "broadcast", transactionHash: tx.hash }, null, 2));
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) {
      throw new Error(`Funding transaction was broadcast but did not confirm success. Inspect hash ${tx.hash} before retrying.`);
    }
    const [balanceAfter, latestDeployerBalance] = await Promise.all([
      provider.getBalance(GUARD.address),
      provider.getBalance(sender)
    ]);
    console.log(JSON.stringify({
      status: "V2 guard funded",
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      receiptStatus: receipt.status,
      actualFeePot: formatEther(receipt.gasUsed * receipt.gasPrice),
      guardBalancePotAfter: formatEther(balanceAfter),
      deployerBalancePotAfter: formatEther(latestDeployerBalance)
    }, null, 2));
  } finally {
    await provider.destroy();
  }
}

main().catch(error => {
  console.error(`V2 guard funding preflight failed: ${error.message}`);
  process.exitCode = 1;
});
