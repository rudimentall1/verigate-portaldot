import test from "node:test";
import assert from "node:assert/strict";
import { Interface } from "ethers";
import {
  compareProviderEvidence,
  normalizeTransferEvidence
} from "../scripts/verify-receipt-quorum.mjs";

const guard = "0x87C494a5e4B0A8E055F283767579667E10E046C6";
const recipient = "0xa0fC1a7248955A159d54D84E48681d9cEbB86Be4";
const txHash = "0x" + "a".repeat(64);
const blockHash = "0x" + "b".repeat(64);
const actionId = "0x" + "c".repeat(64);
const eventInterface = new Interface([
  "event TransferExecuted(bytes32 indexed actionId,address indexed recipient,uint256 amount,uint256 nonce)"
]);

const evidence = () => ({
  transactionHash: txHash,
  chainId: "420420777",
  status: 1,
  blockNumber: 149241,
  blockHash,
  transactionTo: guard,
  guardAddress: guard,
  transfer: {
    actionId,
    recipient,
    amountBaseUnits: "100000000000000000",
    nonce: "7"
  }
});

function validProviderObjects(overrides = {}) {
  const encoded = eventInterface.encodeEventLog(
    eventInterface.getEvent("TransferExecuted"),
    [actionId, recipient, 100000000000000000n, 7n]
  );
  const tx = {
    hash: txHash,
    chainId: 420420777n,
    to: guard
  };
  const receipt = {
    hash: txHash,
    status: 1,
    blockNumber: 149241,
    blockHash,
    logs: [{ address: guard, topics: encoded.topics, data: encoded.data }]
  };
  const block = { number: 149241, hash: blockHash };
  return {
    tx: { ...tx, ...overrides.tx },
    receipt: { ...receipt, ...overrides.receipt },
    block: { ...block, ...overrides.block },
    guardAddress: guard
  };
}

test("matching providers confirm the same receipt and guard event", () => {
  assert.deepEqual(compareProviderEvidence(evidence(), evidence()), { match: true, mismatches: [] });
});

test("chain ID mismatch is surfaced", () => {
  const first = evidence();
  const second = evidence();
  second.chainId = "1";
  assert.deepEqual(compareProviderEvidence(first, second), { match: false, mismatches: ["chainId"] });
});

test("conflicting block hash is surfaced, not silently accepted", () => {
  const first = evidence();
  const second = evidence();
  second.blockHash = "0x" + "d".repeat(64);
  assert.deepEqual(compareProviderEvidence(first, second), {
    match: false,
    mismatches: ["blockHash"]
  });
});

test("different action, recipient, amount or nonce is surfaced", () => {
  for (const [field, value] of [
    ["actionId", "0x" + "e".repeat(64)],
    ["recipient", "0x0000000000000000000000000000000000000001"],
    ["amountBaseUnits", "1"],
    ["nonce", "8"]
  ]) {
    const first = evidence();
    const second = evidence();
    second.transfer[field] = value;
    const result = compareProviderEvidence(first, second);
    assert.equal(result.match, false, field);
    assert.deepEqual(result.mismatches, ["transfer"], field);
  }
});

test("normalizes a successful receipt with exactly one TransferExecuted event", () => {
  const normalized = normalizeTransferEvidence({ ...validProviderObjects(), chainId: 420420777n });
  assert.equal(normalized.transactionHash, txHash);
  assert.equal(normalized.chainId, "420420777");
  assert.equal(normalized.transfer.actionId, actionId);
  assert.equal(normalized.transfer.recipient, recipient);
  assert.equal(normalized.transfer.amountBaseUnits, "100000000000000000");
  assert.equal(normalized.transfer.nonce, "7");
});

test("rejects a receipt whose block does not match the fetched block", () => {
  assert.throws(
    () => normalizeTransferEvidence(validProviderObjects({ block: { number: 149242 } })),
    /block number does not match/
  );
});

test("rejects failed receipts and missing transfer events", () => {
  assert.throws(
    () => normalizeTransferEvidence(validProviderObjects({ receipt: { status: 0 } })),
    /not success/
  );
  assert.throws(
    () => normalizeTransferEvidence(validProviderObjects({ receipt: { logs: [] } })),
    /Expected exactly one TransferExecuted event/
  );
});

test("missing receipt is not converted to a negative result", () => {
  assert.throws(() => normalizeTransferEvidence({
    tx: null,
    receipt: null,
    block: null,
    guardAddress: "0x0000000000000000000000000000000000000001"
  }), /did not return transaction, receipt and block/);
});
