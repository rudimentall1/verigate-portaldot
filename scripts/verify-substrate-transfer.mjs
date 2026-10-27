#!/usr/bin/env node
/**
 * Read-only verification of a saved native PortalDot Substrate transfer.
 *
 * The script never signs, submits, or mutates chain state. It checks the saved
 * transfer against one RPC, or two configured RPC endpoints when a secondary
 * is available. Different endpoints do not prove independent operators.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { normalizeSs58Address } from "./execute-substrate-authorized-transfer.mjs";

const DEFAULT_EVIDENCE = "docs/evidence/portaldot-native-substrate-live-transfer-2026-10-24.json";
const HASH_RE = /^0x[a-f0-9]{64}$/i;
const INTEGER_RE = /^(0|[1-9][0-9]*)$/;

function fail(message) {
  throw new Error(message);
}

function requiredString(value, name) {
  if (typeof value !== "string" || value.trim() === "") fail(`Evidence is missing ${name}.`);
  return value.trim();
}

function requiredHash(value, name) {
  const hash = requiredString(value, name).toLowerCase();
  if (!HASH_RE.test(hash)) fail(`Evidence field ${name} must be a 32-byte hexadecimal hash.`);
  return hash;
}

function canonicalInteger(value, name, { allowZero = true } = {}) {
  const text = typeof value === "number" ? String(value) : String(value ?? "");
  if (!(allowZero ? INTEGER_RE : /^[1-9][0-9]*$/).test(text)) {
    fail(`Evidence field ${name} must be a canonical decimal integer.`);
  }
  return text;
}

export function validateNativeTransferEvidence(evidence) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    fail("Evidence file must contain a JSON object.");
  }
  if (evidence.status !== "SUCCESS") fail("Evidence status must be SUCCESS.");
  if (evidence.network !== "PortalDot V3 Substrate testnet") {
    fail("Evidence network must be PortalDot V3 Substrate testnet.");
  }
  const runtime = evidence.runtime;
  const authorization = evidence.authorization;
  const execution = evidence.execution;
  const feeEvent = execution?.feeEvent;
  if (!runtime || !authorization || !execution || !feeEvent) {
    fail("Evidence must include runtime, authorization, execution, and fee event records.");
  }
  const genesisHash = requiredHash(runtime.genesisHash, "runtime.genesisHash");
  const transactionHash = requiredHash(execution.transactionHash, "execution.transactionHash");
  const finalizedBlockHash = requiredHash(execution.finalizedBlockHash, "execution.finalizedBlockHash");
  const signer = requiredString(authorization.signer, "authorization.signer");
  const recipient = requiredString(authorization.recipient, "authorization.recipient");
  const amountBaseUnits = canonicalInteger(authorization.amountBaseUnits, "authorization.amountBaseUnits", { allowZero: false });
  const recordedTransfer = execution.matchedTransferEvent;
  if (!recordedTransfer || recordedTransfer.section !== "balances" || recordedTransfer.method !== "Transfer" ||
      !Array.isArray(recordedTransfer.data) || recordedTransfer.data.length < 3 ||
      String(recordedTransfer.data[0]) !== signer ||
      String(recordedTransfer.data[1]) !== recipient ||
      String(recordedTransfer.data[2]) !== amountBaseUnits) {
    fail("Evidence matchedTransferEvent must agree with the recorded signer, recipient, and amount.");
  }
  if (execution.dispatchEvent?.section !== "system" || execution.dispatchEvent?.method !== "ExtrinsicSuccess") {
    fail("Evidence must record a System.ExtrinsicSuccess dispatch event.");
  }
  if (feeEvent.section !== "transactionPayment" || feeEvent.method !== "TransactionFeePaid") {
    fail("Evidence fee event must be transactionPayment.TransactionFeePaid.");
  }
  if (execution.transactionBroadcast !== true || execution.extrinsicSubmitted !== true || execution.finalized !== true) {
    fail("Evidence does not assert a broadcast and finalized native extrinsic.");
  }
  if (execution.matchedTransferEventCount !== 1) {
    fail("Evidence must record exactly one matching Balances.Transfer event.");
  }
  return {
    genesisHash,
    runtime: {
      specName: requiredString(runtime.specName, "runtime.specName"),
      specVersion: canonicalInteger(runtime.specVersion, "runtime.specVersion"),
      transactionVersion: canonicalInteger(runtime.transactionVersion, "runtime.transactionVersion")
    },
    transactionHash,
    finalizedBlockHash,
    signer,
    recipient,
    amountBaseUnits,
    fee: {
      section: requiredString(feeEvent.section, "execution.feeEvent.section"),
      method: requiredString(feeEvent.method, "execution.feeEvent.method"),
      payer: requiredString(feeEvent.payer, "execution.feeEvent.payer"),
      actualFeeBaseUnits: canonicalInteger(feeEvent.actualFeeBaseUnits, "execution.feeEvent.actualFeeBaseUnits"),
      tipBaseUnits: canonicalInteger(feeEvent.tipBaseUnits, "execution.feeEvent.tipBaseUnits")
    }
  };
}

function normalizeAddressCodec(value) {
  if (value && value.isId && value.asId) return normalizeSs58Address(value.asId.toString());
  if (value && value.isAddress32 && value.asAddress32) return normalizeSs58Address(value.asAddress32.toString());
  if (value && value.isAccountId32 && value.asAccountId32) return normalizeSs58Address(value.asAccountId32.toString());
  return normalizeSs58Address(value?.toString?.() ?? value);
}

function normalizedEvent(record) {
  const phase = record.phase?.isApplyExtrinsic
    ? Number(record.phase.asApplyExtrinsic.toString())
    : null;
  return {
    phase,
    section: String(record.event.section),
    method: String(record.event.method),
    data: Array.from(record.event.data || [], item => item.toString())
  };
}

function normalMethodName(value) {
  return String(value || "").toLowerCase().replace(/[_-]/g, "");
}

function equalSs58(left, right) {
  try {
    return normalizeSs58Address(String(left)) === normalizeSs58Address(String(right));
  } catch {
    return false;
  }
}

export function compareNativeObservation(evidence, observation, expectedGenesisHash = evidence?.runtime?.genesisHash) {
  const expected = validateNativeTransferEvidence(evidence);
  const mismatches = [];
  const add = (name, condition) => { if (!condition) mismatches.push(name); };
  const expectedGenesis = requiredHash(expectedGenesisHash, "expected genesis hash");

  add("genesisHash", String(observation.genesisHash || "").toLowerCase() === expected.genesisHash &&
    String(observation.genesisHash || "").toLowerCase() === expectedGenesis);
  add("runtime.specName", String(observation.runtime?.specName || "") === expected.runtime.specName);
  add("runtime.specVersion", String(observation.runtime?.specVersion ?? "") === expected.runtime.specVersion);
  add("runtime.transactionVersion", String(observation.runtime?.transactionVersion ?? "") === expected.runtime.transactionVersion);
  add("blockHash", String(observation.blockHash || "").toLowerCase() === expected.finalizedBlockHash);
  add("canonicalFinalizedBlock", observation.finalized === true &&
    String(observation.canonicalHashAtHeight || "").toLowerCase() === expected.finalizedBlockHash);
  add("transactionHash", String(observation.transactionHash || "").toLowerCase() === expected.transactionHash);
  add("extrinsicCount", observation.extrinsicCount === 1);
  add("extrinsicSection", String(observation.extrinsicSection || "").toLowerCase() === "balances");
  add("extrinsicMethod", normalMethodName(observation.extrinsicMethod) === "transferkeepalive");
  add("extrinsicSigner", equalSs58(observation.extrinsicSigner, expected.signer));
  add("extrinsicRecipient", equalSs58(observation.extrinsicRecipient, expected.recipient));
  add("extrinsicAmountBaseUnits", String(observation.extrinsicAmountBaseUnits ?? "") === expected.amountBaseUnits);

  const eventRecords = Array.isArray(observation.events) ? observation.events : [];
  const atExtrinsic = eventRecords.filter(event => event.phase === observation.extrinsicIndex);
  const successes = atExtrinsic.filter(event => event.section === "system" && event.method === "ExtrinsicSuccess");
  const failures = atExtrinsic.filter(event => event.section === "system" && event.method === "ExtrinsicFailed");
  add("extrinsicSuccessEvent", successes.length === 1 && failures.length === 0);

  const transfers = atExtrinsic.filter(event => event.section === "balances" && event.method === "Transfer");
  add("transferEventCount", transfers.length === 1);
  const transfer = transfers[0];
  add("transferEvent", Boolean(transfer && transfer.data.length >= 3 &&
    equalSs58(transfer.data[0], expected.signer) &&
    equalSs58(transfer.data[1], expected.recipient) &&
    String(transfer.data[2]) === expected.amountBaseUnits));

  const feeEvents = atExtrinsic.filter(event =>
    event.section.toLowerCase() === expected.fee.section.toLowerCase() &&
    event.method === expected.fee.method);
  add("feeEventCount", feeEvents.length === 1);
  const fee = feeEvents[0];
  add("feeEvent", Boolean(fee && fee.data.length >= 3 &&
    equalSs58(fee.data[0], expected.fee.payer) &&
    String(fee.data[1]) === expected.fee.actualFeeBaseUnits &&
    String(fee.data[2]) === expected.fee.tipBaseUnits));

  return {
    match: mismatches.length === 0,
    mismatches,
    observed: {
      genesisHash: observation.genesisHash,
      runtime: observation.runtime,
      blockHash: observation.blockHash,
      blockNumber: observation.blockNumber,
      latestFinalizedBlockNumber: observation.latestFinalizedBlockNumber,
      canonicalHashAtHeight: observation.canonicalHashAtHeight,
      transactionHash: observation.transactionHash,
      extrinsicIndex: observation.extrinsicIndex,
      extrinsicSigner: observation.extrinsicSigner,
      extrinsicSection: observation.extrinsicSection,
      extrinsicMethod: observation.extrinsicMethod,
      extrinsicRecipient: observation.extrinsicRecipient,
      extrinsicAmountBaseUnits: observation.extrinsicAmountBaseUnits,
      transferEventCount: transfers.length,
      dispatchSuccessCount: successes.length,
      dispatchFailureCount: failures.length,
      feeEventCount: feeEvents.length,
      feeEvent: fee ? { payer: fee.data[0], actualFeeBaseUnits: fee.data[1], tipBaseUnits: fee.data[2] } : null
    }
  };
}

export function compareNativeProviderObservations(primary, secondary) {
  const fields = [
    "genesisHash", "blockHash", "blockNumber", "canonicalHashAtHeight",
    "transactionHash", "extrinsicIndex", "extrinsicSigner", "extrinsicSection",
    "extrinsicMethod", "extrinsicRecipient", "extrinsicAmountBaseUnits"
  ];
  const mismatches = fields.filter(field => String(primary[field] ?? "").toLowerCase() !== String(secondary[field] ?? "").toLowerCase());
  const runtimeFields = ["specName", "specVersion", "transactionVersion"];
  for (const field of runtimeFields) {
    if (String(primary.runtime?.[field] ?? "") !== String(secondary.runtime?.[field] ?? "")) {
      mismatches.push("runtime." + field);
    }
  }
  const eventFields = ["transferEventCount", "dispatchSuccessCount", "dispatchFailureCount", "feeEventCount", "feeEvent"];
  for (const field of eventFields) {
    if (JSON.stringify(primary[field] ?? null) !== JSON.stringify(secondary[field] ?? null)) {
      mismatches.push(field);
    }
  }
  return { match: mismatches.length === 0, mismatches };
}

function validateRpcUrl(value, label) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    fail(`${label} must be a valid WebSocket RPC URL.`);
  }
  if (url.protocol !== "wss:" && !(url.protocol === "ws:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
    fail(`${label} must use WSS for remote endpoints; WS is allowed only for loopback development.`);
  }
  if (url.username || url.password) fail(`${label} must not embed credentials in the URL.`);
  return url;
}

async function readProviderEvidence(evidence, rpcUrl) {
  const url = validateRpcUrl(rpcUrl, "Substrate RPC URL");
  const wsProvider = new WsProvider(url.toString(), 10000);
  let api;
  try {
    api = await ApiPromise.create({ provider: wsProvider });
    await api.isReady;

    const recordedBlockHash = evidence.finalizedBlockHash;
    const [genesisHash, runtimeVersion, signedBlock, header, eventRecords, finalizedHead] = await Promise.all([
      Promise.resolve(api.genesisHash.toHex().toLowerCase()),
      api.rpc.state.getRuntimeVersion(recordedBlockHash),
      api.rpc.chain.getBlock(recordedBlockHash),
      api.rpc.chain.getHeader(recordedBlockHash),
      api.query.system.events.at(recordedBlockHash),
      api.rpc.chain.getFinalizedHead()
    ]);
    if (!signedBlock?.block?.extrinsics || !header) {
      fail("Provider did not return the recorded block and header; result is unavailable, not failed.");
    }
    const finalizedHeader = await api.rpc.chain.getHeader(finalizedHead);
    const blockNumber = BigInt(header.number.toString());
    const latestFinalizedBlockNumber = BigInt(finalizedHeader.number.toString());
    const canonicalBlockHash = await api.rpc.chain.getBlockHash(blockNumber.toString());
    const canonicalHashAtHeight = canonicalBlockHash.toHex().toLowerCase();
    const blockHash = recordedBlockHash.toLowerCase();

    const extrinsics = Array.from(signedBlock.block.extrinsics);
    const matchingIndexes = [];
    for (let index = 0; index < extrinsics.length; index += 1) {
      if (extrinsics[index].hash.toHex().toLowerCase() === evidence.transactionHash) matchingIndexes.push(index);
    }
    const extrinsicIndex = matchingIndexes.length === 1 ? matchingIndexes[0] : -1;
    const target = extrinsicIndex >= 0 ? extrinsics[extrinsicIndex] : null;
    let extrinsicSigner = "";
    let extrinsicSection = "";
    let extrinsicMethod = "";
    let extrinsicRecipient = "";
    let extrinsicAmountBaseUnits = "";
    if (target) {
      const args = Array.from(target.method.args || []);
      extrinsicSigner = normalizeSs58Address(target.signer.toString());
      extrinsicSection = String(target.method.section);
      extrinsicMethod = String(target.method.method);
      if (args.length >= 2) {
        extrinsicRecipient = normalizeAddressCodec(args[0]);
        extrinsicAmountBaseUnits = BigInt(args[1].toString()).toString();
      }
    }

    const events = Array.from(eventRecords, normalizedEvent);
    return {
      providerOrigin: url.origin,
      genesisHash,
      runtime: {
        specName: runtimeVersion.specName.toString(),
        specVersion: runtimeVersion.specVersion.toString(),
        transactionVersion: runtimeVersion.transactionVersion.toString()
      },
      blockHash,
      blockNumber: blockNumber.toString(),
      latestFinalizedBlockNumber: latestFinalizedBlockNumber.toString(),
      finalized: blockNumber <= latestFinalizedBlockNumber,
      canonicalHashAtHeight,
      transactionHash: target ? target.hash.toHex().toLowerCase() : "",
      extrinsicCount: matchingIndexes.length,
      extrinsicIndex,
      extrinsicSection,
      extrinsicMethod,
      extrinsicSigner,
      extrinsicRecipient,
      extrinsicAmountBaseUnits,
      events
    };
  } finally {
    if (api) {
      await api.disconnect();
    } else {
      try { await wsProvider.disconnect(); } catch { /* best effort */ }
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const evidencePath = args.find(arg => !arg.startsWith("--")) || DEFAULT_EVIDENCE;
  const unknown = args.filter(arg => arg.startsWith("--"));
  if (unknown.length) fail("Unknown argument(s): " + unknown.join(", "));

  const resolvedPath = path.resolve(evidencePath);
  const input = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  const evidence = validateNativeTransferEvidence(input);
  await cryptoWaitReady();

  const expectedGenesisHash = String(process.env.PORTALDOT_SUBSTRATE_GENESIS_HASH || evidence.genesisHash).trim().toLowerCase();
  if (!HASH_RE.test(expectedGenesisHash)) fail("PORTALDOT_SUBSTRATE_GENESIS_HASH must be a 32-byte hexadecimal hash.");

  const primaryUrl = String(process.env.PORTALDOT_SUBSTRATE_RPC_URL || input.rpcUrl || "").trim();
  const secondaryUrl = String(process.env.PORTALDOT_SUBSTRATE_RPC_URL_SECONDARY || "").trim();
  if (!primaryUrl) fail("Set PORTALDOT_SUBSTRATE_RPC_URL or include rpcUrl in the evidence file.");
  const primaryParsed = validateRpcUrl(primaryUrl, "PORTALDOT_SUBSTRATE_RPC_URL");
  const urls = [primaryParsed.toString()];
  if (secondaryUrl) {
    const secondaryParsed = validateRpcUrl(secondaryUrl, "PORTALDOT_SUBSTRATE_RPC_URL_SECONDARY");
    if (secondaryParsed.origin === primaryParsed.origin) {
      fail("Primary and secondary Substrate RPC URLs must have different origins.");
    }
    urls.push(secondaryParsed.toString());
  }

  const providerResults = await Promise.all(urls.map(async rpcUrl => {
    const origin = new URL(rpcUrl).origin;
    try {
      const observation = await readProviderEvidence(evidence, rpcUrl);
      const comparison = compareNativeObservation(input, observation, expectedGenesisHash);
      return { origin, ok: true, observation, comparison };
    } catch (error) {
      return { origin, ok: false, error: String(error?.message || error) };
    }
  }));

  const unavailable = providerResults.some(result => !result.ok);
  const conflicts = providerResults.some(result => result.ok && !result.comparison.match);
  let providerComparison = null;
  if (providerResults.length === 2 && providerResults.every(result => result.ok)) {
    providerComparison = compareNativeProviderObservations(
      providerResults[0].comparison.observed,
      providerResults[1].comparison.observed
    );
  }

  let status;
  if (unavailable) status = "UNAVAILABLE";
  else if (conflicts || (providerComparison && !providerComparison.match)) status = "CONFLICT";
  else status = providerResults.length === 2
    ? "MATCHING_EVIDENCE_FROM_TWO_RPC_ENDPOINTS"
    : "VERIFIED_BY_ONE_RPC_ENDPOINT";

  const report = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    status,
    mode: "read-only",
    evidenceFile: path.relative(process.cwd(), resolvedPath),
    expected: {
      network: input.network,
      genesisHash: expectedGenesisHash,
      transactionHash: evidence.transactionHash,
      finalizedBlockHash: evidence.finalizedBlockHash,
      signer: evidence.signer,
      recipient: evidence.recipient,
      amountBaseUnits: evidence.amountBaseUnits
    },
    providers: providerResults.map(result => result.ok
      ? {
          origin: result.origin,
          genesisHash: result.observation.genesisHash,
          runtime: result.observation.runtime,
          observedBlockNumber: result.observation.blockNumber,
          latestFinalizedBlockNumber: result.observation.latestFinalizedBlockNumber,
          transactionHash: result.observation.transactionHash,
          comparison: result.comparison
        }
      : { origin: result.origin, status: "UNAVAILABLE", error: result.error }),
    providerComparison: providerComparison || null,
    trustBoundary: [
      "This script reads chain data only; it never signs or broadcasts an extrinsic.",
      "A matching result confirms the recorded native extrinsic/events against the configured RPC response, not the RPC operator's honesty.",
      "Two URL origins do not prove independent operators or infrastructure; verify provider ownership separately.",
      "The saved evidence does not contain the Verigate Ed25519 signed artifacts, so this verifier does not cryptographically re-verify the off-chain policy decision."
    ]
  };
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (status === "CONFLICT") process.exitCode = 1;
  else if (status === "UNAVAILABLE") process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error("Native Substrate evidence verification unavailable: " + String(error?.message || error));
    process.exitCode = 2;
  });
}
