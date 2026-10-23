import test from "node:test";
import assert from "node:assert/strict";
import { compareProviderEvidence } from "../scripts/verify-receipt-quorum.mjs";

const evidence = () => ({
  transactionHash: "0x" + "a".repeat(64),
  status: 1,
  blockNumber: 149241,
  blockHash: "0x" + "b".repeat(64),
  transactionTo: "0x87C494a5e4B0A8E055F283767579667E10E046C6",
  guardAddress: "0x87C494a5e4B0A8E055F283767579667E10E046C6",
  transfer: {
    actionId: "0x" + "c".repeat(64),
    recipient: "0xa0fC1a7248955A159d54D84E48681d9cEbB86Be4",
    amountBaseUnits: "100000000000000000",
    nonce: "7"
  }
});

test("matching providers confirm the same receipt and guard event", () => {
  const first = evidence();
  const second = evidence();
  assert.deepEqual(compareProviderEvidence(first, second), { match: true, mismatches: [] });
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

test("missing receipt is not converted to a negative result", async () => {
  const { normalizeTransferEvidence } = await import("../scripts/verify-receipt-quorum.mjs");
  assert.throws(() => normalizeTransferEvidence({
    tx: null, receipt: null, block: null,
    guardAddress: "0x0000000000000000000000000000000000000001"
  }), /did not return transaction, receipt and block/);
});
