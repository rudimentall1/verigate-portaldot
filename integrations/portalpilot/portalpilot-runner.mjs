import {
  PORTALDOT_TESTNET_RPC,
  authorizePortalPilotAction,
  assertPortalPilotPlanAuthorized,
} from "./verigate-gate.mjs";

function fail(message) { throw new Error(message); }

/**
 * Orchestrate the critical order: authorize -> sign plan -> compare exact call
 * -> recheck -> execute. Expected SCALE bytes must be derived from the verified
 * authorization, not from the plan being checked.
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
  const expectedAfterPlan = await computeExpectedCallHex(authorization);
  assertPortalPilotPlanAuthorized({
    plan, authorization, expectedCallHex: expectedAfterPlan, now: nowSeconds(),
  });

  // Re-encode from the immutable verified authorization at the final submission boundary.
  const expectedBeforeExecute = await computeExpectedCallHex(authorization);
  assertPortalPilotPlanAuthorized({
    plan, authorization, expectedCallHex: expectedBeforeExecute, now: nowSeconds(),
  });

  return executePlan(plan.id);
}
