const { expect } = require("chai");
const { ethers } = require("hardhat");
const { validateAuthorizationBinding } = require("../adapter/verigate-bridge");

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
    const decisionReceipt = {
      algorithm: "Ed25519",
      signature: "fixture-only-not-a-real-signature",
      payload: {
        intent,
        decision: { decision: "ALLOW", intent_id: intent.intent_id, agent_id: intent.agent_id },
        policy_sha256: "a".repeat(64)
      }
    };
    const executionAuthorization = {
      algorithm: "Ed25519",
      signature: "fixture-only-not-a-real-signature",
      payload: {
        authorization_id: "b".repeat(64),
        action_sha256: "c".repeat(64),
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

  it("maps a valid ALLOW to an exact bounded transfer", function () {
    const now = 2000000000;
    const result = validateAuthorizationBinding(response(now), { now, expectedChainId: 420420777 });
    expect(result.recipient).to.equal(ethers.getAddress(recipient.address));
    expect(result.amount).to.equal(1000000n);
    expect(result.nonce).to.equal(BigInt("0x" + "b".repeat(64)));
    expect(result.deadline).to.equal(BigInt(now + 120));
    expect(result.actionId).to.equal(ethers.keccak256(ethers.toUtf8Bytes("test-intent-001")));
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
});
