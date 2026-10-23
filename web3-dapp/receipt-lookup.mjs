export function isTransactionHash(value) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function asBigInt(value, label) {
  try {
    if (value === undefined || value === null || value === "") throw new Error("missing value");
    return BigInt(value);
  } catch {
    throw new Error(label + " is missing or not a valid integer quantity.");
  }
}

export function evaluateReceiptResponse({
  requestedHash,
  chainId,
  expectedChainId,
  transaction,
  receipt,
  block
}) {
  if (!isTransactionHash(requestedHash)) {
    throw new Error("Invalid transaction hash. Enter 0x followed by exactly 64 hexadecimal characters.");
  }

  if (asBigInt(chainId, "RPC chain ID") !== asBigInt(expectedChainId, "Expected chain ID")) {
    throw new Error("RPC chain ID mismatch: expected " + String(expectedChainId) + ", received " + String(chainId) + ".");
  }

  const missing = [];
  if (!transaction) missing.push("transaction");
  if (!receipt) missing.push("receipt");
  if (missing.length) return { available: false, missing };

  if (typeof transaction.hash !== "string" ||
      transaction.hash.toLowerCase() !== requestedHash.toLowerCase()) {
    throw new Error("The transaction hash returned by RPC does not match the requested hash.");
  }
  if (typeof receipt.transactionHash !== "string" ||
      receipt.transactionHash.toLowerCase() !== requestedHash.toLowerCase()) {
    throw new Error("The receipt transaction hash does not match the requested hash.");
  }
  if (typeof receipt.blockHash !== "string" || receipt.blockHash.length === 0 ||
      receipt.blockNumber === undefined || receipt.blockNumber === null) {
    throw new Error("The RPC returned a receipt without a mined block hash/number.");
  }
  if (transaction.blockHash &&
      transaction.blockHash.toLowerCase() !== receipt.blockHash.toLowerCase()) {
    throw new Error("Transaction and receipt block hashes differ.");
  }
  if (transaction.blockNumber !== undefined && transaction.blockNumber !== null &&
      asBigInt(transaction.blockNumber, "Transaction block number") !==
        asBigInt(receipt.blockNumber, "Receipt block number")) {
    throw new Error("Transaction and receipt block numbers differ.");
  }
  if (!block || typeof block.hash !== "string" || block.number === undefined || block.number === null ||
      block.hash.toLowerCase() !== receipt.blockHash.toLowerCase() ||
      asBigInt(block.number, "Returned block number") !== asBigInt(receipt.blockNumber, "Receipt block number")) {
    throw new Error("Receipt block hash/number did not match the block returned by RPC.");
  }

  const status = asBigInt(receipt.status, "Receipt status");
  if (status !== 0n && status !== 1n) {
    throw new Error("Unexpected receipt status: " + String(receipt.status));
  }

  return {
    available: true,
    chainId: asBigInt(chainId, "RPC chain ID").toString(),
    transactionHash: requestedHash,
    status: Number(status),
    blockNumber: asBigInt(receipt.blockNumber, "Receipt block number").toString(),
    blockHash: receipt.blockHash,
    destination: transaction.to || null
  };
}

export function findTransferExecutedLogs(receipt, transaction, transferTopic) {
  const destination = transaction?.to;
  if (!destination || !Array.isArray(receipt?.logs)) return [];
  const address = destination.toLowerCase();
  const topic = String(transferTopic || "").toLowerCase();
  return receipt.logs.filter(log =>
    typeof log?.address === "string" &&
    log.address.toLowerCase() === address &&
    log.topics?.[0]?.toLowerCase() === topic
  );
}
