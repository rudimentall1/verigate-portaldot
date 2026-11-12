import test from "node:test";
import assert from "node:assert/strict";
import { runAuthorizedPortalPilotTransfer } from "./portalpilot-runner.mjs";
import { PORTALDOT_TESTNET_RPC, PORTALDOT_TESTNET_GENESIS } from "./verigate-gate.mjs";

const recipient = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
const action = { kind: "transfer", to: recipient, amountPot: "0.1" };
const binding = {
  decision: "ALLOW", recipient, amountBaseUnits: "10000000000000",
  maxFeeBaseUnits: "1000000000000",
  expiresAt: 2_000_000_100, expectedGenesisHash: PORTALDOT_TESTNET_GENESIS,
};
const response = { decision_receipt: {}, execution_authorization: {} };
const callHex = "0x040100";
const nowSeconds = () => 2_000_000_000;

function setup(overrides = {}) {
  const calls = [];
  const deps = {
    action,
    requestAuthorization: async () => { calls.push("authorize"); return response; },
    verifyAuthorization: async () => { calls.push("verify"); return binding; },
    planAction: async (gotAction, network) => {
      calls.push("plan");
      assert.deepEqual(gotAction, action);
      assert.equal(network, PORTALDOT_TESTNET_RPC);
      return { id: "plan-1", network, action, callHex, feePlanck: "100", warnings: [] };
    },
    computeExpectedCallHex: async (authorization) => {
      calls.push("encode-authorized");
      assert.equal(authorization.recipient, recipient);
      assert.equal(authorization.amountBaseUnits, "10000000000000");
      return callHex;
    },
    computeActionCallHex: async (gotAction, network) => {
      calls.push("encode-action");
      assert.deepEqual(gotAction, action);
      assert.equal(network, PORTALDOT_TESTNET_RPC);
      return callHex;
    },
    executePlan: async (id) => { calls.push("execute"); return { ok: true, id }; },
    nowSeconds,
    ...overrides,
  };
  return { calls, deps };
}

test("authorized path checks before plan and twice before execution", async () => {
  const { calls, deps } = setup();
  const result = await runAuthorizedPortalPilotTransfer(deps);
  assert.deepEqual(calls, [
    "authorize", "verify", "encode-authorized", "encode-action", "plan",
    "encode-authorized", "encode-authorized", "execute",
  ]);
  assert.deepEqual(result, { ok: true, id: "plan-1" });
});

test("BLOCK/verification refusal never signs a plan or executes", async () => {
  const { calls, deps } = setup({
    requestAuthorization: async () => { calls.push("authorize"); throw new Error("Verigate did not ALLOW"); },
  });
  await assert.rejects(() => runAuthorizedPortalPilotTransfer(deps), /did not ALLOW/);
  assert.deepEqual(calls, ["authorize"]);
});

test("unsigned call mismatch refuses before planAction can sign", async () => {
  const { calls, deps } = setup({
    computeActionCallHex: async () => { calls.push("encode-action"); return "0x040101"; },
  });
  await assert.rejects(
    () => runAuthorizedPortalPilotTransfer(deps),
    /Unsigned PortalPilot call is invalid or differs.*refusing to sign/,
  );
  assert.equal(calls.includes("plan"), false);
  assert.equal(calls.includes("execute"), false);
});

test("authorization expiring during unsigned encoding refuses before signing", async () => {
  let clock = 2_000_000_000;
  const { calls, deps } = setup({
    nowSeconds: () => clock,
    computeExpectedCallHex: async () => {
      calls.push("encode-authorized");
      clock = 2_000_000_101;
      return callHex;
    },
  });
  await assert.rejects(() => runAuthorizedPortalPilotTransfer(deps), /expired before PortalPilot could sign/);
  assert.equal(calls.includes("plan"), false);
  assert.equal(calls.includes("execute"), false);
});

test("signed plan call-byte mismatch prevents executePlan", async () => {
  const { calls, deps } = setup({
    planAction: async (_action, network) => {
      calls.push("plan");
      return { id: "plan-1", network, action, callHex: "0x040101", feePlanck: "100", warnings: [] };
    },
  });
  await assert.rejects(() => runAuthorizedPortalPilotTransfer(deps), /SCALE call differs/);
  assert.equal(calls.includes("execute"), false);
});

test("call changes between checks are refused at the final boundary", async () => {
  let encodes = 0;
  const { calls, deps } = setup({
    computeExpectedCallHex: async () => {
      calls.push("encode-authorized");
      encodes += 1;
      return encodes === 1 ? callHex : "0x040101";
    },
  });
  await assert.rejects(() => runAuthorizedPortalPilotTransfer(deps), /SCALE call differs/);
  assert.equal(encodes, 2);
  assert.equal(calls.includes("execute"), false);
});

test("plan action substitution prevents executePlan", async () => {
  const { calls, deps } = setup({
    planAction: async (_action, network) => ({
      id: "tampered", network, action: { ...action, amountPot: "0.2" }, callHex,
      feePlanck: "100", warnings: [],
    }),
  });
  await assert.rejects(() => runAuthorizedPortalPilotTransfer(deps), /amount differs/);
  assert.equal(calls.includes("execute"), false);
});
