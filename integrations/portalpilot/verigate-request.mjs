import { randomUUID } from "node:crypto";
import { PORTALDOT_TESTNET_GENESIS, potToBaseUnits } from "./verigate-gate.mjs";

function fail(message) { throw new Error(message); }

function validateBaseUrl(value) {
  let url;
  try { url = new URL(String(value || "")); } catch { fail("VERIGATE_BASE_URL must be an absolute URL."); }
  if (url.username || url.password || url.search || url.hash) fail("VERIGATE_BASE_URL must not contain credentials, query or fragment.");
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase());
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    fail("VERIGATE_BASE_URL must use HTTPS except for loopback development.");
  }
  return url;
}

/**
 * Request a native transfer decision from the documented Verigate endpoint.
 * signActionIntent must use the same ActionIntent signing/canonicalization as
 * the registered Verigate agent identity. No private key is read by this module.
 */
export async function requestPortalPilotAuthorization(action, {
  baseUrl = process.env.VERIGATE_BASE_URL,
  apiKey = process.env.VERIGATE_API_KEY || "",
  identityId = process.env.VERIGATE_IDENTITY_ID,
  agentId = process.env.VERIGATE_AGENT_ID,
  capabilityId = process.env.VERIGATE_NATIVE_CAPABILITY_ID,
  signActionIntent,
  fetchImpl = fetch,
  now = Date.now,
  timeoutMs = 12000,
} = {}) {
  if (!action || action.kind !== "transfer") fail("Only one native transfer can request Verigate authorization.");
  if (typeof signActionIntent !== "function") {
    fail("A trusted Verigate-compatible signActionIntent callback is required; refusing to send an unsigned intent.");
  }
  if (!identityId || !agentId || !capabilityId) {
    fail("VERIGATE_IDENTITY_ID, VERIGATE_AGENT_ID and VERIGATE_NATIVE_CAPABILITY_ID are required.");
  }
  const recipient = String(action.to || "").trim();
  if (!recipient) fail("PortalDot recipient SS58 address is required.");
  const amountBaseUnits = potToBaseUnits(action.amountPot);
  const maxFeeBaseUnits = String(action.maxFeeBaseUnits || "");
  if (!/^[1-9][0-9]*$/.test(maxFeeBaseUnits)) {
    fail("A signed positive maxFeeBaseUnits value is required for the native transfer.");
  }

  const base = validateBaseUrl(baseUrl);
  const timestamp = now() / 1000;
  const intentId = "portalpilot-native-" + randomUUID().replaceAll("-", "");
  const metadata = {
    portaldot_substrate_v3: {
      genesis_hash: PORTALDOT_TESTNET_GENESIS,
      recipient_ss58: recipient,
      amount_base_units: amountBaseUnits,
      max_fee_base_units: maxFeeBaseUnits,
    },
  };
  const actionIntent = {
    agent_id: agentId,
    action_type: "portaldot.substrate_transfer",
    target: recipient,
    resource: "portalpilot/native-transfer",
    amount: amountBaseUnits,
    amount_exact: amountBaseUnits,
    asset: "POT",
    network: "portaldot-v3-substrate",
    purpose: "PortalPilot native POT transfer authorization",
    requested_capability: capabilityId,
    metadata,
    intent_id: intentId,
    timestamp,
  };

  const agentSignature = await signActionIntent(actionIntent, identityId);
  if (typeof agentSignature !== "string" || !agentSignature.trim()) {
    fail("Trusted signer did not return a Verigate agent signature.");
  }
  const requestBody = {
    identity_id: identityId,
    capability_id: capabilityId,
    agent_id: agentId,
    agent_signature: agentSignature,
    intent_id: intentId,
    timestamp,
    action_type: actionIntent.action_type,
    target: recipient,
    resource: actionIntent.resource,
    amount_exact: amountBaseUnits,
    asset: "POT",
    network: "portaldot-v3-substrate",
    purpose: actionIntent.purpose,
    declared_context: {},
    parent_intent_id: null,
    requested_capability: capabilityId,
    constraints: {},
    metadata,
  };

  const endpoint = new URL("/v1/actions/authorize", base);
  const response = await fetchImpl(endpoint, {
    method: "POST",
    redirect: "error",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...(apiKey ? { "x-api-key": apiKey } : {}),
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) fail("Verigate authorization endpoint returned HTTP " + response.status + ".");
  const result = await response.json();
  if (!result || typeof result !== "object") fail("Verigate authorization endpoint returned a non-object response.");
  const decision = result?.decision_receipt?.payload?.decision?.decision;
  if (decision !== "ALLOW" || !result.execution_authorization) {
    fail("Verigate did not ALLOW the native transfer; PortalPilot must not create or execute a plan.");
  }
  return result;
}
