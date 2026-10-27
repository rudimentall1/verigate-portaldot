import "dotenv/config";
import { createRequire } from "node:module";
import { validateSubstrateTransferBinding } from "../../scripts/execute-substrate-authorized-transfer.mjs";

const require = createRequire(import.meta.url);
const { verifyLocally, verifyWithVerigate } = require("../../adapter/verigate-bridge.js");

function fail(message) { throw new Error(message); }

/**
 * Verify an existing native Substrate decision response. This does not create
 * an intent or request a decision; the host must perform that step separately.
 */
export async function verifyPortalPilotVerigateResponse(response, options = {}) {
  const env = options.env || process.env;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const expectedGenesisHash = String(
    options.expectedGenesisHash || env.PORTALDOT_SUBSTRATE_GENESIS_HASH ||
    "0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd"
  ).toLowerCase();
  const publicKeyPath = options.publicKeyPath || env.VERIGATE_PUBLIC_KEY_FILE;
  const baseUrl = options.baseUrl || env.VERIGATE_BASE_URL;
  const apiKey = options.apiKey ?? env.VERIGATE_API_KEY ?? "";
  if (!publicKeyPath) fail("VERIGATE_PUBLIC_KEY_FILE must point to the pinned issuer public key.");
  if (!baseUrl) fail("VERIGATE_BASE_URL must point to the trusted Verigate verifier.");

  const validateBinding = options.validateBinding || validateSubstrateTransferBinding;
  const transfer = validateBinding(response, { now, expectedGenesisHash });
  if (transfer.decision !== "ALLOW") fail("Verigate decision is not ALLOW.");
  if (!response?.decision_receipt || !response?.execution_authorization) {
    fail("Both signed Verigate artifacts are required.");
  }

  const localVerifier = options.verifyLocally || verifyLocally;
  const remoteVerifier = options.verifyWithVerigate || verifyWithVerigate;
  localVerifier(response.decision_receipt, publicKeyPath);
  localVerifier(response.execution_authorization, publicKeyPath);
  await remoteVerifier(baseUrl, response.decision_receipt, apiKey);
  await remoteVerifier(baseUrl, response.execution_authorization, apiKey);

  return Object.freeze({
    decision: "ALLOW",
    recipient: transfer.recipient,
    amountBaseUnits: transfer.amountBaseUnits,
    expiresAt: transfer.expiresAt,
    expectedGenesisHash: transfer.expectedGenesisHash,
    authorizationId: transfer.authorizationId,
    intentId: transfer.intentId,
    actionSha256: transfer.actionSha256,
    policySha256: transfer.policySha256,
    verifiedLocally: true,
    verifiedWithVerigate: true,
  });
}
