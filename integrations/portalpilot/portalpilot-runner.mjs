import {
  PORTALDOT_TESTNET_RPC,
  authorizePortalPilotAction,
  assertPortalPilotPlanAuthorized,
} from "./verigate-gate.mjs";

function fail(message) { throw new Error(message); }

/**
 * Orchestrate the critical order: authorize -> encode unsigned action and compare
 * it to authorization -> sign plan -> compare signed plan -> recheck -> execute.
 * Expected SCALE bytes must be derived from the verified authorization, not the plan.
 */
export async function runAuthorizedPortalPilotTransfer({
  action,
  requestAuthorization,
  verifyAuthorization,
  planAction,
  computeExpectedCallHex,
  computeActionCallHex,
  executePlan,
  nowSeconds = () => Math.floor(Date.now() / 1000),
}) {
  for (const [name, fn] of Object.entries({
    requestAuthorization, verifyAuthorization, planAction, computeExpectedCallHex,
    computeActionCallHex, executePlan,
  })) {
    if (typeof fn !== "function") fail(name + " callback is required.");
  }

  const authorization = await authorizePortalPilotAction(action, {
    requestAuthorization,
    verifyAuthorization,
    now: nowSeconds(),
  });

  // Verify the exact unsigned call bytes before planAction(), which signs the extrinsic.
  const expectedBeforeSign = await computeExpectedCallHex(authorization);
  const actionCallBeforeSign = await computeActionCallHex(action, PORTALDOT_TESTNET_RPC);
  if (typeof expectedBeforeSign !== "string" || !/^0x[0-9a-f]+$/i.test(expectedBeforeSign) ||
      typeof actionCallBeforeSign !== "string" || !/^0x[0-9a-f]+$/i.test(actionCallBeforeSign) ||
      actionCallBeforeSign.toLowerCase() !== expectedBeforeSign.toLowerCase()) {
    fail("Unsigned PortalPilot call is invalid or differs from the verified Verigate authorization; refusing to sign.");
  }
  if (authorization.binding.expiresAt <= nowSeconds()) {
    fail("Verigate authorization expired before PortalPilot could sign the transfer.");
  }

  // Only the exact action whose unsigned SCALE bytes match authorization may be signed.
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
