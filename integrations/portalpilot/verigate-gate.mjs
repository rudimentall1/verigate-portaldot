/**
 * PortalPilot integration boundary for Verigate's native Substrate transfer path.
 * The host must request a decision before PortalPilot creates/signs a plan.
 */
import { verifyPortalPilotVerigateResponse } from "./verigate-live-verifier.mjs";

export const PORTALDOT_TESTNET_RPC = "wss://test-node-v3.portaldot.dev";
export const PORTALDOT_TESTNET_GENESIS =
  "0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd";
export const POT_DECIMALS = 14;

function fail(message) { throw new Error(message); }

export function potToBaseUnits(amountPot) {
  if (typeof amountPot !== "string" || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,14})?$/.test(amountPot)) {
    fail("PortalPilot POT amount must be a canonical decimal string with at most 14 fractional digits.");
  }
  const [whole, fraction = ""] = amountPot.split(".");
  const baseUnits = BigInt(whole) * (10n ** 14n) + BigInt((fraction + "0".repeat(14)).slice(0, 14));
  if (baseUnits <= 0n) fail("PortalPilot transfer amount must be greater than zero.");
  return baseUnits.toString();
}

export function assertPortalPilotTransferMatchesAuthorization(action, binding) {
  if (!action || action.kind !== "transfer") {
    fail("Verigate PortalPilot gate supports only one native transfer; batch and remark actions are refused.");
  }
  if (!binding || binding.decision !== "ALLOW") fail("A verified Verigate ALLOW binding is required before planning a PortalPilot transfer.");
  if (typeof binding.expiresAt !== "number" || !Number.isSafeInteger(binding.expiresAt)) {
    fail("Verified Verigate authorization has no valid expiry.");
  }
  if (typeof binding.maxFeeBaseUnits !== "string" || !/^[1-9][0-9]*$/.test(binding.maxFeeBaseUnits)) {
    fail("Verified Verigate authorization has no valid signed native fee ceiling.");
  }
  const amountBaseUnits = potToBaseUnits(action.amountPot);
  if (action.to !== binding.recipient) fail("PortalPilot recipient differs from the recipient in Verigate authorization.");
  if (amountBaseUnits !== String(binding.amountBaseUnits)) fail("PortalPilot amount differs from the exact base-unit amount in Verigate authorization.");
  if (binding.expectedGenesisHash?.toLowerCase() !== PORTALDOT_TESTNET_GENESIS) {
    fail("Verigate authorization is not bound to the pinned PortalDot V3 Substrate testnet genesis.");
  }
  return { recipient: action.to, amountBaseUnits, expiresAt: binding.expiresAt };
}

/** Call before planAction(): it signs the extrinsic. */
export async function authorizePortalPilotAction(action, {
  requestAuthorization,
  verifyAuthorization = verifyPortalPilotVerigateResponse,
  now = Math.floor(Date.now() / 1000),
} = {}) {
  if (typeof requestAuthorization !== "function" || typeof verifyAuthorization !== "function") {
    fail("Authorization request and cryptographic verifier are both required.");
  }
  const response = await requestAuthorization(action);
  if (!response) fail("Verigate returned no authorization response.");
  const binding = await verifyAuthorization(response, { now });
  const matched = assertPortalPilotTransferMatchesAuthorization(action, binding);
  if (binding.expiresAt <= now) fail("Verigate authorization expired before PortalPilot could plan the transfer.");
  return Object.freeze({
    response, binding: Object.freeze({ ...binding }),
    recipient: matched.recipient, amountBaseUnits: matched.amountBaseUnits,
  });
}

/** Call after planAction() and immediately before executePlan(). */
export function assertPortalPilotPlanAuthorized({
  plan, authorization, expectedCallHex, now = Math.floor(Date.now() / 1000),
}) {
  if (!plan || !authorization?.binding) fail("A PortalPilot plan and prior Verigate authorization are required.");
  const binding = authorization.binding;
  if (binding.decision !== "ALLOW") fail("Verigate decision is not ALLOW.");
  if (!Number.isSafeInteger(binding.expiresAt) || binding.expiresAt <= now) {
    fail("Verigate authorization expired before PortalPilot execution.");
  }
  if (plan.network !== PORTALDOT_TESTNET_RPC) {
    fail("Verigate PortalPilot integration is restricted to the pinned PortalDot V3 Substrate testnet endpoint.");
  }
  assertPortalPilotTransferMatchesAuthorization(plan.action, binding);

  // PortalPilot may return a warning and a zero placeholder if paymentInfo fails.
  // Never treat that placeholder as a valid fee quote under a signed ceiling.
  if (typeof plan.feePlanck !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(plan.feePlanck)) {
    fail("PortalPilot fee estimate is missing or non-canonical; refusing execution.");
  }
  if (BigInt(plan.feePlanck) > BigInt(binding.maxFeeBaseUnits)) {
    fail("PortalPilot estimated fee exceeds the signed Verigate fee ceiling; refusing execution.");
  }
  if (plan.warnings?.some((warning) => /Fee estimate unavailable/i.test(String(warning)))) {
    fail("PortalPilot fee estimate is unavailable; refusing execution under the signed Verigate fee ceiling.");
  }

  if (typeof expectedCallHex !== "string" || !/^0x[0-9a-f]+$/i.test(expectedCallHex)) {
    fail("Expected SCALE call bytes must be computed from the connected PortalDot API.");
  }
  if (plan.callHex !== expectedCallHex) fail("PortalPilot SCALE call differs from the authorized transfer; refusing execution.");
  return true;
}
