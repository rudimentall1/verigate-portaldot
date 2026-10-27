import {
  PORTALDOT_TESTNET_RPC,
  authorizePortalPilotAction,
  assertPortalPilotPlanAuthorized,
} from "./verigate-gate.mjs";

function fail(message) { throw new Error(message); }

/**
 * Orchestrate the critical order: authorize -> sign plan -> compare exact call
 * -> recheck expiry/call -> execute. All host operations are injected so tests
 * can prove executePlan is never called on refusal without touching a chain.
 */
export async function runAuthorizedPortalPilotTransfer({
  action,
  requestAuthorization,
  verifyAuthorization,
  planAction,
  computeExpectedCallHex,
  executePlan,
  nowSeconds = () => Math.floor(Date.now() / 1000),
}) {
  for (const [name, fn] of Object.entries({
    requestAuthorization, verifyAuthorization, planAction, computeExpectedCallHex, executePlan,
  })) {
    if (typeof fn !== "function") fail(name + " callback is required.");
  }

  const authorization = await authorizePortalPilotAction(action, {
    requestAuthorization,
    verifyAuthorization,
    now: nowSeconds(),
  });

  // PortalPilot planAction signs the extrinsic, so it must never run before ALLOW.
  const plan = await planAction(action, PORTALDOT_TESTNET_RPC);
  const expectedAfterPlan = await computeExpectedCallHex(plan);
  assertPortalPilotPlanAuthorized({
    plan, authorization, expectedCallHex: expectedAfterPlan, now: nowSeconds(),
  });

  // Recompute at the final submission boundary to avoid trusting stale call bytes.
  const expectedBeforeExecute = await computeExpectedCallHex(plan);
  assertPortalPilotPlanAuthorized({
    plan, authorization, expectedCallHex: expectedBeforeExecute, now: nowSeconds(),
  });

  return executePlan(plan.id);
}
