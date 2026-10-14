const { expect } = require("chai");
const crypto = require("node:crypto");
const { ethers } = require("hardhat");
const { validateAuthorizationBinding, actionDigest, canonicalJson } = require("../adapter/verigate-bridge");

describe("Verigate bridge binding", function () {
  let recipient;
  let other;

  beforeEach(async function () {
    [, recipient, other] = await ethers.getSigners();
  });

  function response(now, overrides = {}) {
    const target = recipient.address;
    const action = {
      intent_id: "test-intent-001",
      agent_id: "test-agent",
      action_type: "portaldot.native_transfer",
      target,
      amount_exact: "1000000",
      asset: "tPOTv3",
      network: "portaldot-v3",
      metadata: {
        portaldot_v3: {
          chain_id: 420420777,
          recipient: target,
          amount_base_units: "1000000"
        }
      }
    };
    const intent = structuredClone(action);
    const receiptSignature = "fixture-only-not-a-real-signature";
    const policySha256 = "a".repeat(64);
    const decisionReceipt = {
      algorithm: "Ed25519",
      signature: receiptSignature,
      payload: {
        intent,
        decision: { decision: "ALLOW", intent_id: intent.intent_id, agent_id: intent.agent_id },
        policy_sha256: policySha256
      }
    };
    const authorizationNonce = intent.intent_id;
    const authorizationId = crypto
      .createHash("sha256")
      .update(receiptSignature + authorizationNonce, "utf8")
      .digest("hex");
    const executionAuthorization = {
      algorithm: "Ed25519",
      signature: "fixture-only-not-a-real-signature",
      payload: {
        authorization_id: authorizationId,
        action_sha256: actionDigest(action),
        nonce: authorizationNonce,
        policy_sha256: policySha256,
        intent_id: intent.intent_id,
        agent_id: intent.agent_id,
        issued_at: now - 1,
        expires_at: now + 240,
        action
      }
    };
    return {
      decision_receipt: decisionReceipt,
      execution_authorization: executionAuthorization,
      ...overrides
    };
  }

  it("matches Verigate's compact sorted-key UTF-8 canonical JSON", function () {
    const sample = { z: 2, "é": "café", a: { "β": true, a: null }, items: [1, "x"] };
    expect(canonicalJson(sample)).to.equal('{"a":{"a":null,"β":true},"items":[1,"x"],"z":2,"é":"café"}');
    expect(actionDigest(sample)).to.equal("0cffd54445698991ce85b4a3c73496ca3994791c6105a5eca67ad5bbb4931609");
  });

  it("maps a valid ALLOW to an exact bounded transfer", function () {
    const now = 2000000000;
    const result = validateAuthorizationBinding(response(now), { now, expectedChainId: 420420777 });
    expect(result.recipient).to.equal(ethers.getAddress(recipient.address));
    expect(result.amount).to.equal(1000000n);
    expect(result.nonce).to.equal(BigInt("0x" + crypto.createHash("sha256").update("fixture-only-not-a-real-signaturetest-intent-001", "utf8").digest("hex")));
    expect(result.deadline).to.equal(BigInt(now + 120));
    expect(result.actionId).to.equal(ethers.keccak256(ethers.toUtf8Bytes("test-intent-001")));
  });

  it("refuses an action whose canonical digest no longer matches", function () {
    const item = response(2000000000);
    item.execution_authorization.payload.action.metadata.unreviewed_change = true;
    expect(() => validateAuthorizationBinding(item, { now: 2000000000 }))
      .to.throw(/action digest does not match/);
  });

  it("refuses an authorization action that differs from the receipt intent", function () {
    const item = response(2000000000);
    item.decision_receipt.payload.intent.metadata.extra_receipt_field = "different";
    expect(() => validateAuthorizationBinding(item, { now: 2000000000 }))
      .to.throw(/does not exactly match the signed decision receipt intent/);
  });

  it("refuses WARN and BLOCK", function () {
    for (const decision of ["WARN", "BLOCK"]) {
      const item = response(2000000000);
      item.decision_receipt.payload.decision.decision = decision;
      expect(() => validateAuthorizationBinding(item, { now: 2000000000 }))
        .to.throw(/not ALLOW/);
    }
  });

  it("refuses a changed recipient mapping", function () {
    const item = response(2000000000);
    item.execution_authorization.payload.action.metadata.portaldot_v3.recipient = other.address;
    expect(() => validateAuthorizationBinding(item, { now: 2000000000 }))
      .to.throw(/do not match/);
  });

  it("refuses a changed amount mapping", function () {
    const item = response(2000000000);
    item.execution_authorization.payload.action.metadata.portaldot_v3.amount_base_units = "2000000";
    expect(() => validateAuthorizationBinding(item, { now: 2000000000 }))
      .to.throw(/amount_exact must equal/);
  });

  it("refuses a wrong chain and expired authorization", function () {
    const now = 2000000000;
    expect(() => validateAuthorizationBinding(response(now), { now, expectedChainId: 1 }))
      .to.throw(/chain ID/);

    const item = response(now);
    item.execution_authorization.payload.expires_at = now;
    expect(() => validateAuthorizationBinding(item, { now, expectedChainId: 420420777 }))
      .to.throw(/expired/);
  });

  it("refuses an invalid expected chain ID", function () {
    expect(() => validateAuthorizationBinding(response(2000000000), { now: 2000000000, expectedChainId: Number.MAX_SAFE_INTEGER + 1 }))
      .to.throw(/positive safe integer/);
    expect(() => validateAuthorizationBinding(response(2000000000), { now: 2000000000, expectedChainId: 0 }))
      .to.throw(/positive safe integer/);
  });

  it("refuses a transfer amount above the EVM uint256 limit", function () {
    const item = response(2000000000);
    const tooLarge = ((1n << 256n)).toString();
    item.decision_receipt.payload.intent.amount_exact = tooLarge;
    item.decision_receipt.payload.intent.metadata.portaldot_v3.amount_base_units = tooLarge;
    item.execution_authorization.payload.action.amount_exact = tooLarge;
    item.execution_authorization.payload.action.metadata.portaldot_v3.amount_base_units = tooLarge;
    item.execution_authorization.payload.action_sha256 = actionDigest(item.execution_authorization.payload.action);
    expect(() => validateAuthorizationBinding(item, { now: 2000000000 }))
      .to.throw(/uint256 limit/);
  });

  it("refuses an authorization ID not derived from the receipt signature and nonce", function () {
    const item = response(2000000000);
    item.execution_authorization.payload.authorization_id = "b".repeat(64);
    expect(() => validateAuthorizationBinding(item, { now: 2000000000 }))
      .to.throw(/authorization ID does not match/);
  });

  it("refuses a nonce that differs from the receipt intent", function () {
    const item = response(2000000000);
    item.execution_authorization.payload.nonce = "different-intent";
    expect(() => validateAuthorizationBinding(item, { now: 2000000000 }))
      .to.throw(/nonce must match/);
  });

  it("refuses a policy digest mismatch", function () {
    const item = response(2000000000);
    item.execution_authorization.payload.policy_sha256 = "d".repeat(64);
    expect(() => validateAuthorizationBinding(item, { now: 2000000000 }))
      .to.throw(/policy digest does not match/);
  });

  it("accepts the exact uint256 maximum without numeric coercion", function () {
    const now = 2000000000;
    const item = response(now);
    const max = ((1n << 256n) - 1n).toString();
    item.decision_receipt.payload.intent.amount_exact = max;
    item.decision_receipt.payload.intent.metadata.portaldot_v3.amount_base_units = max;
    item.execution_authorization.payload.action.amount_exact = max;
    item.execution_authorization.payload.action.metadata.portaldot_v3.amount_base_units = max;
    item.execution_authorization.payload.action_sha256 = actionDigest(item.execution_authorization.payload.action);

    const result = validateAuthorizationBinding(item, { now, expectedChainId: 420420777 });
    expect(result.amount).to.equal((1n << 256n) - 1n);
  });

  it("refuses zero and non-integer transfer amounts", function () {
    for (const amount of ["0", "01", "-1", "1.5", "1e6", ""]) {
      const item = response(2000000000);
      item.decision_receipt.payload.intent.amount_exact = amount;
      item.decision_receipt.payload.intent.metadata.portaldot_v3.amount_base_units = amount;
      item.execution_authorization.payload.action.amount_exact = amount;
      item.execution_authorization.payload.action.metadata.portaldot_v3.amount_base_units = amount;
      item.execution_authorization.payload.action_sha256 = actionDigest(item.execution_authorization.payload.action);

      expect(() => validateAuthorizationBinding(item, { now: 2000000000 }))
        .to.throw(/positive base-unit integer/);
    }
  });

});
