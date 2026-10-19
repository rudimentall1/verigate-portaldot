require("dotenv").config();
const fs = require("node:fs");
const crypto = require("node:crypto");
const { ethers } = require("ethers");
const { configuredGenesisHash, verifyGenesisHashIfConfigured } = require("../scripts/network-identity.js");

// Preserve Python JSON number spellings from Verigate's JSON artifacts. Python's
// json.dumps distinguishes an integer (1) from an integral float (1.0), while
// JSON.parse/JSON.stringify in JavaScript collapses both to the same Number.
// That distinction matters because Verigate signs its Python-canonical bytes.
const numericLexemes = new WeakMap();
const rawJsonValues = new WeakMap();

function parseJsonPreservingNumbers(source) {
  const text = String(source);
  let index = 0;

  function whitespace() {
    while (index < text.length) {
      const code = text.charCodeAt(index);
      if (code === 32 || code === 9 || code === 10 || code === 13) index += 1;
      else break;
    }
  }

  function stringValue() {
    const start = index;
    if (text[index] !== '"') fail("Malformed JSON string.");
    index += 1;
    while (index < text.length) {
      if (text.charCodeAt(index) === 92) {
        index += 2;
        continue;
      }
      if (text[index] === '"') {
        index += 1;
        return { value: JSON.parse(text.slice(start, index)), start, end: index };
      }
      index += 1;
    }
    fail("Unterminated JSON string.");
  }

  function rememberNumber(parent, key, node) {
    if (parent === null) return;
    const name = String(key);
    let entries = numericLexemes.get(parent);
    if (node.numberRaw === undefined) {
      entries?.delete(name);
      return;
    }
    if (!entries) {
      entries = new Map();
      numericLexemes.set(parent, entries);
    }
    entries.set(name, node.numberRaw);
  }

  function parseValue() {
    whitespace();
    const start = index;
    const char = text[index];

    if (char === '"') return stringValue();

    if (char === '{') {
      index += 1;
      const object = {};
      whitespace();
      if (text[index] === '}') index += 1;
      else {
        while (index < text.length) {
          whitespace();
          const parsedKey = stringValue();
          const key = parsedKey.value;
          whitespace();
          if (text[index] !== ':') fail("Malformed JSON object: expected colon.");
          index += 1;
          const child = parseValue();
          Object.defineProperty(object, key, {
            value: child.value, enumerable: true, writable: true, configurable: true
          });
          rememberNumber(object, key, child);
          whitespace();
          if (text[index] === '}') { index += 1; break; }
          if (text[index] !== ',') fail("Malformed JSON object: expected comma.");
          index += 1;
        }
      }
      rawJsonValues.set(object, text.slice(start, index));
      return { value: object, start, end: index };
    }

    if (char === '[') {
      index += 1;
      const array = [];
      whitespace();
      if (text[index] === ']') index += 1;
      else {
        while (index < text.length) {
          const child = parseValue();
          array.push(child.value);
          rememberNumber(array, array.length - 1, child);
          whitespace();
          if (text[index] === ']') { index += 1; break; }
          if (text[index] !== ',') fail("Malformed JSON array: expected comma.");
          index += 1;
        }
      }
      rawJsonValues.set(array, text.slice(start, index));
      return { value: array, start, end: index };
    }

    const literal = text.slice(index).match(/^(true|false|null)/);
    if (literal) {
      index += literal[0].length;
      return {
        value: literal[0] === "true" ? true : literal[0] === "false" ? false : null,
        start, end: index
      };
    }

    const numeric = text.slice(index).match(/^-?(?:0|[1-9][0-9]*)(?:[.][0-9]+)?(?:[eE][+-]?[0-9]+)?/);
    if (numeric) {
      index += numeric[0].length;
      return { value: Number(numeric[0]), numberRaw: numeric[0], start, end: index };
    }
    fail("Malformed JSON value.");
  }

  const parsed = parseValue();
  whitespace();
  if (index !== text.length) fail("Unexpected trailing content after JSON value.");
  return parsed.value;
}

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
function canonicalJson(value, parent = null, parentKey = null) {
  if (Array.isArray(value)) {
    return `[${value.map((item, index) => canonicalJson(item, value, index)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort(compareUnicodeCodePoints);
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key], value, key)}`).join(",")}}`;
  }
  const rawNumber = typeof value === "number" && parent !== null
    ? numericLexemes.get(parent)?.get(String(parentKey))
    : undefined;
  const encoded = rawNumber ?? JSON.stringify(value);
  if (encoded === undefined) fail("Action contains a value that cannot be represented as canonical JSON.");
  return encoded;
}

function actionDigest(action) {
  return crypto.createHash("sha256").update(canonicalJson(action), "utf8").digest("hex");
}

function validateAuthorizationBinding(response, options = {}) {
  const configuredChainId = options.expectedChainId ?? process.env.PORTALDOT_CHAIN_ID;
  if (configuredChainId === undefined || configuredChainId === null || String(configuredChainId).trim() === "") {
    fail("PORTALDOT_CHAIN_ID must be explicitly configured; refusing an assumed network ID.");
  }
  if (typeof configuredChainId === "string" && !/^[1-9][0-9]*$/.test(configuredChainId)) {
    fail("Expected PortalDot chain ID must be a canonical positive decimal integer.");
  }
  const expectedChainId = Number(configuredChainId);
  const now = Number(options.now ?? Math.floor(Date.now() / 1000));
  if (!Number.isSafeInteger(expectedChainId) || expectedChainId <= 0) {
    fail("Expected PortalDot chain ID must be a positive safe integer.");
  }

  const receipt = response && response.decision_receipt;
  const authorization = response && response.execution_authorization;
  if (!receipt || !receipt.payload) {
    fail("Response must include a signed decision receipt.");
  }
  if (receipt.algorithm !== "Ed25519") {
    fail("Only Ed25519 Verigate receipts are accepted.");
  }

  const receiptPayload = receipt.payload;
  const intent = receiptPayload.intent;
  const decision = receiptPayload.decision;
  if (!intent || !decision) fail("Decision receipt is missing its intent or decision.");
  if (decision.decision !== "ALLOW") fail("Verigate decision is not ALLOW; no EVM signature was produced.");
  if (!authorization || !authorization.payload) {
    fail("ALLOW response must include an execution authorization.");
  }
  if (authorization.algorithm !== "Ed25519") {
    fail("Only Ed25519 Verigate receipts are accepted.");
  }
  const authPayload = authorization.payload;
  const action = authPayload.action;
  if (!action) fail("Execution authorization is missing its action.");
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

  // Authorization timestamps are JSON numbers in Verigate artifacts. Do not
  // coerce strings such as "2000000240" into trusted clock values.
  const issuedAt = authPayload.issued_at;
  const expiresAt = authPayload.expires_at;
  if (typeof issuedAt !== "number" || !Number.isSafeInteger(issuedAt) ||
      typeof expiresAt !== "number" || !Number.isSafeInteger(expiresAt) ||
      !Number.isSafeInteger(now) || expiresAt <= now) {
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
  const isExactChainId = (value) =>
    (typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value === expectedChainId) ||
    (typeof value === "string" && /^[1-9][0-9]*$/.test(value) && value === String(expectedChainId));
  if (!isExactChainId(mapping.chain_id) || !isExactChainId(intentMapping.chain_id)) {
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

  // Transfer amounts are exact base-unit values. Require canonical decimal strings
  // rather than coercing JSON numbers, which can lose precision above 2^53 - 1.
  const amountText = action.amount_exact;
  const mappedAmount = mapping.amount_base_units;
  const intentMappedAmount = intentMapping.amount_base_units;
  if (typeof amountText !== "string" ||
      typeof mappedAmount !== "string" ||
      typeof intentMappedAmount !== "string" ||
      !/^[1-9][0-9]*$/.test(amountText) ||
      amountText !== mappedAmount ||
      intentMappedAmount !== amountText) {
    fail("amount_exact and metadata.portaldot_v3.amount_base_units must be matching canonical positive base-unit integer strings.");
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

function verifyLocally(
  attestation,
  publicKeyPath = process.env.VERIGATE_PUBLIC_KEY_FILE,
  expectedKeySha256 = process.env.VERIGATE_PUBLIC_KEY_SHA256
) {
  if (!publicKeyPath) {
    fail("VERIGATE_PUBLIC_KEY_FILE must point to a pinned Verigate issuer public key PEM.");
  }
  if (typeof expectedKeySha256 !== "string" || !/^[a-f0-9]{64}$/i.test(expectedKeySha256)) {
    fail("VERIGATE_PUBLIC_KEY_SHA256 must be set to the independently verified SHA-256 fingerprint of the issuer public key.");
  }
  if (!attestation || attestation.algorithm !== "Ed25519" || !attestation.payload ||
      typeof attestation.payload !== "object" || Array.isArray(attestation.payload)) {
    fail("Local verification requires an Ed25519 attestation with an object payload.");
  }
  const encodedSignature = attestation.signature;
  if (typeof encodedSignature !== "string" ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encodedSignature)) {
    fail("Verigate signature is not valid canonical base64.");
  }
  const signature = Buffer.from(encodedSignature, "base64");
  if (signature.length !== 64 || signature.toString("base64") !== encodedSignature) {
    fail("Verigate Ed25519 signature must be exactly 64 bytes in canonical base64.");
  }

  let publicKey;
  try {
    publicKey = crypto.createPublicKey(fs.readFileSync(publicKeyPath));
  } catch (error) {
    fail("Cannot load the pinned Verigate public key from VERIGATE_PUBLIC_KEY_FILE: " + error.message);
  }
  if (publicKey.asymmetricKeyType !== "ed25519") {
    fail("VERIGATE_PUBLIC_KEY_FILE must contain an Ed25519 public key.");
  }
  // Hash normalized SubjectPublicKeyInfo DER, not PEM text, so harmless
  // whitespace/line-ending changes cannot alter the fingerprint.
  const actualKeySha256 = crypto
    .createHash("sha256")
    .update(publicKey.export({ type: "spki", format: "der" }))
    .digest("hex");
  if (actualKeySha256 !== expectedKeySha256.toLowerCase()) {
    fail("Verigate issuer public-key fingerprint does not match VERIGATE_PUBLIC_KEY_SHA256; refusing to trust the issuer API response.");
  }

  let valid = false;
  try {
    valid = crypto.verify(
      null,
      Buffer.from(canonicalJson(attestation.payload), "utf8"),
      publicKey,
      signature
    );
  } catch (error) {
    fail("Local Ed25519 signature verification failed: " + error.message);
  }
  if (!valid) fail("Local Ed25519 signature verification failed; refusing to trust the issuer API response.");
  return true;
}

async function verifyWithVerigate(baseUrl, attestation, apiKey) {
  let verifierBase;
  try {
    verifierBase = new URL(baseUrl);
  } catch {
    fail("VERIGATE_BASE_URL must be a valid absolute URL.");
  }
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (verifierBase.username || verifierBase.password) {
    fail("VERIGATE_BASE_URL must not embed credentials.");
  }
  if (verifierBase.protocol !== "https:" &&
      !(verifierBase.protocol === "http:" && loopbackHosts.has(verifierBase.hostname))) {
    fail("VERIGATE_BASE_URL must use HTTPS except for loopback development endpoints.");
  }
  const verifierUrl = new URL("/v1/verify", verifierBase);
  const response = await fetch(verifierUrl, {
    method: "POST",
    redirect: "error",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { "x-api-key": apiKey } : {})
    },
    // Reuse source JSON for the payload when available so integral floats
    // (for example 1.0) remain floats when Python's verifier parses the request.
    body: rawJsonValues.has(attestation.payload)
      ? `{"payload":${rawJsonValues.get(attestation.payload)},"signature":${JSON.stringify(attestation.signature)},"algorithm":${JSON.stringify(attestation.algorithm)}}`
      : JSON.stringify({
          payload: attestation.payload,
          signature: attestation.signature,
          algorithm: attestation.algorithm
        }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) fail(`Verigate signature verification endpoint returned HTTP ${response.status}.`);
  const result = await response.json();
  if (!result || result.valid !== true) fail(`Verigate signature was not validated: ${result?.reason || "unknown reason"}`);
}

const GUARD_READ_ABI = ["function authoritySigner() view returns (address)"];

async function verifyGuardDeployment(options = {}) {
  const rpcUrl = String(options.rpcUrl ?? process.env.PORTALDOT_RPC_URL ?? "").trim();
  const chainIdText = String(options.expectedChainId ?? process.env.PORTALDOT_CHAIN_ID ?? "").trim();
  const guardAddress = options.guardAddress ?? process.env.PORTALDOT_GUARD_ADDRESS;
  const authorityAddress = options.authoritySigner ?? process.env.AUTHORITY_SIGNER_ADDRESS;
  const expectedCodeHash = String(options.guardCodeHash ?? process.env.PORTALDOT_GUARD_CODE_HASH ?? "").trim();
  const expectedGenesisHashValue = options.genesisHash ?? process.env.PORTALDOT_GENESIS_HASH;

  if (!rpcUrl) fail("PORTALDOT_RPC_URL is required to verify the deployed guard before signing.");
  if (!/^[1-9][0-9]*$/.test(chainIdText)) {
    fail("PORTALDOT_CHAIN_ID must be a canonical positive decimal integer before verifying the deployed guard.");
  }
  if (!guardAddress || !ethers.isAddress(guardAddress) || ethers.getAddress(guardAddress) === ethers.ZeroAddress) {
    fail("PORTALDOT_GUARD_ADDRESS must be a non-zero EVM address.");
  }
  if (!authorityAddress || !ethers.isAddress(authorityAddress) || ethers.getAddress(authorityAddress) === ethers.ZeroAddress) {
    fail("AUTHORITY_SIGNER_ADDRESS must be a non-zero EVM address before verifying the deployed guard.");
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(expectedCodeHash)) {
    fail("PORTALDOT_GUARD_CODE_HASH must be the independently verified 32-byte runtime-code hash of PortalDotAgentGuard.");
  }
  const expectedGenesisHash = configuredGenesisHash(expectedGenesisHashValue);

  let parsedUrl;
  try {
    parsedUrl = new URL(rpcUrl);
  } catch {
    fail("PORTALDOT_RPC_URL must be a valid absolute URL for guard verification.");
  }
  if (parsedUrl.username || parsedUrl.password) {
    fail("PORTALDOT_RPC_URL must not embed credentials.");
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    fail("PORTALDOT_RPC_URL must use HTTP or HTTPS for guard verification.");
  }
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (parsedUrl.protocol === "http:" && !loopbackHosts.has(parsedUrl.hostname.toLowerCase())) {
    fail("Remote RPC endpoints must use HTTPS for guard verification.");
  }

  const expectedChainId = BigInt(chainIdText);
  let provider;
  const ownsProvider = typeof options.providerFactory !== "function";
  try {
    provider = ownsProvider
      ? new ethers.JsonRpcProvider(rpcUrl)
      : await options.providerFactory(rpcUrl);

    const network = await provider.getNetwork();
    if (network.chainId !== expectedChainId) {
      fail(`Guard RPC is on chain ID ${network.chainId}, expected ${expectedChainId}; refusing to sign.`);
    }
    const actualGenesisHash = await verifyGenesisHashIfConfigured(provider, expectedGenesisHash);

    const address = ethers.getAddress(guardAddress);
    const code = await provider.getCode(address);
    if (typeof code !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(code)) {
      fail(`No deployed contract bytecode found at PORTALDOT_GUARD_ADDRESS ${address}; refusing to sign.`);
    }
    const actualCodeHash = ethers.keccak256(code);
    if (actualCodeHash.toLowerCase() !== expectedCodeHash.toLowerCase()) {
      fail(`Deployed guard runtime-code hash ${actualCodeHash} does not match PORTALDOT_GUARD_CODE_HASH; refusing to sign.`);
    }

    const makeContract = options.contractFactory ||
      ((contractAddress, rpcProvider) => new ethers.Contract(contractAddress, GUARD_READ_ABI, rpcProvider));
    const guard = makeContract(address, provider);
    const actualAuthority = ethers.getAddress(await guard.authoritySigner());
    const expectedAuthority = ethers.getAddress(authorityAddress);
    if (actualAuthority !== expectedAuthority) {
      fail(`Deployed guard authoritySigner ${actualAuthority} does not match AUTHORITY_SIGNER_ADDRESS ${expectedAuthority}; refusing to sign.`);
    }

    return {
      chainId: network.chainId,
      genesisHash: actualGenesisHash,
      guardAddress: address,
      authoritySigner: actualAuthority,
      runtimeCodeHash: actualCodeHash,
      deployedCodeBytes: (code.length - 2) / 2
    };
  } finally {
    if (ownsProvider && provider && typeof provider.destroy === "function") {
      await provider.destroy();
    }
  }
}

async function signAuthorization(response, options = {}) {
  const transfer = validateAuthorizationBinding(response);
  const baseUrl = process.env.VERIGATE_BASE_URL || "http://127.0.0.1:8000";
  const apiKey = process.env.VERIGATE_API_KEY || "";

  // Verify independently against a pinned issuer key before contacting the API.
  // The remote verifier is a second check, never the sole source of signature truth.
  const publicKeyPath = process.env.VERIGATE_PUBLIC_KEY_FILE;
  verifyLocally(response.decision_receipt, publicKeyPath);
  verifyLocally(response.execution_authorization, publicKeyPath);
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

  // Bind every EIP-712 signature to an actually deployed guard on the configured
  // chain and verify that its on-chain immutable authority matches this signer.
  await verifyGuardDeployment({ providerFactory: options.providerFactory });

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
  const response = parseJsonPreservingNumbers(fs.readFileSync(file, "utf8"));
  const signed = await signAuthorization(response);
  process.stdout.write(JSON.stringify(
    signed,
    (_key, value) => typeof value === "bigint" ? value.toString() : value,
    2
  ) + "\n");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Bridge signing refused: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { validateAuthorizationBinding, verifyLocally, verifyWithVerigate, verifyGuardDeployment, signAuthorization, canonicalJson, actionDigest, parseJsonPreservingNumbers };
