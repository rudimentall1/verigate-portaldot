import test from "node:test";
import assert from "node:assert/strict";
import {
  PORTALDOT_TESTNET_RPC, PORTALDOT_TESTNET_GENESIS, potToBaseUnits,
  assertPortalPilotTransferMatchesAuthorization, authorizePortalPilotAction,
  assertPortalPilotPlanAuthorized,
} from "./verigate-gate.mjs";
import { verifyPortalPilotVerigateResponse } from "./verigate-live-verifier.mjs";

const recipient = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
const action = { kind: "transfer", to: recipient, amountPot: "0.1" };
const binding = {
  decision: "ALLOW", recipient, amountBaseUnits: "10000000000000",
  maxFeeBaseUnits: "1000000000000",
  expiresAt: 2_000_000_100, expectedGenesisHash: PORTALDOT_TESTNET_GENESIS,
  authorizationId: "a".repeat(64), intentId: "intent-1",
  actionSha256: "b".repeat(64), policySha256: "c".repeat(64),
};
const response = {
  decision_receipt: { algorithm: "Ed25519", payload: { fixture: "receipt" }, signature: "receipt-signature" },
  execution_authorization: { algorithm: "Ed25519", payload: { fixture: "authorization" }, signature: "authorization-signature" },
};
const callHex = "0x040100";
const plan = { network: PORTALDOT_TESTNET_RPC, action, callHex, feePlanck: "100", warnings: [] };

test("converts POT decimal text to exact base units without floating point", () => {
  assert.equal(potToBaseUnits("0.1"), "10000000000000");
  assert.equal(potToBaseUnits("1"), "100000000000000");
  assert.equal(potToBaseUnits("0.00000000000001"), "1");
  assert.throws(() => potToBaseUnits("1e-3"), /canonical decimal string/);
  assert.throws(() => potToBaseUnits("0.000000000000001"), /canonical decimal string/);
  assert.throws(() => potToBaseUnits("0"), /greater than zero/);
});

test("rejects recipient, amount, network and non-transfer mismatches", () => {
  assert.throws(() => assertPortalPilotTransferMatchesAuthorization(
    { ...action, to: "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty" }, binding
  ), /recipient differs/);
  assert.throws(() => assertPortalPilotTransferMatchesAuthorization({ ...action, amountPot: "0.2" }, binding), /amount differs/);
  assert.throws(() => assertPortalPilotTransferMatchesAuthorization({ kind: "batchTransfer", transfers: [] }, binding), /only one native transfer/);
  assert.throws(() => assertPortalPilotTransferMatchesAuthorization(
    action, { ...binding, expectedGenesisHash: "0x" + "ab".repeat(32) }
  ), /pinned PortalDot/);
});

test("fails closed if authorization request is missing", async () => {
  await assert.rejects(() => authorizePortalPilotAction(action, {}), /Authorization request and cryptographic verifier/);
});

test("authorization is verified and bound before caller can create a signed plan", async () => {
  const calls = [];
  const authorization = await authorizePortalPilotAction(action, {
    requestAuthorization: async (requestedAction) => {
      calls.push("request");
      assert.deepEqual(requestedAction, action);
      return response;
    },
    verifyAuthorization: async (signedResponse) => {
      calls.push("verify");
      assert.equal(signedResponse, response);
      return binding;
    },
    now: 2_000_000_000,
  });
  assert.deepEqual(calls, ["request", "verify"]);
  assert.equal(authorization.amountBaseUnits, "10000000000000");
});

test("expired authorization is rejected before plan creation", async () => {
  await assert.rejects(() => authorizePortalPilotAction(action, {
    requestAuthorization: async () => response,
    verifyAuthorization: async () => ({ ...binding, expiresAt: 2_000_000_000 }),
    now: 2_000_000_000,
  }), /expired before PortalPilot could plan/);
});

test("execution gate requires exact testnet, action, fee ceiling and encoded SCALE call", () => {
  assert.equal(assertPortalPilotPlanAuthorized({
    plan, authorization: { response, binding }, expectedCallHex: callHex, now: 2_000_000_000,
  }), true);
  assert.throws(() => assertPortalPilotPlanAuthorized({
    plan: { ...plan, network: "mainnet" }, authorization: { response, binding },
    expectedCallHex: callHex, now: 2_000_000_000,
  }), /restricted to the pinned/);
  assert.throws(() => assertPortalPilotPlanAuthorized({
    plan: { ...plan, action: { ...action, amountPot: "0.2" } }, authorization: { response, binding },
    expectedCallHex: callHex, now: 2_000_000_000,
  }), /amount differs/);
  assert.throws(() => assertPortalPilotPlanAuthorized({
    plan: { ...plan, feePlanck: "1000000000001" }, authorization: { response, binding },
    expectedCallHex: callHex, now: 2_000_000_000,
  }), /exceeds the signed Verigate fee ceiling/);
  assert.throws(() => assertPortalPilotPlanAuthorized({
    plan: { ...plan, feePlanck: "0", warnings: ["Fee estimate unavailable"] },
    authorization: { response, binding }, expectedCallHex: callHex, now: 2_000_000_000,
  }), /fee estimate is unavailable/);
  assert.throws(() => assertPortalPilotPlanAuthorized({
    plan, authorization: { response, binding: { ...binding, maxFeeBaseUnits: undefined } },
    expectedCallHex: callHex, now: 2_000_000_000,
  }), /valid signed native fee ceiling/);
  assert.throws(() => assertPortalPilotPlanAuthorized({
    plan, authorization: { response, binding }, expectedCallHex: "0x040101", now: 2_000_000_000,
  }), /SCALE call differs/);
});

test("expired authorization is rejected immediately before execution", () => {
  assert.throws(() => assertPortalPilotPlanAuthorized({
    plan,
    authorization: { response, binding: { ...binding, expiresAt: 2_000_000_000 } },
    expectedCallHex: callHex, now: 2_000_000_000,
  }), /expired before PortalPilot execution/);
});

test("live verifier fails closed when issuer key or verifier URL is missing", async () => {
  await assert.rejects(() => verifyPortalPilotVerigateResponse(response, {
    env: {}, validateBinding: () => binding,
  }), /VERIGATE_PUBLIC_KEY_FILE/);
});

test("live verifier preserves signed fee ceiling and checks both local and remote artifacts", async () => {
  const calls = [];
  const verified = await verifyPortalPilotVerigateResponse(response, {
    env: {
      VERIGATE_PUBLIC_KEY_FILE: "/test/pinned-issuer.pem",
      VERIGATE_BASE_URL: "https://verigate.example",
      VERIGATE_API_KEY: "test-key",
    },
    validateBinding: (got, options) => {
      calls.push(["binding", got, options.expectedGenesisHash]);
      return binding;
    },
    verifyLocally: (artifact, keyPath) => calls.push(["local", artifact, keyPath]),
    verifyWithVerigate: async (url, artifact, apiKey) => calls.push(["remote", url, artifact, apiKey]),
    now: 2_000_000_000,
  });
  assert.equal(verified.decision, "ALLOW");
  assert.equal(verified.recipient, recipient);
  assert.equal(verified.maxFeeBaseUnits, binding.maxFeeBaseUnits);
  assert.equal(verified.verifiedLocally, true);
  assert.equal(verified.verifiedWithVerigate, true);
  assert.equal(calls.filter(([kind]) => kind === "local").length, 2);
  assert.equal(calls.filter(([kind]) => kind === "remote").length, 2);
});
