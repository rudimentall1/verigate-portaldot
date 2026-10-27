import test from "node:test";
import assert from "node:assert/strict";
import {
  PORTALDOT_TESTNET_RPC, PORTALDOT_TESTNET_GENESIS, potToBaseUnits,
  assertPortalPilotTransferMatchesAuthorization, authorizePortalPilotAction,
  assertPortalPilotPlanAuthorized,
} from "./verigate-gate.mjs";

const recipient = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
const action = { kind: "transfer", to: recipient, amountPot: "0.1" };
const binding = {
  decision: "ALLOW", recipient, amountBaseUnits: "10000000000000",
  expiresAt: 2_000_000_100, expectedGenesisHash: PORTALDOT_TESTNET_GENESIS,
};
const response = { marker: "signed-response-fixture" };
const callHex = "0x040100";

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
  assert.throws(() => assertPortalPilotTransferMatchesAuthorization(
    { ...action, amountPot: "0.2" }, binding
  ), /amount differs/);
  assert.throws(() => assertPortalPilotTransferMatchesAuthorization(
    { kind: "batchTransfer", transfers: [] }, binding
  ), /only one native transfer/);
  assert.throws(() => assertPortalPilotTransferMatchesAuthorization(
    action, { ...binding, expectedGenesisHash: "0x" + "ab".repeat(32) }
  ), /pinned PortalDot/);
});

test("fails closed if authorization request or cryptographic verifier is missing", async () => {
  await assert.rejects(() => authorizePortalPilotAction(action, {}), /callbacks are both required/);
  await assert.rejects(() => authorizePortalPilotAction(action, {
    requestAuthorization: async () => response,
  }), /callbacks are both required/);
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

test("execution gate requires exact testnet, action and encoded SCALE call", () => {
  const plan = { network: PORTALDOT_TESTNET_RPC, action, callHex };
  assert.equal(assertPortalPilotPlanAuthorized({
    plan, authorization: { response, binding }, expectedCallHex: callHex, now: 2_000_000_000,
  }), true);
  assert.throws(() => assertPortalPilotPlanAuthorized({
    plan: { ...plan, network: "mainnet" },
    authorization: { response, binding }, expectedCallHex: callHex, now: 2_000_000_000,
  }), /restricted to the pinned/);
  assert.throws(() => assertPortalPilotPlanAuthorized({
    plan: { ...plan, action: { ...action, amountPot: "0.2" } },
    authorization: { response, binding }, expectedCallHex: callHex, now: 2_000_000_000,
  }), /amount differs/);
  assert.throws(() => assertPortalPilotPlanAuthorized({
    plan, authorization: { response, binding }, expectedCallHex: "0x040101", now: 2_000_000_000,
  }), /SCALE call differs/);
});

test("expired authorization is rejected immediately before execution", () => {
  assert.throws(() => assertPortalPilotPlanAuthorized({
    plan: { network: PORTALDOT_TESTNET_RPC, action, callHex },
    authorization: { response, binding: { ...binding, expiresAt: 2_000_000_000 } },
    expectedCallHex: callHex, now: 2_000_000_000,
  }), /expired before PortalPilot execution/);
});
