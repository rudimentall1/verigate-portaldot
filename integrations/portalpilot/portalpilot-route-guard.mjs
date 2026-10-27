import {
  PORTALDOT_TESTNET_RPC,
  authorizePortalPilotAction,
  assertPortalPilotPlanAuthorized,
} from "./verigate-gate.mjs";

function fail(message) { throw new Error(message); }

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return value;
  if (seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

/**
 * Server-route adapter for PortalPilot /api/ask and /api/execute.
 *
 * store must provide atomic putIfAbsent(key, value, ttlMs) and take(key).
 * take() must atomically return-and-delete the record. Use a durable/shared
 * implementation when running multiple instances. executeAuthorizedPlan() must
 * synchronously fetch the cached tx once, compare that exact tx's method bytes
 * with expectedCallHex, and submit that same object without another cache lookup.
 * This closes the read-check-submit gap; a separate getPlanCallHex()+executePlan()
 * pair alone cannot guarantee this property.
 */
export function createPortalPilotVerigateRouteGuard({
  store,
  requestAuthorization,
  verifyAuthorization,
  computeExpectedCallHex,
  computeActionCallHex,
  planAction,
  getPlanCallHex,
  executeAuthorizedPlan,
  nowSeconds = () => Math.floor(Date.now() / 1000),
  ttlMs = 120_000,
} = {}) {
  for (const [name, fn] of Object.entries({
    requestAuthorization, verifyAuthorization, computeExpectedCallHex,
    computeActionCallHex, planAction, getPlanCallHex, executeAuthorizedPlan,
  })) {
    if (typeof fn !== "function") fail(name + " callback is required.");
  }
  if (!store || typeof store.putIfAbsent !== "function" || typeof store.take !== "function") {
    fail("An atomic server-side plan store is required; refusing untracked writes.");
  }
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 300_000) {
    fail("Plan authorization TTL must be between 1 and 300 seconds.");
  }

  async function askWrite(action, network) {
    if (network !== PORTALDOT_TESTNET_RPC) {
      fail("Verigate-gated writes are restricted to the pinned PortalDot V3 Substrate testnet.");
    }
    const authorization = await authorizePortalPilotAction(action, {
      requestAuthorization,
      verifyAuthorization,
      now: nowSeconds(),
    });

    // Compare the unsigned call before planAction(), which signs the extrinsic.
    const expectedCallHex = await computeExpectedCallHex(authorization);
    const requestedCallHex = await computeActionCallHex(action, network);
    if (typeof expectedCallHex !== "string" || !/^0x[0-9a-f]+$/i.test(expectedCallHex) ||
        typeof requestedCallHex !== "string" || !/^0x[0-9a-f]+$/i.test(requestedCallHex) ||
        expectedCallHex.toLowerCase() !== requestedCallHex.toLowerCase()) {
      fail("Unsigned PortalPilot call differs from Verigate authorization; refusing to sign.");
    }
    if (authorization.binding.expiresAt <= nowSeconds()) {
      fail("Verigate authorization expired before PortalPilot could sign.");
    }

    const plan = await planAction(action, network);
    assertPortalPilotPlanAuthorized({
      plan, authorization, expectedCallHex, now: nowSeconds(),
    });
    if (typeof plan.id !== "string" || !plan.id) fail("PortalPilot returned a plan without a stable ID.");

    const planSnapshot = deepFreeze(structuredClone(plan));
    const authorizationSnapshot = deepFreeze(structuredClone(authorization));
    const record = Object.freeze({
      planId: plan.id,
      plan: planSnapshot,
      authorization: authorizationSnapshot,
      storedAt: nowSeconds(),
    });
    const stored = await store.putIfAbsent(plan.id, record, ttlMs);
    if (stored !== true) {
      fail("Could not atomically store the one-time Verigate plan binding; refusing to return the plan.");
    }
    return { kind: "plan", plan };
  }

  async function executeAuthorized(planId) {
    if (typeof planId !== "string" || !planId) fail("A planId is required.");
    // Consume first: any refusal burns the authorization and prevents replay.
    const record = await store.take(planId);
    if (!record || record.planId !== planId || record.plan?.id !== planId) {
      fail("No unconsumed Verigate authorization exists for this PortalPilot plan.");
    }
    if (record.authorization?.binding?.expiresAt <= nowSeconds()) {
      fail("Verigate authorization expired before execution; plan authorization consumed.");
    }
    const expectedCallHex = await computeExpectedCallHex(record.authorization);
    const actualCachedCallHex = await getPlanCallHex(planId);
    if (typeof expectedCallHex !== "string" || !/^0x[0-9a-f]+$/i.test(expectedCallHex) ||
        typeof actualCachedCallHex !== "string" || !/^0x[0-9a-f]+$/i.test(actualCachedCallHex) ||
        actualCachedCallHex.toLowerCase() !== expectedCallHex.toLowerCase()) {
      fail("Cached signed extrinsic call differs from Verigate authorization; refusing execution.");
    }
    assertPortalPilotPlanAuthorized({
      plan: record.plan,
      authorization: record.authorization,
      expectedCallHex,
      now: nowSeconds(),
    });
    // The host must re-read and compare the exact cached tx, then submit that same
    // object atomically (no await/re-lookup between comparison and .send()).
    return executeAuthorizedPlan(planId, expectedCallHex, record.plan);
  }

  return Object.freeze({ askWrite, executeAuthorized });
}
