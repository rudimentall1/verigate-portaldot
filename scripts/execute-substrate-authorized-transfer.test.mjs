import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  TESTNET_RPC,
  TESTNET_GENESIS_HASH,
  EXPECTED_ACTION_TYPE,
  EXPECTED_NETWORK,
  EXPECTED_ASSET,
  NATIVE_SCALE,
  formatNativePot,
  assertEstimatedFeeWithinCeiling,
  normalizeSs58Address,
  validateSubstrateRpcUrl,
  resolveExpectedGenesisHash,
  validateSubstrateTransferBinding,
  interpretDryRunResult,
  selectMortalEraConfig,
} from "./execute-substrate-authorized-transfer.mjs";
import { cryptoWaitReady, encodeAddress } from "@polkadot/util-crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { actionDigest } = require("../adapter/verigate-bridge.js");
await cryptoWaitReady();

const OTHER_GENESIS = "0x" + "ab".repeat(32);

function testAddress(byte = 7, format = 42) {
  return encodeAddress(new Uint8Array(32).fill(byte), format);
}

function validResponse(now = 2_000_000_000) {
  const recipient = testAddress();
  const intent = {
    intent_id: "native-intent-0001",
    agent_id: "native-agent-0001",
    action_type: EXPECTED_ACTION_TYPE,
    target: recipient,
    amount_exact: "100000000000000",
    asset: EXPECTED_ASSET,
    network: EXPECTED_NETWORK,
    metadata: {
      portaldot_substrate_v3: {
        genesis_hash: TESTNET_GENESIS_HASH,
        recipient_ss58: recipient,
        amount_base_units: "100000000000000",
        max_fee_base_units: "1000000000000",
      },
    },
  };
  const receiptSignature = "signature-fixture-for-binding-only";
  const policySha256 = "a".repeat(64);
  const receipt = {
    algorithm: "Ed25519",
    payload: {
      intent,
      decision: {
        decision: "ALLOW",
        intent_id: intent.intent_id,
        agent_id: intent.agent_id,
      },
      policy_sha256: policySha256,
    },
    signature: receiptSignature,
  };
  const authPayload = {
    intent_id: intent.intent_id,
    agent_id: intent.agent_id,
    nonce: intent.intent_id,
    authorization_id: crypto.createHash("sha256")
      .update(receiptSignature + intent.intent_id, "utf8").digest("hex"),
    policy_sha256: policySha256,
    action_sha256: actionDigest(intent),
    issued_at: now - 2,
    expires_at: now + 60,
    action: structuredClone(intent),
  };
  return {
    decision_receipt: receipt,
    execution_authorization: {
      algorithm: "Ed25519",
      payload: authPayload,
      signature: "authorization-signature-fixture",
    },
  };
}


test("mortal-era birth checkpoint respects runtime block-hash retention", () => {
  const selected = selectMortalEraConfig(175214, 16);
  assert.equal(selected.period, 16);
  assert.equal(selected.phase, 14n);
  assert.equal(selected.birthBlock, 175200n);
  assert.ok(175214n - selected.birthBlock < 16n);

  const shortHistory = selectMortalEraConfig(175214, 5);
  assert.equal(shortHistory.period, 4);
  assert.equal(shortHistory.birthBlock, 175212n);
  assert.ok(175214n - shortHistory.birthBlock < 5n);
});

test("mortal-era selection fails closed when block-hash retention is too small", () => {
  assert.throws(
    () => selectMortalEraConfig(175214, 3),
    /below the minimum mortal era period/,
  );
});

test("valid signed-intent structure binds exact native target, amount and testnet genesis", () => {
  const response = validResponse();
  const result = validateSubstrateTransferBinding(response, { now: 2_000_000_000 });
  assert.equal(result.decision, "ALLOW");
  assert.equal(result.recipient, testAddress());
  assert.equal(result.amount, NATIVE_SCALE);
  assert.equal(result.amountBaseUnits, "100000000000000");
  assert.equal(result.amountPot, "1");
  assert.equal(result.expectedGenesisHash, TESTNET_GENESIS_HASH);
  assert.equal(result.actionSha256, actionDigest(response.decision_receipt.payload.intent));
});

test("rejects BLOCK and WARN before authorizing an extrinsic", () => {
  for (const decision of ["BLOCK", "WARN"]) {
    const response = validResponse();
    response.decision_receipt.payload.decision.decision = decision;
    assert.throws(
      () => validateSubstrateTransferBinding(response, { now: 2_000_000_000 }),
      /decision is not ALLOW/,
    );
  }
});

test("rejects an expired authorization and an authorization with excessive TTL", () => {
  const expired = validResponse();
  assert.throws(
    () => validateSubstrateTransferBinding(expired, { now: 2_000_000_100 }),
    /expired or has invalid timestamps/,
  );

  const tooLong = validResponse();
  tooLong.execution_authorization.payload.expires_at = 2_000_000_400;
  assert.throws(
    () => validateSubstrateTransferBinding(tooLong, { now: 2_000_000_000 }),
    /five-minute TTL/,
  );
});

test("rejects changed target and changed action metadata even if a payload is otherwise well formed", () => {
  const changedTarget = validResponse();
  changedTarget.execution_authorization.payload.action.target = testAddress(8);
  assert.throws(
    () => validateSubstrateTransferBinding(changedTarget, { now: 2_000_000_000 }),
    /disagree on action field: target/,
  );

  const changedGenesis = validResponse();
  changedGenesis.decision_receipt.payload.intent.metadata.portaldot_substrate_v3.genesis_hash = OTHER_GENESIS;
  assert.throws(
    () => validateSubstrateTransferBinding(changedGenesis, { now: 2_000_000_000 }),
    /genesis hash/,
  );
});

test("rejects inconsistent base-unit amount, numeric coercion and zero transfer", () => {
  const mismatch = validResponse();
  mismatch.execution_authorization.payload.action.metadata.portaldot_substrate_v3.amount_base_units = "999";
  assert.throws(
    () => validateSubstrateTransferBinding(mismatch, { now: 2_000_000_000 }),
    /amount_exact and signed native amount_base_units must match/,
  );

  const numeric = validResponse();
  numeric.decision_receipt.payload.intent.amount_exact = 100000000000000;
  numeric.execution_authorization.payload.action.amount_exact = 100000000000000;
  numeric.execution_authorization.payload.action_sha256 = actionDigest(
    numeric.execution_authorization.payload.action,
  );
  assert.throws(
    () => validateSubstrateTransferBinding(numeric, { now: 2_000_000_000 }),
    /canonical positive decimal integer string/,
  );

  const zero = validResponse();
  zero.decision_receipt.payload.intent.amount_exact = "0";
  zero.execution_authorization.payload.action.amount_exact = "0";
  zero.execution_authorization.payload.action_sha256 = actionDigest(
    zero.execution_authorization.payload.action,
  );
  assert.throws(
    () => validateSubstrateTransferBinding(zero, { now: 2_000_000_000 }),
    /canonical positive decimal integer string/,
  );
});

test("rejects incorrect action type, network and asset", () => {
  for (const [field, value] of [
    ["action_type", "portaldot.daas.liquidate"],
    ["network", "portaldot-v3-evm"],
    ["asset", "tPOTv3"],
  ]) {
    const response = validResponse();
    response.decision_receipt.payload.intent[field] = value;
    response.execution_authorization.payload.action[field] = value;
    response.execution_authorization.payload.action_sha256 = actionDigest(
      response.execution_authorization.payload.action,
    );
    assert.throws(
      () => validateSubstrateTransferBinding(response, { now: 2_000_000_000 }),
      new RegExp(field === "action_type" ? "Action type" : field === "network" ? "Action network" : "asset must be POT"),
    );
  }
});

test("rejects invalid SS58 addresses and addresses with a non-PortalDot prefix", () => {
  assert.throws(() => normalizeSs58Address("not-an-address"), /valid checksummed SS58/);
  assert.throws(() => normalizeSs58Address(testAddress(7, 2)), /SS58 prefix 42/);
});

test("signed fee ceiling is bound and rejects malformed or mismatched metadata", () => {
  const response = validResponse();
  const binding = validateSubstrateTransferBinding(response, { now: 2_000_000_000 });
  assert.equal(binding.maxFeeBaseUnits, "1000000000000");
  assert.equal(binding.maxFeePot, "0.01");

  const mismatch = validResponse();
  mismatch.execution_authorization.payload.action.metadata.portaldot_substrate_v3.max_fee_base_units = "2000000000000";
  mismatch.execution_authorization.payload.action_sha256 = actionDigest(
    mismatch.execution_authorization.payload.action,
  );
  assert.throws(
    () => validateSubstrateTransferBinding(mismatch, { now: 2_000_000_000 }),
    /Signed max_fee_base_units must match/,
  );

  const missing = validResponse();
  delete missing.decision_receipt.payload.intent.metadata.portaldot_substrate_v3.max_fee_base_units;
  delete missing.execution_authorization.payload.action.metadata.portaldot_substrate_v3.max_fee_base_units;
  missing.execution_authorization.payload.action_sha256 = actionDigest(
    missing.execution_authorization.payload.action,
  );
  assert.throws(
    () => validateSubstrateTransferBinding(missing, { now: 2_000_000_000 }),
    /canonical positive decimal integer string/,
  );
});

test("fee estimate must remain within the signed fee ceiling", () => {
  assert.deepEqual(assertEstimatedFeeWithinCeiling("100", "100"), {
    estimatedFeeBaseUnits: "100",
    maxFeeBaseUnits: "100",
  });
  assert.deepEqual(assertEstimatedFeeWithinCeiling("99", "100"), {
    estimatedFeeBaseUnits: "99",
    maxFeeBaseUnits: "100",
  });
  assert.throws(
    () => assertEstimatedFeeWithinCeiling("101", "100"),
    /exceeds the signed max_fee_base_units ceiling/,
  );
  assert.throws(
    () => assertEstimatedFeeWithinCeiling("1", "01"),
    /canonical positive decimal integer string/,
  );
});

test("native POT formatting uses PortalDot's 14-decimal base unit", () => {
  assert.equal(formatNativePot(0n), "0");
  assert.equal(formatNativePot(NATIVE_SCALE), "1");
  assert.equal(formatNativePot(1000000000000n), "0.01");
  assert.equal(formatNativePot(100000000000001n), "1.00000000000001");
  assert.throws(() => formatNativePot(-1n), /cannot be negative/);
});

test("remote Substrate writes are restricted to the official testnet WebSocket", () => {
  const official = validateSubstrateRpcUrl(TESTNET_RPC);
  assert.equal(official.officialTestnet, true);
  assert.equal(official.localSimulator, false);
  assert.throws(() => validateSubstrateRpcUrl("wss://mainnet.portaldot.io"), /restricted to/);
  assert.throws(() => validateSubstrateRpcUrl("wss://unknown.example"), /restricted to/);
  assert.throws(() => validateSubstrateRpcUrl("ws://remote.example"), /restricted to/);
  assert.throws(() => validateSubstrateRpcUrl("wss://user:secret@test-node-v3.portaldot.dev"), /credentials/);
});

test("loopback simulations are allowed but must pin their own genesis", () => {
  const localUrl = "ws://127.0.0.1:9944";
  const local = validateSubstrateRpcUrl(localUrl);
  assert.equal(local.officialTestnet, false);
  assert.equal(local.localSimulator, true);
  assert.equal(resolveExpectedGenesisHash(TESTNET_RPC), TESTNET_GENESIS_HASH);
  assert.throws(() => resolveExpectedGenesisHash(localUrl, ""), /explicitly configure/);
  assert.equal(resolveExpectedGenesisHash(localUrl, OTHER_GENESIS), OTHER_GENESIS);
  assert.throws(() => resolveExpectedGenesisHash(TESTNET_RPC, OTHER_GENESIS), /differs from the recorded/);
});

test("authorization id and policy digest are bound to the signed decision receipt", () => {
  const wrongId = validResponse();
  wrongId.execution_authorization.payload.authorization_id = "f".repeat(64);
  assert.throws(
    () => validateSubstrateTransferBinding(wrongId, { now: 2_000_000_000 }),
    /authorization ID does not match/,
  );

  const wrongPolicy = validResponse();
  wrongPolicy.execution_authorization.payload.policy_sha256 = "b".repeat(64);
  assert.throws(
    () => validateSubstrateTransferBinding(wrongPolicy, { now: 2_000_000_000 }),
    /policy digest does not match/,
  );
});

test("authorization nonce, signed action digest and action/intent equality are checked", () => {
  const wrongNonce = validResponse();
  wrongNonce.execution_authorization.payload.nonce = "other-intent";
  assert.throws(
    () => validateSubstrateTransferBinding(wrongNonce, { now: 2_000_000_000 }),
    /nonce must match/,
  );

  const wrongDigest = validResponse();
  wrongDigest.execution_authorization.payload.action_sha256 = "c".repeat(64);
  assert.throws(
    () => validateSubstrateTransferBinding(wrongDigest, { now: 2_000_000_000 }),
    /action digest does not match/,
  );
});


test("runtime dry-run requires nested transaction-validity and dispatch success", () => {
  assert.deepEqual(
    interpretDryRunResult({}, { isOk: true, asOk: { isOk: true, isErr: false } }),
    { status: "SIMULATION_SUCCESS", failureLayer: null, reason: null },
  );

  assert.deepEqual(
    interpretDryRunResult({}, {
      isOk: false,
      isErr: true,
      asErr: { toHuman: () => "Invalid Transaction: BadProof" },
    }),
    {
      status: "SIMULATION_REJECTED",
      failureLayer: "transaction-validity",
      reason: "Invalid Transaction: BadProof",
    },
  );

  assert.deepEqual(
    interpretDryRunResult({}, {
      isOk: true,
      asOk: {
        isOk: false,
        isErr: true,
        asErr: { isModule: false, toString: () => "Balances.InsufficientBalance" },
      },
    }),
    {
      status: "SIMULATION_REJECTED",
      failureLayer: "dispatch",
      reason: "Balances.InsufficientBalance",
    },
  );

  assert.throws(
    () => interpretDryRunResult({}, { isOk: true, asOk: {} }),
    /unexpected ApplyExtrinsicResult shape/,
  );
});
