import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateReceiptResponse,
  findTransferExecutedLogs,
  isTransactionHash
} from "../web3-dapp/receipt-lookup.mjs";

const txHash = "0x" + "a".repeat(64);
const blockHash = "0x" + "b".repeat(64);
const otherHash = "0x" + "c".repeat(64);
const destination = "0x1234567890123456789012345678901234567890";
const eventTopic = "0x" + "d".repeat(64);
const chainId = "0x190f1ca9";

function response(status = "0x1") {
  const transaction = {
    hash: txHash,
    to: destination,
    blockHash,
    blockNumber: "0x2a"
  };
  const receipt = {
    transactionHash: txHash,
    status,
    blockHash,
    blockNumber: "0x2a",
    logs: []
  };
  const block = { hash: blockHash, number: "0x2a" };
  return { requestedHash: txHash, chainId, expectedChainId: chainId, transaction, receipt, block };
}

test("accepts an arbitrary valid transaction hash and reconciled successful receipt", () => {
  const result = evaluateReceiptResponse(response());
  assert.equal(result.available, true);
  assert.equal(result.status, 1);
  assert.equal(result.blockNumber, "42");
  assert.equal(result.destination, destination);
  assert.equal(result.transactionHash, txHash);
});

test("accepts a mined reverted transaction without presenting it as success", () => {
  const result = evaluateReceiptResponse(response("0x0"));
  assert.equal(result.available, true);
  assert.equal(result.status, 0);
});

test("reports null transaction or receipt as unavailable instead of proof of non-existence", () => {
  const data = response();
  const result = evaluateReceiptResponse({ ...data, receipt: null });
  assert.deepEqual(result, { available: false, missing: ["receipt"] });
});

test("rejects a transaction hash mismatch", () => {
  const data = response();
  data.transaction.hash = otherHash;
  assert.throws(() => evaluateReceiptResponse(data), /transaction hash returned by RPC/);
});

test("rejects transaction/receipt block mismatches", () => {
  const data = response();
  data.transaction.blockHash = otherHash;
  assert.throws(() => evaluateReceiptResponse(data), /block hashes differ/);
});

test("rejects a containing block that does not match the receipt", () => {
  const data = response();
  data.block.hash = otherHash;
  assert.throws(() => evaluateReceiptResponse(data), /did not match the block returned by RPC/);
});

test("rejects a different RPC chain ID", () => {
  const data = response();
  data.chainId = "0x1";
  assert.throws(() => evaluateReceiptResponse(data), /chain ID mismatch/);
});

test("accepts any status-independent TransferExecuted event data from the tx target without a fixed amount/recipient", () => {
  const data = response("0x0");
  const targetEvent = {
    address: destination,
    topics: [eventTopic],
    data: "0x1234"
  };
  const unrelatedAddressEvent = { ...targetEvent, address: "0x0000000000000000000000000000000000000001" };
  const unrelatedTopicEvent = { ...targetEvent, topics: ["0x" + "e".repeat(64)] };
  data.receipt.logs = [unrelatedAddressEvent, unrelatedTopicEvent, targetEvent];
  assert.deepEqual(findTransferExecutedLogs(data.receipt, data.transaction, eventTopic), [targetEvent]);
});

test("validates hash format strictly", () => {
  assert.equal(isTransactionHash(txHash), true);
  assert.equal(isTransactionHash("0x1234"), false);
  assert.equal(isTransactionHash("a".repeat(64)), false);
});
