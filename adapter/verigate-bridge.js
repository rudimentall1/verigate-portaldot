require("dotenv").config();
const fs = require("node:fs");
const crypto = require("node:crypto");
const { ethers } = require("ethers");

const TRANSFER_TYPES = {
  TransferAuthorization: [
    { name: "recipient", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "actionId", type: "bytes32" }
  ]
};

function fail(message) {
  throw new Error(message);
}

function compareUnicodeCodePoints(left, right) {
  const a = Array.from(left, (char) => char.codePointAt(0));
  const b = Array.from(right, (char) => char.codePointAt(0));
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

// Mirrors Verigate's attest.receipt._canonical(): sorted keys, compact JSON,
// UTF-8 bytes, and no ASCII-only escaping.
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort(compareUnicodeCodePoints);
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) fail("Action contains a value that cannot be represented as canonical JSON.");
  return encoded;
}

function actionDigest(action) {
  return crypto.createHash("sha256").update(canonicalJson(action), "utf8").digest("hex");
}

function validateAuthorizationBinding(response, options = {}) {
  const expectedChainId = Number(options.expectedChainId ?? process.env.PORTALDOT_CHAIN_ID ?? "420420777");
  const now = Number(options.now ?? Math.floor(Date.now() / 1000));
  if (!Number.isSafeInteger(expectedChainId) || expectedChainId <= 0) {
    fail("Expected PortalDot chain ID must be a positive safe integer.");
  }

  const receipt = response && response.decision_receipt;
  const authorization = response && response.execution_authorization;
  if (!receipt || !receipt.payload || !authorization || !authorization.payload) {
    fail("Response must include a decision receipt and an execution authorization.");
  }
  if (receipt.algorithm !== "Ed25519" || authorization.algorithm !== "Ed25519") {
    fail("Only Ed25519 Verigate receipts are accepted.");
  }

  const receiptPayload = receipt.payload;
  const authPayload = authorization.payload;
  const intent = receiptPayload.intent;
  const decision = receiptPayload.decision;
  const action = authPayload.action;
  if (!intent || !decision || !action) fail("Receipt or authorization is missing its intent/decision/action.");
  if (decision.decision !== "ALLOW") fail("Verigate decision is not ALLOW; no EVM signature was produced.");
  if (decision.intent_id !== intent.intent_id || decision.agent_id !== intent.agent_id) {
    fail("Decision receipt intent/agent identifiers do not match.");
  }
  if (authPayload.intent_id !== intent.intent_id || authPayload.agent_id !== intent.agent_id) {
    fail("Execution authorization is bound to a different intent or agent.");
  }
  if (authPayload.nonce !== intent.intent_id) {
    fail("Execution authorization nonce must match the receipt intent ID.");
  }
  const expectedAuthorizationId = crypto
    .createHash("sha256")
    .update(String(receipt.signature) + String(authPayload.nonce), "utf8")
    .digest("hex");
  if (String(authPayload.authorization_id || "").toLowerCase() !== expectedAuthorizationId) {
    fail("Execution authorization ID does not match the receipt signature and nonce.");
  }
  if (authPayload.policy_sha256 !== receiptPayload.policy_sha256) {
    fail("Execution authorization policy digest does not match the decision receipt.");
  }
  if (!/^[a-f0-9]{64}$/i.test(String(authPayload.authorization_id || ""))) {
    fail("Execution authorization has no valid 32-byte authorization ID.");
  }
  if (!/^[a-f0-9]{64}$/i.test(String(authPayload.action_sha256 || ""))) {
    fail("Execution authorization has no valid action digest.");
  }

  const issuedAt = Number(authPayload.issued_at);
  const expiresAt = Number(authPayload.expires_at);
  if (!Number.isInteger(issuedAt) || !Number.isInteger(expiresAt) || expiresAt <= now) {
    fail("Execution authorization is expired or has invalid timestamps.");
  }
  if (issuedAt > now + 15 || expiresAt <= issuedAt || expiresAt - issuedAt > 300) {
    fail("Execution authorization has an invalid issue time or exceeds Verigate's five-minute TTL.");
  }

  for (const field of ["intent_id", "agent_id", "action_type", "target", "amount_exact", "asset", "network"]) {
    if ((action[field] ?? null) !== (intent[field] ?? null)) {
      fail(`Receipt and execution authorization disagree on action field: ${field}`);
    }
  }

  if (action.action_type !== "portaldot.native_transfer") fail("Action type must be portaldot.native_transfer.");
  if (action.network !== "portaldot-v3") fail("Action network must be portaldot-v3.");
  if (action.asset !== "tPOTv3") fail("Action asset must be tPOTv3.");
  if (typeof action.target !== "string" || !ethers.isAddress(action.target)) fail("Action target must be a valid EVM recipient.");

  const mapping = action.metadata && action.metadata.portaldot_v3;
  const intentMapping = intent.metadata && intent.metadata.portaldot_v3;
  if (!mapping || !intentMapping) fail("Signed intent must include metadata.portaldot_v3.");
  if (Number(mapping.chain_id) !== expectedChainId || Number(intentMapping.chain_id) !== expectedChainId) {
    fail(`Signed intent is not bound to the expected PortalDot chain ID ${expectedChainId}.`);
  }

  let recipient;
  let intentRecipient;
  let actionTarget;
  try {
    recipient = ethers.getAddress(mapping.recipient);
    intentRecipient = ethers.getAddress(intentMapping.recipient);
    actionTarget = ethers.getAddress(action.target);
  } catch {
    fail("PortalDot recipient in signed intent is invalid.");
  }
  if (intentRecipient !== recipient || actionTarget !== recipient) {
    fail("Target and PortalDot metadata recipient do not match.");
  }

  const amountText = String(action.amount_exact ?? "");
  const mappedAmount = String(mapping.amount_base_units ?? "");
  if (!/^[1-9][0-9]*$/.test(amountText) || amountText !== mappedAmount ||
      String(intentMapping.amount_base_units ?? "") !== amountText) {
    fail("amount_exact must equal metadata.portaldot_v3.amount_base_units as a positive base-unit integer.");
  }

  const computedActionDigest = actionDigest(action);
  if (String(authPayload.action_sha256 || "").toLowerCase() !== computedActionDigest) {
    fail("Execution authorization action digest does not match its action.");
  }
  if (computedActionDigest !== actionDigest(intent)) {
    fail("Execution authorization action does not exactly match the signed decision receipt intent.");
  }

  const amount = BigInt(amountText);
  if (amount > (1n << 256n) - 1n) {
    fail("Transfer amount exceeds the EVM uint256 limit.");
  }
  const nonce = BigInt("0x" + authPayload.authorization_id);
  const actionId = ethers.keccak256(ethers.toUtf8Bytes(intent.intent_id));
  const deadline = BigInt(Math.min(expiresAt, now + 120));
  if (deadline <= BigInt(now)) fail("No valid time remains to execute this authorization.");

  return {
    recipient,
    amount,
    nonce,
    deadline,
    actionId,
    authorizationId: authPayload.authorization_id,
    intentId: intent.intent_id,
    chainId: BigInt(expectedChainId)
  };
}

async function verifyWithVerigate(baseUrl, attestation, apiKey) {
  const response = await fetch(new URL("/v1/verify", baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { "x-api-key": apiKey } : {})
    },
    body: JSON.stringify({
      payload: attestation.payload,
      signature: attestation.signature,
      algorithm: attestation.algorithm
    }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) fail(`Verigate signature verification endpoint returned HTTP ${response.status}.`);
  const result = await response.json();
  if (result.valid !== true) fail(`Verigate signature was not validated: ${result.reason || "unknown reason"}`);
}

async function signAuthorization(response) {
  const transfer = validateAuthorizationBinding(response);
  const baseUrl = process.env.VERIGATE_BASE_URL || "http://127.0.0.1:8000";
  const apiKey = process.env.VERIGATE_API_KEY || "";

  // Validate both signed artifacts before using the bridge key.
  await verifyWithVerigate(baseUrl, response.decision_receipt, apiKey);
  await verifyWithVerigate(baseUrl, response.execution_authorization, apiKey);

  if (!process.env.BRIDGE_SIGNER_PRIVATE_KEY) fail("BRIDGE_SIGNER_PRIVATE_KEY is missing from the untracked .env file.");
  if (!process.env.AUTHORITY_SIGNER_ADDRESS || !ethers.isAddress(process.env.AUTHORITY_SIGNER_ADDRESS)) {
    fail("AUTHORITY_SIGNER_ADDRESS must match the signer configured in the deployed contract.");
  }
  if (!process.env.PORTALDOT_GUARD_ADDRESS || !ethers.isAddress(process.env.PORTALDOT_GUARD_ADDRESS)) {
    fail("PORTALDOT_GUARD_ADDRESS must be the confirmed live PortalDotAgentGuard address.");
  }

  const wallet = new ethers.Wallet(process.env.BRIDGE_SIGNER_PRIVATE_KEY);
  if (ethers.getAddress(wallet.address) !== ethers.getAddress(process.env.AUTHORITY_SIGNER_ADDRESS)) {
    fail("BRIDGE_SIGNER_PRIVATE_KEY does not match AUTHORITY_SIGNER_ADDRESS.");
  }

  const domain = {
    name: "PortalDotAgentGuard",
    version: "1",
    chainId: transfer.chainId,
    verifyingContract: ethers.getAddress(process.env.PORTALDOT_GUARD_ADDRESS)
  };
  const signature = await wallet.signTypedData(domain, TRANSFER_TYPES, {
    recipient: transfer.recipient,
    amount: transfer.amount,
    nonce: transfer.nonce,
    deadline: transfer.deadline,
    actionId: transfer.actionId
  });

  return {
    contract: domain.verifyingContract,
    domain,
    transfer: {
      recipient: transfer.recipient,
      amount: transfer.amount.toString(),
      nonce: transfer.nonce.toString(),
      deadline: transfer.deadline.toString(),
      actionId: transfer.actionId
    },
    signature,
    authoritySigner: wallet.address,
    authorizationId: transfer.authorizationId,
    intentId: transfer.intentId,
    note: "Signed authorization only. This CLI does not broadcast a transaction."
  };
}

async function main() {
  const file = process.argv[2];
  if (!file) fail("Usage: npm run bridge:sign -- ./authorization-response.json");
  const response = JSON.parse(fs.readFileSync(file, "utf8"));
  const signed = await signAuthorization(response);
  process.stdout.write(JSON.stringify(signed, null, 2) + "\n");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Bridge signing refused: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { validateAuthorizationBinding, verifyWithVerigate, signAuthorization, canonicalJson, actionDigest };
