import test from "node:test";
import assert from "node:assert/strict";
import { createPortalPilotVerigateRouteGuard } from "./portalpilot-route-guard.mjs";
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

function makeStore() {
  const values = new Map();
  return {
    values,
    async putIfAbsent(key, value) {
      if (values.has(key)) return false;
      values.set(key, value);
      return true;
    },
    async take(key) {
      const value = values.get(key);
      values.delete(key);
      return value;
    },
  };
}

function setup(overrides = {}) {
  const calls = [];
  const store = makeStore();
  const guard = createPortalPilotVerigateRouteGuard({
    store,
    requestAuthorization: async () => { calls.push("authorize"); return response; },
    verifyAuthorization: async () => { calls.push("verify"); return binding; },
    computeExpectedCallHex: async () => { calls.push("encode-authorized"); return callHex; },
    computeActionCallHex: async (gotAction, network) => {
      calls.push("encode-action");
      assert.deepEqual(gotAction, action);
      assert.equal(network, PORTALDOT_TESTNET_RPC);
      return callHex;
    },
    planAction: async (gotAction, network) => {
      calls.push("plan");
      assert.deepEqual(gotAction, action);
      return {
        id: "plan-1", network, action: gotAction, callHex, feePlanck: "100",
        warnings: [], summary: "fixture", signer: "fixture", feeDisplay: "0",
        weight: "1", dryRun: { ran: true, ok: true, detail: "fixture" }, createdAt: 1,
      };
    },
    getPlanCallHex: async () => { calls.push("read-cached-call"); return callHex; },
    executeAuthorizedPlan: async (id, expectedCallHex, planSnapshot) => {
      calls.push("execute");
      assert.equal(expectedCallHex, callHex);
      assert.equal(planSnapshot.id, id);
      assert.equal(Object.isFrozen(planSnapshot), true);
      assert.equal(Object.isFrozen(planSnapshot.dryRun), true);
      assert.equal(Object.isFrozen(planSnapshot.dryRun.detail), true);
      assert.throws(() => { planSnapshot.dryRun.ok = false; }, TypeError);
      return { ok: true, id };
    },
    nowSeconds,
    ...overrides,
  });
  return { guard, store, calls };
}

test("route ask authorizes and matches unsigned call before plan signing", async () => {
  const { guard, calls, store } = setup();
  const result = await guard.askWrite(action, PORTALDOT_TESTNET_RPC);
  assert.equal(result.kind, "plan");
  assert.equal(store.values.has("plan-1"), true);
  assert.deepEqual(calls, ["authorize", "verify", "encode-authorized", "encode-action", "plan"]);
});

test("route ask refuses unsigned mismatch before planAction", async () => {
  const { guard, calls } = setup({
    computeActionCallHex: async () => { calls.push("encode-action"); return "0x040101"; },
  });
  await assert.rejects(() => guard.askWrite(action, PORTALDOT_TESTNET_RPC), /Unsigned PortalPilot call differs/);
  assert.equal(calls.includes("plan"), false);
});

test("route ask refuses non-pinned network before requesting authorization", async () => {
  const { guard, calls } = setup();
  await assert.rejects(() => guard.askWrite(action, "mainnet"), /restricted to the pinned PortalDot/);
  assert.deepEqual(calls, []);
});

test("route execute atomically consumes authorization before execution", async () => {
  const { guard, calls, store } = setup();
  await guard.askWrite(action, PORTALDOT_TESTNET_RPC);
  const result = await guard.executeAuthorized("plan-1");
  assert.deepEqual(result, { ok: true, id: "plan-1" });
  assert.equal(store.values.has("plan-1"), false);
  assert.deepEqual(calls.slice(-3), ["encode-authorized", "read-cached-call", "execute"]);
  await assert.rejects(() => guard.executeAuthorized("plan-1"), /No unconsumed Verigate authorization/);
  assert.equal(calls.includes("execute"), true);
  assert.equal(calls.filter((call) => call === "execute").length, 1);
});

test("concurrent execute requests consume one authorization and submit at most once", async () => {
  let submitCount = 0;
  let releaseSubmit;
  const submitBarrier = new Promise((resolve) => { releaseSubmit = resolve; });
  const { guard, calls, store } = setup({
    executeAuthorizedPlan: async (id, expectedCallHex, planSnapshot) => {
      submitCount += 1;
      assert.equal(expectedCallHex, callHex);
      assert.equal(planSnapshot.id, id);
      await submitBarrier;
      return { ok: true, id };
    },
  });
  await guard.askWrite(action, PORTALDOT_TESTNET_RPC);

  const first = guard.executeAuthorized("plan-1");
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(
    () => guard.executeAuthorized("plan-1"),
    /No unconsumed Verigate authorization/,
  );
  releaseSubmit();
  assert.deepEqual(await first, { ok: true, id: "plan-1" });
  assert.equal(submitCount, 1);
  assert.equal(calls.filter((call) => call === "execute").length, 0);
  assert.equal(store.values.has("plan-1"), false);
});

test("changed cached signed extrinsic is refused and authorization is consumed", async () => {
  const { guard, calls, store } = setup({
    getPlanCallHex: async () => { calls.push("read-cached-call"); return "0x040101"; },
  });
  await guard.askWrite(action, PORTALDOT_TESTNET_RPC);
  await assert.rejects(
    () => guard.executeAuthorized("plan-1"),
    /Cached signed extrinsic call differs/,
  );
  assert.equal(store.values.has("plan-1"), false);
  assert.equal(calls.includes("execute"), false);
});

test("atomic submission callback refuses a cache change after the preflight read", async () => {
  let cachedCallHex = callHex;
  let submitted = false;
  const { guard, calls, store } = setup({
    getPlanCallHex: async () => { calls.push("read-cached-call"); return cachedCallHex; },
    executeAuthorizedPlan: async (id, expectedCallHex) => {
      // Simulate a cache mutation between preflight and submission. The production
      // callback must inspect and submit the same cached tx object atomically.
      cachedCallHex = "0x040101";
      if (cachedCallHex.toLowerCase() !== expectedCallHex.toLowerCase()) {
        throw new Error("Atomic submission rejected changed cached transaction");
      }
      submitted = true;
      return { ok: true, id };
    },
  });
  await guard.askWrite(action, PORTALDOT_TESTNET_RPC);
  await assert.rejects(
    () => guard.executeAuthorized("plan-1"),
    /Atomic submission rejected changed cached transaction/,
  );
  assert.equal(submitted, false);
  assert.equal(store.values.has("plan-1"), false);
  assert.equal(calls.filter((call) => call === "execute").length, 0);
});

test("expired authorization is consumed and never executed", async () => {
  let clock = 2_000_000_000;
  const { guard, calls, store } = setup({ nowSeconds: () => clock });
  await guard.askWrite(action, PORTALDOT_TESTNET_RPC);
  clock = 2_000_000_101;
  await assert.rejects(() => guard.executeAuthorized("plan-1"), /expired before execution/);
  assert.equal(store.values.has("plan-1"), false);
  assert.equal(calls.includes("execute"), false);
});

test("refuses to construct without atomic server-side storage", () => {
  assert.throws(() => createPortalPilotVerigateRouteGuard({
    requestAuthorization: async () => response,
    verifyAuthorization: async () => binding,
    computeExpectedCallHex: async () => callHex,
    computeActionCallHex: async () => callHex,
    planAction: async () => ({}),
    getPlanCallHex: async () => callHex,
    executeAuthorizedPlan: async () => ({}),
  }), /atomic server-side plan store/);
});
