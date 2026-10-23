#!/usr/bin/env node
/**
 * Execute one Verigate-authorized native PortalDot Substrate transfer.
 *
 * This is a testnet-only adapter for Balances.transfer_keep_alive. It is
 * deliberately separate from the EVM Guard adapter. No transaction is sent
 * unless --broadcast is supplied explicitly.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady, decodeAddress, encodeAddress } from "@polkadot/util-crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  actionDigest,
  canonicalJson,
  parseJsonPreservingNumbers,
  verifyLocally,
  verifyWithVerigate,
} = require("../adapter/verigate-bridge.js");

export const TESTNET_RPC = "wss://test-node-v3.portaldot.dev";
export const TESTNET_GENESIS_HASH =
  "0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd";
export const SS58_FORMAT = 42;
export const NATIVE_DECIMALS = 14;
export const NATIVE_SCALE = 10n ** BigInt(NATIVE_DECIMALS);
export const MAX_NATIVE_AMOUNT = (1n << 128n) - 1n;
export const EXPECTED_ACTION_TYPE = "portaldot.substrate_transfer";
export const EXPECTED_NETWORK = "portaldot-v3-substrate";
export const EXPECTED_ASSET = "POT";

function fail(message) {
  throw new Error(message);
}

function isLoopback(hostname) {
  return new Set(["localhost", "127.0.0.1", "::1", "[::1]"]).has(String(hostname).toLowerCase());
}

export function validateSubstrateRpcUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || "").trim());
  } catch {
    fail("PORTALDOT_SUBSTRATE_RPC_URL must be a valid absolute WebSocket URL.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash ||
      (parsed.pathname !== "" && parsed.pathname !== "/")) {
    fail("Substrate RPC URL must not contain credentials, query parameters, fragments, or a custom path.");
  }
  const officialTestnet = parsed.protocol === "wss:" &&
    parsed.hostname.toLowerCase() === "test-node-v3.portaldot.dev" &&
    parsed.port === "";
  const localSimulator = parsed.protocol === "ws:" && isLoopback(parsed.hostname);
  if (!officialTestnet && !localSimulator) {
    fail("Refusing native Substrate write path: remote operations are restricted to " +
      TESTNET_RPC + "; WS is allowed only for a loopback simulator. Mainnet is not configured.");
  }
  return { url: parsed.toString().replace(/\/$/, ""), officialTestnet, localSimulator };
}

export function resolveExpectedGenesisHash(rpcUrl, configuredHash = process.env.PORTALDOT_SUBSTRATE_GENESIS_HASH) {
  const network = validateSubstrateRpcUrl(rpcUrl);
  const pin = String(configuredHash || "").trim().toLowerCase();
  if (network.officialTestnet) {
    if (pin && pin !== TESTNET_GENESIS_HASH) {
      fail("PORTALDOT_SUBSTRATE_GENESIS_HASH differs from the recorded PortalDot V3 testnet pin; refusing.");
    }
    return TESTNET_GENESIS_HASH;
  }
  if (!/^0x[a-f0-9]{64}$/.test(pin)) {
    fail("A local loopback test must explicitly configure its local PORTALDOT_SUBSTRATE_GENESIS_HASH.");
  }
  return pin;
}

export function normalizeSs58Address(value, ss58Format = SS58_FORMAT) {
  if (typeof value !== "string" || !value.trim()) fail("Substrate recipient must be a non-empty SS58 address.");
  let decoded;
  try {
    decoded = decodeAddress(value.trim());
  } catch {
    fail("Substrate recipient is not a valid checksummed SS58 address.");
  }
  if (!(decoded instanceof Uint8Array) || decoded.length !== 32) {
    fail("Substrate recipient must decode to a 32-byte AccountId32.");
  }
  const normalized = encodeAddress(decoded, ss58Format);
  if (normalized !== value.trim()) {
    fail("Substrate recipient must use the PortalDot SS58 prefix 42.");
  }
  return normalized;
}

function positiveCanonicalInteger(value, label) {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    fail(label + " must be a canonical positive decimal integer string.");
  }
  const parsed = BigInt(value);
  if (parsed > MAX_NATIVE_AMOUNT) fail(label + " exceeds the native 128-bit balance range.");
  return parsed;
}

export function formatNativePot(baseUnits) {
  const amount = BigInt(baseUnits);
  if (amount < 0n) fail("POT amount cannot be negative.");
  const whole = amount / NATIVE_SCALE;
  const fraction = (amount % NATIVE_SCALE).toString().padStart(NATIVE_DECIMALS, "0").replace(/0+$/, "");
  return fraction ? whole.toString() + "." + fraction : whole.toString();
}

export function validateSubstrateTransferBinding(response, options = {}) {
  const expectedGenesisHash = String(options.expectedGenesisHash ||
    process.env.PORTALDOT_SUBSTRATE_GENESIS_HASH || TESTNET_GENESIS_HASH).trim().toLowerCase();
  const now = Number(options.now ?? Math.floor(Date.now() / 1000));
  if (!/^0x[a-f0-9]{64}$/.test(expectedGenesisHash)) {
    fail("Expected Substrate genesis hash must be a 32-byte hexadecimal value.");
  }

  const receipt = response && response.decision_receipt;
  const authorization = response && response.execution_authorization;
  if (!receipt || !receipt.payload || receipt.algorithm !== "Ed25519") {
    fail("Response must include an Ed25519 signed decision receipt.");
  }
  if (!authorization || !authorization.payload || authorization.algorithm !== "Ed25519") {
    fail("Response must include an Ed25519 signed execution authorization.");
  }
  const receiptPayload = receipt.payload;
  const intent = receiptPayload.intent;
  const decision = receiptPayload.decision;
  const authPayload = authorization.payload;
  const action = authPayload.action;
  if (!intent || !decision || !action) fail("Verigate artifacts are missing their intent, decision, or action.");
  if (decision.decision !== "ALLOW") fail("Verigate decision is not ALLOW; refusing native Substrate execution.");
  if (decision.intent_id !== intent.intent_id || decision.agent_id !== intent.agent_id) {
    fail("Decision receipt intent/agent identifiers do not match.");
  }
  if (authPayload.intent_id !== intent.intent_id || authPayload.agent_id !== intent.agent_id) {
    fail("Execution authorization is bound to a different intent or agent.");
  }
  if (authPayload.nonce !== intent.intent_id) {
    fail("Execution authorization nonce must match the receipt intent ID.");
  }
  const expectedAuthorizationId = crypto.createHash("sha256")
    .update(String(receipt.signature) + String(authPayload.nonce), "utf8").digest("hex");
  if (String(authPayload.authorization_id || "").toLowerCase() !== expectedAuthorizationId) {
    fail("Execution authorization ID does not match the receipt signature and nonce.");
  }
  if (authPayload.policy_sha256 !== receiptPayload.policy_sha256) {
    fail("Execution authorization policy digest does not match the decision receipt.");
  }
  if (!/^[a-f0-9]{64}$/i.test(String(authPayload.authorization_id || "")) ||
      !/^[a-f0-9]{64}$/i.test(String(authPayload.action_sha256 || ""))) {
    fail("Execution authorization is missing a valid authorization ID or action digest.");
  }

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
      fail("Receipt and execution authorization disagree on action field: " + field + ".");
    }
  }
  if (action.action_type !== EXPECTED_ACTION_TYPE) fail("Action type must be " + EXPECTED_ACTION_TYPE + ".");
  if (action.network !== EXPECTED_NETWORK) fail("Action network must be " + EXPECTED_NETWORK + ".");
  if (action.asset !== EXPECTED_ASSET) fail("Native Substrate transfer asset must be POT.");

  const mapping = action.metadata && action.metadata.portaldot_substrate_v3;
  const intentMapping = intent.metadata && intent.metadata.portaldot_substrate_v3;
  if (!mapping || !intentMapping) {
    fail("Signed intent must include metadata.portaldot_substrate_v3.");
  }
  if (String(mapping.genesis_hash || "").toLowerCase() !== expectedGenesisHash ||
      String(intentMapping.genesis_hash || "").toLowerCase() !== expectedGenesisHash) {
    fail("Signed intent is not bound to the expected PortalDot Substrate genesis hash.");
  }

  const recipient = normalizeSs58Address(mapping.recipient_ss58);
  const intentRecipient = normalizeSs58Address(intentMapping.recipient_ss58);
  const actionTarget = normalizeSs58Address(action.target);
  if (recipient !== intentRecipient || recipient !== actionTarget) {
    fail("Target and Substrate recipient metadata do not match.");
  }

  const amountText = positiveCanonicalInteger(action.amount_exact, "amount_exact").toString();
  const mappedAmount = positiveCanonicalInteger(mapping.amount_base_units, "metadata.portaldot_substrate_v3.amount_base_units").toString();
  const intentAmount = positiveCanonicalInteger(intentMapping.amount_base_units, "intent metadata amount_base_units").toString();
  if (amountText !== mappedAmount || amountText !== intentAmount) {
    fail("amount_exact and signed native amount_base_units must match exactly.");
  }

  // The fee ceiling is part of the signed action digest. It is an off-chain
  // preflight budget, not an on-chain guarantee of the final charged fee.
  const mappedFeeCeiling = positiveCanonicalInteger(
    mapping.max_fee_base_units,
    "metadata.portaldot_substrate_v3.max_fee_base_units",
  ).toString();
  const intentFeeCeiling = positiveCanonicalInteger(
    intentMapping.max_fee_base_units,
    "intent metadata max_fee_base_units",
  ).toString();
  if (mappedFeeCeiling !== intentFeeCeiling) {
    fail("Signed max_fee_base_units must match in intent and execution authorization.");
  }

  const digest = actionDigest(action);
  if (String(authPayload.action_sha256 || "").toLowerCase() !== digest) {
    fail("Execution authorization action digest does not match its action.");
  }
  if (digest !== actionDigest(intent)) {
    fail("Execution authorization action does not exactly match the signed decision receipt intent.");
  }

  return {
    recipient,
    amount: BigInt(amountText),
    amountBaseUnits: amountText,
    amountPot: formatNativePot(amountText),
    maxFeeBaseUnits: mappedFeeCeiling,
    maxFeePot: formatNativePot(mappedFeeCeiling),
    authorizationId: String(authPayload.authorization_id).toLowerCase(),
    intentId: String(intent.intent_id),
    agentId: String(intent.agent_id),
    policySha256: String(authPayload.policy_sha256),
    actionSha256: digest,
    issuedAt,
    expiresAt,
    expectedGenesisHash,
    decision: "ALLOW",
  };
}

async function verifyVerigateArtifacts(response) {
  const publicKeyPath = process.env.VERIGATE_PUBLIC_KEY_FILE;
  verifyLocally(response.decision_receipt, publicKeyPath);
  verifyLocally(response.execution_authorization, publicKeyPath);
  const baseUrl = process.env.VERIGATE_BASE_URL || "http://127.0.0.1:8000";
  const apiKey = process.env.VERIGATE_API_KEY || "";
  await verifyWithVerigate(baseUrl, response.decision_receipt, apiKey);
  await verifyWithVerigate(baseUrl, response.execution_authorization, apiKey);
}

function reserveAuthorization(replayDirectory, authorization) {
  fs.mkdirSync(replayDirectory, { recursive: true, mode: 0o700 });
  const filePath = path.join(replayDirectory, authorization.authorizationId + ".json");
  let fd;
  try {
    fd = fs.openSync(filePath, "wx", 0o600);
  } catch (error) {
    if (error && error.code === "EEXIST") {
      fail("This Verigate authorization was already reserved locally; refusing replay.");
    }
    throw error;
  }
  try {
    fs.writeFileSync(fd, JSON.stringify({
      schemaVersion: 1,
      authorizationId: authorization.authorizationId,
      intentId: authorization.intentId,
      actionSha256: authorization.actionSha256,
      reservedAt: new Date().toISOString(),
      state: "reserved_before_broadcast",
    }, null, 2) + "\n");
  } finally {
    fs.closeSync(fd);
  }
  return filePath;
}

function markAuthorizationCompleted(filePath, report) {
  const reserved = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const output = {
    ...reserved,
    state: "broadcast_finalized",
    transactionHash: report.transactionHash,
    blockHash: report.blockHash,
    finalizedAt: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, JSON.stringify(output, null, 2) + "\n", { mode: 0o600 });
}

function eventToJson(record) {
  return {
    section: record.event.section,
    method: record.event.method,
    data: record.event.data.map((item) => item.toString()),
    phase: record.phase && record.phase.isApplyExtrinsic ? record.phase.asApplyExtrinsic.toNumber() : null,
  };
}

function decodeDispatchError(api, error) {
  if (error.isModule) {
    const meta = api.registry.findMetaError(error.asModule);
    return meta.section + "." + meta.name + (meta.docs.length ? ": " + meta.docs.join(" ") : "");
  }
  return error.toString();
}

async function submitTransfer(api, signer, transfer, replayDirectory) {
  const replayFile = reserveAuthorization(replayDirectory, transfer);
  const extrinsic = api.tx.balances.transferKeepAlive(transfer.recipient, transfer.amount);
  let unsubscribe;
  let settled = false;
  const resultPromise = new Promise((resolve, reject) => {
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      if (unsubscribe) {
        try { unsubscribe(); } catch { /* best effort cleanup */ }
      }
      if (error) reject(error);
      else resolve(result);
    };
    extrinsic.signAndSend(signer, (result) => {
      const failed = result.events.find(({ event }) =>
        event.section === "system" && event.method === "ExtrinsicFailed");
      if (failed) {
        const dispatchError = failed.event.data[0];
        finish(new Error("Substrate extrinsic failed: " + decodeDispatchError(api, dispatchError)));
        return;
      }
      if (!result.status.isFinalized) return;
      const transferEvents = result.events.filter(({ event }) =>
        event.section === "balances" && event.method === "Transfer" &&
        event.data.length >= 3 &&
        normalizeSs58Address(event.data[1].toString()) === transfer.recipient &&
        BigInt(event.data[2].toString()) === transfer.amount);
      if (transferEvents.length !== 1) {
        finish(new Error("Finalized extrinsic did not emit exactly one matching Balances.Transfer event."));
        return;
      }
      const report = {
        schemaVersion: 1,
        status: "SUCCESS",
        network: "PortalDot V3 Substrate testnet",
        actionType: EXPECTED_ACTION_TYPE,
        decision: "ALLOW",
        intentId: transfer.intentId,
        authorizationId: transfer.authorizationId,
        actionSha256: transfer.actionSha256,
        policySha256: transfer.policySha256,
        signer: signer.address,
        recipient: transfer.recipient,
        amountBaseUnits: transfer.amountBaseUnits,
        amountPOT: transfer.amountPot,
        transactionHash: result.txHash.toHex(),
        blockHash: result.status.asFinalized.toHex(),
        matchedTransferEvent: eventToJson(transferEvents[0]),
        events: result.events.map(eventToJson),
        transactionBroadcast: true,
        rpcProviderCount: 1,
        note: "Single configured RPC; receipt/event are endpoint observations, not independent authentication.",
      };
      markAuthorizationCompleted(replayFile, report);
      finish(null, report);
    }).then((unsub) => {
      unsubscribe = unsub;
      if (settled && unsubscribe) {
        try { unsubscribe(); } catch { /* best effort cleanup */ }
      }
    }).catch(finish);
  });
  return resultPromise;
}

export async function createTransferPreflight(api, transfer, signerAddress) {
  const canonicalPayer = normalizeSs58Address(signerAddress);
  if (canonicalPayer === transfer.recipient) fail("Sender and recipient must differ.");
  if (typeof api.tx?.balances?.transferKeepAlive !== "function") {
    fail("Connected runtime does not expose Balances.transfer_keep_alive; refusing an alternate call.");
  }
  const extrinsic = api.tx.balances.transferKeepAlive(transfer.recipient, transfer.amount);
  const [payerAccount, recipientAccount, paymentInfo, runtimeVersion, chainName, genesisHash] = await Promise.all([
    api.query.system.account(canonicalPayer),
    api.query.system.account(transfer.recipient),
    extrinsic.paymentInfo(canonicalPayer),
    api.rpc.state.getRuntimeVersion(),
    api.rpc.system.chain(),
    Promise.resolve(api.genesisHash.toHex().toLowerCase()),
  ]);
  const freeBalance = BigInt(payerAccount.data.free.toString());
  const fee = BigInt(paymentInfo.partialFee.toString());
  const maxFee = BigInt(transfer.maxFeeBaseUnits);
  if (fee > maxFee) {
    fail("Estimated native fee " + fee.toString() + " base units (" + formatNativePot(fee) +
      " POT) exceeds the signed max_fee_base_units ceiling " + maxFee.toString() +
      " (" + formatNativePot(maxFee) + " POT); refusing to proceed.");
  }
  const existentialDeposit = BigInt(api.consts.balances.existentialDeposit.toString());
  if (freeBalance < transfer.amount + fee) fail("Executor balance is below transfer amount plus estimated fee.");
  if (freeBalance - transfer.amount - fee < existentialDeposit) {
    fail("Transfer would leave the executor below the runtime existential deposit; refusing keep-alive transfer.");
  }
  if (BigInt(recipientAccount.data.free.toString()) === 0n && transfer.amount < existentialDeposit) {
    fail("Transfer amount is below the existential deposit for a new recipient account.");
  }
  return {
    status: "READY",
    network: "PortalDot V3 Substrate",
    rpcUrl: api.__portalDotRpcUrl || null,
    chainName: chainName.toString(),
    specName: runtimeVersion.specName.toString(),
    specVersion: Number(runtimeVersion.specVersion.toString()),
    transactionVersion: Number(runtimeVersion.transactionVersion.toString()),
    genesisHash,
    expectedGenesisHash: transfer.expectedGenesisHash,
    genesisHashMatches: genesisHash === transfer.expectedGenesisHash,
    payer: canonicalPayer,
    recipient: transfer.recipient,
    amountBaseUnits: transfer.amountBaseUnits,
    amountPOT: transfer.amountPot,
    estimatedFeeBaseUnits: fee.toString(),
    estimatedFeePOT: formatNativePot(fee),
    authorizedMaxFeeBaseUnits: maxFee.toString(),
    authorizedMaxFeePOT: formatNativePot(maxFee),
    feeCeilingPassed: fee <= maxFee,
    freeBalanceBaseUnits: freeBalance.toString(),
    freeBalancePOT: formatNativePot(freeBalance),
    existentialDepositBaseUnits: existentialDeposit.toString(),
    authorizationId: transfer.authorizationId,
    intentId: transfer.intentId,
    actionSha256: transfer.actionSha256,
    transactionBroadcast: false,
    requiresExplicitBroadcast: true,
    feeEstimationIsNotExecutionSimulation: true,
  };
}

export async function runSubstrateTransfer(response, options = {}) {
  await cryptoWaitReady();
  const rpcUrl = String(options.rpcUrl ?? process.env.PORTALDOT_SUBSTRATE_RPC_URL ?? TESTNET_RPC).trim();
  const network = validateSubstrateRpcUrl(rpcUrl);
  const expectedGenesisHash = resolveExpectedGenesisHash(rpcUrl, options.expectedGenesisHash ??
    process.env.PORTALDOT_SUBSTRATE_GENESIS_HASH);
  const transfer = validateSubstrateTransferBinding(response, { expectedGenesisHash, now: options.now });
  await verifyVerigateArtifacts(response);

  const wsProvider = options.wsProvider || new WsProvider(network.url, 10000);
  const api = options.api || await ApiPromise.create({ provider: wsProvider });
  api.__portalDotRpcUrl = network.url;
  try {
    const actualGenesisHash = api.genesisHash.toHex().toLowerCase();
    if (actualGenesisHash !== expectedGenesisHash) {
      fail("Connected Substrate genesis hash does not match the expected pin; refusing native transfer.");
    }
    const runtimeVersion = await api.rpc.state.getRuntimeVersion();
    if (runtimeVersion.specName.toString() !== "portaldot-v3") {
      fail("Connected runtime specName is not portaldot-v3; refusing native transfer.");
    }
    const signerAddress = String(options.signerAddress ?? process.env.PORTALDOT_SUBSTRATE_SIGNER_ADDRESS ?? "").trim();
    if (!signerAddress) fail("PORTALDOT_SUBSTRATE_SIGNER_ADDRESS is required for a read-only fee/balance preflight.");
    const preflight = await createTransferPreflight(api, transfer, signerAddress);

    if (!options.broadcast) {
      return {
        ...preflight,
        status: "DRY_RUN_READY",
        signedArtifactsVerified: true,
        remoteVerifierChecked: true,
        message: "Verigate ALLOW and signatures verified. No extrinsic was signed or broadcast. Fee is an estimate, not a dry-run execution result.",
      };
    }

    if (!network.officialTestnet && !network.localSimulator) {
      fail("Broadcast is restricted to the confirmed PortalDot testnet or a loopback development node.");
    }
    const suri = String(options.signerUri ?? process.env.PORTALDOT_SUBSTRATE_SIGNER_URI ?? "");
    if (!suri) fail("PORTALDOT_SUBSTRATE_SIGNER_URI is required only for explicit --broadcast.");
    const keyring = new Keyring({ type: "sr25519", ss58Format: SS58_FORMAT });
    const signer = keyring.addFromUri(suri);
    if (normalizeSs58Address(signer.address) !== normalizeSs58Address(signerAddress)) {
      fail("PORTALDOT_SUBSTRATE_SIGNER_URI does not match PORTALDOT_SUBSTRATE_SIGNER_ADDRESS.");
    }
    const replayDirectory = options.replayDirectory ||
      process.env.PORTALDOT_SUBSTRATE_REPLAY_DIR ||
      path.resolve(".verigate-substrate-replay");
    return await submitTransfer(api, signer, transfer, replayDirectory);
  } finally {
    if (!options.api) await api.disconnect();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const inputFile = args.find((arg) => !arg.startsWith("--"));
  const broadcast = args.includes("--broadcast");
  const unknown = args.filter((arg) => arg.startsWith("--") && arg !== "--broadcast");
  if (unknown.length) fail("Unknown argument(s): " + unknown.join(", "));
  if (!inputFile || args.filter((arg) => !arg.startsWith("--")).length !== 1) {
    fail("Usage: npm run substrate:execute -- ./authorization-response.json [--broadcast]");
  }
  const response = parseJsonPreservingNumbers(fs.readFileSync(inputFile, "utf8"));
  const report = await runSubstrateTransfer(response, { broadcast });
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (!broadcast && report.status === "DRY_RUN_READY") {
    process.stdout.write("DRY-RUN ONLY: no Substrate extrinsic was signed or sent. Add --broadcast only after reviewing the exact action.\n");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error("PortalDot native transfer refused: " + error.message);
    process.exitCode = 1;
  });
}
