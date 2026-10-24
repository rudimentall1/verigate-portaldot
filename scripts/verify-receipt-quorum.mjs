#!/usr/bin/env node
/**
 * Cross-provider receipt verifier for PortalDotAgentGuard V1/V2.
 *
 * Requires PORTALDOT_RPC_URL and PORTALDOT_RPC_URL_SECONDARY. The providers
 * must be operated independently for the comparison to add meaningful trust.
 * Usage: node scripts/verify-receipt-quorum.mjs <transaction-hash>
 */
import "dotenv/config";
import {
  Interface, JsonRpcProvider, getAddress, keccak256
} from "ethers";

const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;
const EVENT = new Interface([
  "event TransferExecuted(bytes32 indexed actionId,address indexed recipient,uint256 amount,uint256 nonce)"
]);

export function normalizeTransferEvidence({ tx, receipt, block, guardAddress }) {
  if (!tx || !receipt || !block) throw new Error("Provider did not return transaction, receipt and block.");
  if (block.number !== receipt.blockNumber) throw new Error("Fetched block number does not match receipt block number.");
  if (!block.hash || !receipt.blockHash) throw new Error("Block hash is missing from provider evidence.");
  if (receipt.status !== 1) throw new Error(`Receipt status is ${receipt.status}, not success.`);
  if (receipt.hash.toLowerCase() !== tx.hash.toLowerCase()) throw new Error("Transaction/receipt hash mismatch.");
  if (receipt.blockHash.toLowerCase() !== block.hash.toLowerCase()) throw new Error("Receipt block hash mismatch.");
  if (tx.to == null || getAddress(tx.to) !== getAddress(guardAddress)) {
    throw new Error("Transaction does not target the configured guard.");
  }

  const events = [];
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== guardAddress.toLowerCase()) continue;
    try {
      const parsed = EVENT.parseLog(log);
      if (parsed?.name === "TransferExecuted") {
        events.push({
          actionId: parsed.args.actionId.toLowerCase(),
          recipient: getAddress(parsed.args.recipient),
          amountBaseUnits: parsed.args.amount.toString(),
          nonce: parsed.args.nonce.toString()
        });
      }
    } catch {
      // Ignore logs that are not this guard's TransferExecuted event.
    }
  }
  if (events.length !== 1) {
    throw new Error(`Expected exactly one TransferExecuted event from the guard; got ${events.length}.`);
  }
  return {
    transactionHash: receipt.hash.toLowerCase(),
    chainId: tx.chainId == null ? null : tx.chainId.toString(),
    status: receipt.status,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash.toLowerCase(),
    transactionTo: getAddress(tx.to),
    guardAddress: getAddress(guardAddress),
    transfer: events[0]
  };
}

export function compareProviderEvidence(primary, secondary) {
  const fields = [
    "transactionHash", "chainId", "status", "blockNumber", "blockHash",
    "transactionTo", "guardAddress"
  ];
  const mismatches = fields.filter((field) => primary[field] !== secondary[field]);
  if (JSON.stringify(primary.transfer) !== JSON.stringify(secondary.transfer)) {
    mismatches.push("transfer");
  }
  return { match: mismatches.length === 0, mismatches };
}

async function readEvidence(provider, txHash, guardAddress) {
  const [network, tx, receipt] = await Promise.all([
    provider.getNetwork(),
    provider.getTransaction(txHash),
    provider.getTransactionReceipt(txHash)
  ]);
  if (!tx || !receipt) throw new Error("Transaction or receipt unavailable; result is UNKNOWN, not failed.");
  const block = await provider.getBlock(receipt.blockNumber);
  const code = await provider.getCode(guardAddress);
  if (code === "0x") throw new Error("Configured guard has no runtime code at this provider.");
  return {
    chainId: network.chainId.toString(),
    codeHash: keccak256(code),
    evidence: normalizeTransferEvidence({ tx, receipt, block, guardAddress })
  };
}

async function main() {
  const txHash = process.argv[2];
  if (!TX_HASH_RE.test(txHash || "")) {
    throw new Error("Usage: node scripts/verify-receipt-quorum.mjs <0x transaction hash>");
  }
  const profile = String(process.env.PORTALDOT_GUARD_PROFILE || "v2").trim().toLowerCase();
  if (!["v1", "v2"].includes(profile)) throw new Error("PORTALDOT_GUARD_PROFILE must be v1 or v2.");
  const guardAddress = profile === "v2"
    ? process.env.PORTALDOT_V2_GUARD_ADDRESS
    : process.env.PORTALDOT_GUARD_ADDRESS;
  const expectedCodeHash = profile === "v2"
    ? process.env.PORTALDOT_V2_GUARD_CODE_HASH
    : process.env.PORTALDOT_GUARD_CODE_HASH;
  const primaryUrl = process.env.PORTALDOT_RPC_URL;
  const secondaryUrl = process.env.PORTALDOT_RPC_URL_SECONDARY;
  const expectedChainId = BigInt(process.env.PORTALDOT_CHAIN_ID || "420420777");
  if (!guardAddress || !expectedCodeHash || !primaryUrl || !secondaryUrl) {
    throw new Error("Require configured guard address/code hash and both PORTALDOT_RPC_URL and PORTALDOT_RPC_URL_SECONDARY.");
  }
  if (new URL(primaryUrl).origin === new URL(secondaryUrl).origin) {
    throw new Error("Primary and secondary RPC URLs must have different origins.");
  }

  const providers = [new JsonRpcProvider(primaryUrl), new JsonRpcProvider(secondaryUrl)];
  try {
    const results = await Promise.all(providers.map((provider) => readEvidence(provider, txHash, getAddress(guardAddress))));
    for (const [index, result] of results.entries()) {
      if (BigInt(result.chainId) !== expectedChainId) {
        throw new Error(`Provider ${index + 1} reports chain ID ${result.chainId}, expected ${expectedChainId}.`);
      }
      if (result.codeHash.toLowerCase() !== expectedCodeHash.toLowerCase()) {
        throw new Error(`Provider ${index + 1} guard code hash mismatch: ${result.codeHash}`);
      }
    }
    const comparison = compareProviderEvidence(results[0].evidence, results[1].evidence);
    const report = {
      checkedAt: new Date().toISOString(),
      status: comparison.match ? "CONFIRMED_BY_TWO_RPC_ENDPOINTS" : "CONFLICT",
      mode: "read-only",
      profile,
      chainId: expectedChainId.toString(),
      transactionHash: txHash.toLowerCase(),
      providers: [
        { origin: new URL(primaryUrl).origin, codeHash: results[0].codeHash, evidence: results[0].evidence },
        { origin: new URL(secondaryUrl).origin, codeHash: results[1].codeHash, evidence: results[1].evidence }
      ],
      comparison,
      trustBoundary: "Different URL origins do not prove different operators or independent infrastructure. Verify provider ownership before treating this as independent corroboration."
    };
    console.log(JSON.stringify(report, null, 2));
    if (!comparison.match) process.exitCode = 1;
  } finally {
    await Promise.all(providers.map((provider) => provider.destroy()));
  }
}

if (import.meta.url === new URL(process.argv[1] || "", "file:").href) {
  main().catch((error) => {
    console.error(`Cross-provider receipt verification unavailable: ${error.message}`);
    process.exitCode = 2;
  });
}
