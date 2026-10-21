#!/usr/bin/env node
/**
 * Read-only verification of a PortalDotAgentGuard transfer receipt.
 * Usage: node scripts/verify-authorized-transfer.mjs <transaction-hash>
 */
import "dotenv/config";
import { Contract, Interface, JsonRpcProvider, formatEther, getAddress } from "ethers";

const txHash = process.argv[2];
if (typeof txHash !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
  console.error("Usage: node scripts/verify-authorized-transfer.mjs <0x transaction hash>");
  process.exit(2);
}

const required = [
  "PORTALDOT_RPC_URL",
  "PORTALDOT_CHAIN_ID",
  "PORTALDOT_GUARD_ADDRESS"
];
for (const name of required) {
  if (!process.env[name]) {
    console.error(`Missing required configuration: ${name}`);
    process.exit(2);
  }
}
const rpcUrl = process.env.PORTALDOT_RPC_URL;
const expectedChainId = BigInt(process.env.PORTALDOT_CHAIN_ID);
const guardAddress = getAddress(process.env.PORTALDOT_GUARD_ADDRESS);
const provider = new JsonRpcProvider(rpcUrl);
const eventInterface = new Interface([
  "event TransferExecuted(bytes32 indexed actionId,address indexed recipient,uint256 amount,uint256 nonce)"
]);

try {
  const network = await provider.getNetwork();
  if (network.chainId !== expectedChainId) {
    throw new Error(`Wrong chain ID: expected ${expectedChainId}, received ${network.chainId}`);
  }
  const [tx, receipt] = await Promise.all([
    provider.getTransaction(txHash),
    provider.getTransactionReceipt(txHash)
  ]);
  if (!tx || !receipt) {
    throw new Error("RPC did not return both transaction and receipt; do not treat this as verified or blindly resubmit.");
  }
  if (receipt.hash.toLowerCase() !== txHash.toLowerCase()) {
    throw new Error("Receipt transaction hash does not match the requested hash.");
  }
  if (tx.to === null || getAddress(tx.to) !== guardAddress) {
    throw new Error(`Transaction recipient is not configured PortalDotAgentGuard (${guardAddress}).`);
  }
  if (receipt.status !== 1) {
    throw new Error(`Transaction receipt status is ${receipt.status}; expected success (1).`);
  }
  const block = await provider.getBlock(receipt.blockNumber);
  if (!block || block.hash.toLowerCase() !== receipt.blockHash.toLowerCase()) {
    throw new Error("Could not verify the receipt's block hash against the block returned by this RPC.");
  }

  const events = [];
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== guardAddress.toLowerCase()) continue;
    try {
      const parsed = eventInterface.parseLog(log);
      if (parsed?.name === "TransferExecuted") {
        events.push({
          address: getAddress(log.address),
          actionId: parsed.args.actionId,
          recipient: getAddress(parsed.args.recipient),
          amountBaseUnits: parsed.args.amount.toString(),
          amountEvmPOT: formatEther(parsed.args.amount),
          nonce: parsed.args.nonce.toString(),
          logIndex: log.index
        });
      }
    } catch {
      // Ignore logs that do not match the expected event ABI.
    }
  }
  if (events.length !== 1) {
    throw new Error(`Expected exactly one TransferExecuted event from the configured guard; found ${events.length}.`);
  }

  const gasUsed = receipt.gasUsed;
  const effectiveGasPriceWei = receipt.gasPrice;
  const result = {
    checkedAt: new Date().toISOString(),
    mode: "read-only",
    rpcOrigin: new URL(rpcUrl).origin,
    chainId: network.chainId.toString(),
    transactionHash: receipt.hash,
    receiptStatus: receipt.status,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    blockTimestamp: block.timestamp,
    from: getAddress(tx.from),
    to: getAddress(tx.to),
    gasUsed: gasUsed.toString(),
    effectiveGasPriceWei: effectiveGasPriceWei.toString(),
    actualFeeWei: (gasUsed * effectiveGasPriceWei).toString(),
    actualFeeEvmPOT: formatEther(gasUsed * effectiveGasPriceWei),
    logsCount: receipt.logs.length,
    transferExecutedEventConfirmed: true,
    transferExecutedEvents: events,
    checks: {
      chainIdMatches: network.chainId === expectedChainId,
      transactionAndReceiptAvailable: true,
      receiptSucceeded: receipt.status === 1,
      receiptBlockHashMatchesBlock: true,
      transactionTargetsConfiguredGuard: getAddress(tx.to) === guardAddress,
      exactlyOneTransferExecutedEventFromGuard: events.length === 1
    },
    limitations: [
      "The transaction, receipt, block and event were read from the configured RPC; this is not independent authentication of the RPC operator.",
      "The event confirms the guard call and its emitted fields; it does not establish production readiness or an independent security audit."
    ],
    ok: true
  };
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`Authorized transfer verification failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await provider.destroy();
}
