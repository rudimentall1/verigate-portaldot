import test from "node:test";
import assert from "node:assert/strict";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import {
  validateNativeTransferEvidence,
  compareNativeObservation,
  compareNativeProviderObservations
} from "../scripts/verify-substrate-transfer.mjs";

await cryptoWaitReady();

const signer = "5CwFhhZoS2LP5tWAzurDznL949zEemjePH1XBdw6grgyrEPB";
const recipient = "5Etb82346VeavrvzVB3NK3Vr6YrYeK4thENVGM9HogYy64Cj";
const genesisHash = "0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd";
const transactionHash = "0x098c3b320fd38a3062a5305b391fae81026aed267e5ed847186578a13600ef02";
const blockHash = "0xe95f838bae67b8e3e4abed7215315c8059a06f19d9e26b1fa533ef4f4515ed83";

function evidenceFixture(overrides = {}) {
  return {
    schemaVersion: 1,
    evidenceType: "native-substrate-finalized-transfer",
    status: "SUCCESS",
    network: "PortalDot V3 Substrate testnet",
    rpcUrl: "wss://test-node-v3.portaldot.dev",
    runtime: {
      chainName: "PortaldotV3 Test",
      specName: "portaldot-v3",
      specVersion: 3002,
      transactionVersion: 2,
      genesisHash
    },
    authorization: {
      decision: "ALLOW",
      intentId: "native-test-intent",
      authorizationId: "a".repeat(64),
      actionSha256: "b".repeat(64),
      policySha256: "c".repeat(64),
      amountBaseUnits: "10000000000000",
      amountPOT: "0.1",
      signer,
      recipient
    },
    execution: {
      transactionHash,
      finalizedBlockHash: blockHash,
      finalized: true,
      transactionBroadcast: true,
      extrinsicSubmitted: true,
      eventPhase: 1,
      matchingTransferEventCount: 1,
      matchedTransferEvent: {
        section: "balances",
        method: "Transfer",
        data: [signer, recipient, "10000000000000"]
      },
      dispatchEvent: {
        section: "system",
        method: "ExtrinsicSuccess",
        data: []
      },
      feeEvent: {
        section: "transactionPayment",
        method: "TransactionFeePaid",
        payer: signer,
        actualFeeBaseUnits: "1490531479031",
        actualFeePOT: "0.01490531479031",
        tipBaseUnits: "0"
      }
    },
    ...overrides
  };
}

function observationFixture(overrides = {}) {
  return {
    providerOrigin: "wss://test-node-v3.portaldot.dev",
    genesisHash,
    runtime: {
      specName: "portaldot-v3",
      specVersion: "3002",
      transactionVersion: "2"
    },
    blockHash,
    blockNumber: "175482",
    latestFinalizedBlockNumber: "176000",
    finalized: true,
    canonicalHashAtHeight: blockHash,
    transactionHash,
    extrinsicCount: 1,
    extrinsicIndex: 1,
    extrinsicSection: "balances",
    extrinsicMethod: "transfer_keep_alive",
    extrinsicSigner: signer,
    extrinsicRecipient: recipient,
    extrinsicAmountBaseUnits: "10000000000000",
    events: [
      { phase: 1, section: "system", method: "ExtrinsicSuccess", data: [] },
      { phase: 1, section: "balances", method: "Transfer", data: [signer, recipient, "10000000000000"] },
      { phase: 1, section: "transactionPayment", method: "TransactionFeePaid", data: [signer, "1490531479031", "0"] }
    ],
    ...overrides
  };
}

test("accepts the committed shape for a finalized native transfer evidence record", () => {
  const normalized = validateNativeTransferEvidence(evidenceFixture());
  assert.equal(normalized.genesisHash, genesisHash);
  assert.equal(normalized.transactionHash, transactionHash);
  assert.equal(normalized.finalizedBlockHash, blockHash);
  assert.equal(normalized.amountBaseUnits, "10000000000000");
});

test("rejects malformed transaction and block hashes", () => {
  const badTransaction = evidenceFixture();
  badTransaction.execution.transactionHash = "not-a-hash";
  assert.throws(() => validateNativeTransferEvidence(badTransaction), /transactionHash.*32-byte hexadecimal hash/);

  const badBlock = evidenceFixture();
  badBlock.execution.finalizedBlockHash = "0x1234";
  assert.throws(() => validateNativeTransferEvidence(badBlock), /finalizedBlockHash.*32-byte hexadecimal hash/);
});

test("matches a finalized block, exact extrinsic, transfer, dispatch success and fee event", () => {
  const comparison = compareNativeObservation(evidenceFixture(), observationFixture());
  assert.deepEqual(comparison, {
    match: true,
    mismatches: [],
    observed: {
      genesisHash,
      runtime: { specName: "portaldot-v3", specVersion: "3002", transactionVersion: "2" },
      blockHash,
      blockNumber: "175482",
      latestFinalizedBlockNumber: "176000",
      canonicalHashAtHeight: blockHash,
      transactionHash,
      extrinsicIndex: 1,
      extrinsicSigner: signer,
      extrinsicSection: "balances",
      extrinsicMethod: "transfer_keep_alive",
      extrinsicRecipient: recipient,
      extrinsicAmountBaseUnits: "10000000000000",
      transferEventCount: 1,
      dispatchSuccessCount: 1,
      dispatchFailureCount: 0,
      feeEventCount: 1,
      feeEvent: {
        payer: signer,
        actualFeeBaseUnits: "1490531479031",
        tipBaseUnits: "0"
      }
    }
  });
});

test("detects a different genesis even when transaction fields otherwise match", () => {
  const comparison = compareNativeObservation(
    evidenceFixture(),
    observationFixture({ genesisHash: "0x" + "1".repeat(64) })
  );
  assert.equal(comparison.match, false);
  assert.ok(comparison.mismatches.includes("genesisHash"));
});

test("detects non-canonical or unfinalized blocks and altered transfer arguments", () => {
  const unfinalized = compareNativeObservation(
    evidenceFixture(),
    observationFixture({
      finalized: false,
      latestFinalizedBlockNumber: "175000",
      canonicalHashAtHeight: "0x" + "1".repeat(64)
    })
  );
  assert.equal(unfinalized.match, false);
  assert.ok(unfinalized.mismatches.includes("canonicalFinalizedBlock"));

  const alteredAmount = compareNativeObservation(
    evidenceFixture(),
    observationFixture({ extrinsicAmountBaseUnits: "10000000000001" })
  );
  assert.equal(alteredAmount.match, false);
  assert.ok(alteredAmount.mismatches.includes("extrinsicAmountBaseUnits"));
});

test("rejects a transfer if its extrinsic did not emit exact success and fee/transfer evidence", () => {
  const comparison = compareNativeObservation(
    evidenceFixture(),
    observationFixture({
      events: [
        { phase: 1, section: "system", method: "ExtrinsicFailed", data: [] },
        { phase: 1, section: "balances", method: "Transfer", data: [signer, recipient, "1"] }
      ]
    })
  );
  assert.equal(comparison.match, false);
  assert.ok(comparison.mismatches.includes("extrinsicSuccessEvent"));
  assert.ok(comparison.mismatches.includes("transferEvent"));
  assert.ok(comparison.mismatches.includes("feeEventCount"));
});

test("two provider observations must agree on block, runtime and transfer evidence", () => {
  const first = compareNativeObservation(evidenceFixture(), observationFixture()).observed;
  const second = compareNativeObservation(evidenceFixture(), observationFixture()).observed;
  assert.deepEqual(compareNativeProviderObservations(first, second), { match: true, mismatches: [] });

  second.genesisHash = "0x" + "1".repeat(64);
  assert.deepEqual(compareNativeProviderObservations(first, second), {
    match: false,
    mismatches: ["genesisHash"]
  });
});
