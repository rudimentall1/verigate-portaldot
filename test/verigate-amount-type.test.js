import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { expect } = require("chai");
const crypto = require("node:crypto");
const { validateAuthorizationBinding, actionDigest } = require("../adapter/verigate-bridge");

const CHAIN_ID = 420420777;
const RECIPIENT = "0x000000000000000000000000000000000000dead";

function makeResponse(now = 2_000_000_000) {
  const amount = "1000000";
  const intentId = "strict-amount-type-test";
  const policySha256 = "a".repeat(64);
  const action = {
    intent_id: intentId,
    agent_id: "test-agent",
    action_type: "portaldot.native_transfer",
    target: RECIPIENT,
    amount_exact: amount,
    asset: "tPOTv3",
    network: "portaldot-v3",
    metadata: {
      portaldot_v3: {
        chain_id: CHAIN_ID,
        recipient: RECIPIENT,
        amount_base_units: amount
      }
    }
  };
  const intent = structuredClone(action);
  const receiptSignature = "fixture-receipt-signature";
  const authorizationId = crypto
    .createHash("sha256")
    .update(receiptSignature + intentId, "utf8")
    .digest("hex");

  return {
    decision_receipt: {
      algorithm: "Ed25519",
      signature: receiptSignature,
      payload: {
        intent,
        decision: { decision: "ALLOW", intent_id: intentId, agent_id: "test-agent" },
        policy_sha256: policySha256
      }
    },
    execution_authorization: {
      algorithm: "Ed25519",
      signature: "fixture-authorization-signature",
      payload: {
        authorization_id: authorizationId,
        action_sha256: actionDigest(action),
        nonce: intentId,
        policy_sha256: policySha256,
        intent_id: intentId,
        agent_id: "test-agent",
        issued_at: now - 1,
        expires_at: now + 240,
        action
      }
    }
  };
}

describe("strict exact transfer amount types", function () {
  const now = 2_000_000_000;

  it("accepts canonical decimal strings for exact base-unit amounts", function () {
    const response = makeResponse(now);
    const result = validateAuthorizationBinding(response, { now, expectedChainId: CHAIN_ID });
    expect(result.amount).to.equal(1_000_000n);
  });

  it("rejects JSON-number amounts rather than accepting rounded values above the safe integer range", function () {
    const response = makeResponse(now);
    // This source value has already lost one unit when represented as a JS Number.
    const roundedAmount = Number("9007199254740993");
    const intent = response.decision_receipt.payload.intent;
    const action = response.execution_authorization.payload.action;

    intent.amount_exact = roundedAmount;
    intent.metadata.portaldot_v3.amount_base_units = roundedAmount;
    action.amount_exact = roundedAmount;
    action.metadata.portaldot_v3.amount_base_units = roundedAmount;
    response.execution_authorization.payload.action_sha256 = actionDigest(action);

    expect(() => validateAuthorizationBinding(response, { now, expectedChainId: CHAIN_ID }))
      .to.throw(/canonical positive base-unit integer strings/);
  });

  it("rejects numeric base-unit mappings even when their string form matches the amount", function () {
    const response = makeResponse(now);
    const intent = response.decision_receipt.payload.intent;
    const action = response.execution_authorization.payload.action;

    intent.metadata.portaldot_v3.amount_base_units = 1_000_000;
    action.metadata.portaldot_v3.amount_base_units = 1_000_000;
    response.execution_authorization.payload.action_sha256 = actionDigest(action);

    expect(() => validateAuthorizationBinding(response, { now, expectedChainId: CHAIN_ID }))
      .to.throw(/canonical positive base-unit integer strings/);
  });
});
