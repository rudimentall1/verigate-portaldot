#!/usr/bin/env node
/**
 * Read-only PortalDot V3 network readiness report.
 * Checks the announced testnet EVM/Substrate endpoints and public service URLs.
 * It never signs, submits, or broadcasts a transaction.
 */
import { pathToFileURL } from "node:url";

export const NETWORK = Object.freeze({
  name: "PortalDot V3 testnet",
  evmRpc: "https://test-evm-rpc-v3.portaldot.dev",
  chainId: 420420777n,
  substrateRpc: "wss://test-node-v3.portaldot.dev",
  substrateGenesisHash: "0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd",
});

export const PUBLIC_SURFACES = Object.freeze([
  { name: "Mainnet V3 explorer", url: "https://scanner-live-v3.portaldot.dev/" },
  { name: "Testnet V3 explorer", url: "https://scanner-testnet-v3.portaldot.dev/" },
  { name: "PortalDot Node Console", url: "https://node-console.portaldot.dev/" },
  { name: "PortalDot bridge", url: "https://bridge.portaldot.dev/" },
]);

export const MAINNET_EVM_IDENTITY = Object.freeze({
  status: "not_configured",
  rpcUrl: null,
  chainId: null,
  reason: "The supplied Mainnet V3 announcement did not provide an EVM RPC URL or EVM chain ID; these are not inferred from the explorer hostname.",
});

const REQUEST_TIMEOUT_MS = 8000;
const HASH_RE = /^0x[a-fA-F0-9]{64}$/;
const QUANTITY_RE = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/;

function elapsedSince(startedAt) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

export function parseQuantity(value, label) {
  if (typeof value !== "string" || !QUANTITY_RE.test(value)) {
    throw new Error(label + " must be a canonical hexadecimal quantity");
  }
  return BigInt(value);
}

export function classifySurfaceHttp(status) {
  if (!Number.isInteger(status) || status < 100 || status > 599) return "fail";
  if (status >= 200 && status < 400) return "ok";
  if (status >= 400 && status < 500) return "warning";
  return "fail";
}

export function evaluateEvmSnapshot({ expectedChainId, chainId, blockNumber, latestBlock }) {
  const expected = BigInt(expectedChainId);
  const actual = BigInt(chainId);
  const latest = BigInt(blockNumber);
  if (latest < 0n) throw new Error("EVM block number cannot be negative");
  if (!latestBlock || typeof latestBlock !== "object") throw new Error("eth_getBlockByNumber returned no block object");
  if (typeof latestBlock.hash !== "string" || !HASH_RE.test(latestBlock.hash)) {
    throw new Error("Latest EVM block hash is invalid");
  }
  const blockObjectNumber = parseQuantity(latestBlock.number, "Latest EVM block number");
  const timestamp = parseQuantity(latestBlock.timestamp, "Latest EVM block timestamp");
  if (blockObjectNumber !== latest) throw new Error("eth_blockNumber and latest-block response disagree");
  const sameChain = actual === expected;
  return {
    status: sameChain ? "ok" : "fail",
    expectedChainId: expected.toString(),
    actualChainId: actual.toString(),
    chainIdMatches: sameChain,
    latestBlockNumber: latest.toString(),
    latestBlockHash: latestBlock.hash.toLowerCase(),
    latestBlockTimestamp: new Date(Number(timestamp) * 1000).toISOString(),
  };
}

export function evaluateSubstrateSnapshot({
  expectedGenesisHash, genesisHash, finalizedHead, finalizedHeader,
  chainName, nodeVersion, runtimeVersion, health,
}) {
  const actualGenesis = String(genesisHash || "").toLowerCase();
  const expectedGenesis = String(expectedGenesisHash || "").toLowerCase();
  if (!HASH_RE.test(actualGenesis)) throw new Error("Substrate RPC returned an invalid genesis hash");
  const genesisMatches = actualGenesis === expectedGenesis;
  if (typeof finalizedHead !== "string" || !HASH_RE.test(finalizedHead)) {
    throw new Error("Substrate finalized head hash is invalid");
  }
  if (!finalizedHeader || typeof finalizedHeader !== "object") {
    throw new Error("Substrate finalized block header is unavailable");
  }
  const finalizedNumber = parseQuantity(finalizedHeader.number, "Substrate finalized block number");
  if (typeof chainName !== "string" || !chainName.trim()) throw new Error("Substrate system_chain result is empty");
  if (typeof nodeVersion !== "string" || !nodeVersion.trim()) throw new Error("Substrate system_version result is empty");
  if (!runtimeVersion || runtimeVersion.specName === undefined || runtimeVersion.specVersion === undefined) {
    throw new Error("Substrate runtime version response is incomplete");
  }
  const specVersion = Number(runtimeVersion.specVersion);
  const transactionVersion = Number(runtimeVersion.transactionVersion);
  if (!Number.isSafeInteger(specVersion) || specVersion < 0) throw new Error("Substrate specVersion is invalid");
  if (!Number.isSafeInteger(transactionVersion) || transactionVersion < 0) {
    throw new Error("Substrate transactionVersion is invalid");
  }
  const peers = health && Number.isSafeInteger(Number(health.peers)) ? Number(health.peers) : null;
  const isSyncing = health && typeof health.isSyncing === "boolean" ? health.isSyncing : null;
  let status = genesisMatches ? "ok" : "fail";
  const warnings = [];
  if (peers === null) warnings.push("system_health peer count unavailable");
  else if (peers === 0) warnings.push("node reports zero peers");
  if (isSyncing === true) warnings.push("node reports that it is syncing");
  if (warnings.length && status === "ok") status = "warning";
  return {
    status,
    expectedGenesisHash: expectedGenesis,
    actualGenesisHash: actualGenesis,
    genesisHashMatches: genesisMatches,
    finalizedHeadHash: finalizedHead.toLowerCase(),
    finalizedBlockNumber: finalizedNumber.toString(),
    chainName,
    nodeVersion,
    runtime: { specName: String(runtimeVersion.specName), specVersion, transactionVersion },
    health: { peers, isSyncing },
    warnings,
  };
}

export function aggregateStatus(checks) {
  const statuses = checks.filter(Boolean).map((check) => check.status);
  if (statuses.includes("fail")) return "FAIL";
  if (statuses.includes("warning")) return "DEGRADED";
  return "PASS";
}

async function fetchJsonRpc(url, method, params = []) {
  const response = await fetch(url, {
    method: "POST",
    redirect: "error",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(method + ": HTTP " + response.status);
  const payload = await response.json();
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      payload.jsonrpc !== "2.0" || payload.id !== 1) {
    throw new Error(method + ": malformed JSON-RPC response envelope");
  }
  if (payload.error !== undefined && payload.error !== null) {
    throw new Error(method + ": " + (payload.error?.message || JSON.stringify(payload.error)));
  }
  return payload.result;
}

async function checkEvm() {
  const startedAt = performance.now();
  try {
    const [chainHex, blockHex, latestBlock] = await Promise.all([
      fetchJsonRpc(NETWORK.evmRpc, "eth_chainId"),
      fetchJsonRpc(NETWORK.evmRpc, "eth_blockNumber"),
      fetchJsonRpc(NETWORK.evmRpc, "eth_getBlockByNumber", ["latest", false]),
    ]);
    const evaluated = evaluateEvmSnapshot({
      expectedChainId: NETWORK.chainId,
      chainId: parseQuantity(chainHex, "eth_chainId"),
      blockNumber: parseQuantity(blockHex, "eth_blockNumber"),
      latestBlock,
    });
    return { name: "testnet EVM RPC", url: NETWORK.evmRpc, latencyMs: elapsedSince(startedAt), ...evaluated };
  } catch (error) {
    return {
      name: "testnet EVM RPC", url: NETWORK.evmRpc, status: "fail",
      latencyMs: elapsedSince(startedAt), error: error.message,
    };
  }
}

function substrateBatch(url, requests, WebSocketImpl = globalThis.WebSocket) {
  if (typeof WebSocketImpl !== "function") {
    return Promise.reject(new Error("This Node.js runtime does not expose a WebSocket client"));
  }
  return new Promise((resolve, reject) => {
    let ws;
    let settled = false;
    const pending = new Map(requests.map((request) => [request.id, request.method]));
    const results = {};
    const timer = setTimeout(() => finish(new Error("Substrate WebSocket request timed out")), REQUEST_TIMEOUT_MS);
    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws?.close(); } catch { /* best effort close */ }
      if (error) reject(error);
      else resolve(value);
    }
    try {
      ws = new WebSocketImpl(url);
    } catch (error) {
      finish(new Error("Unable to open Substrate WebSocket: " + error.message));
      return;
    }
    ws.addEventListener("open", () => {
      try {
        for (const request of requests) {
          ws.send(JSON.stringify({
            jsonrpc: "2.0",
            id: request.id,
            method: request.method,
            params: request.params || [],
          }));
        }
      } catch (error) {
        finish(new Error("Unable to send Substrate RPC requests: " + error.message));
      }
    }, { once: true });
    ws.addEventListener("message", (event) => {
      let payload;
      try {
        payload = JSON.parse(typeof event.data === "string" ? event.data : String(event.data));
      } catch {
        finish(new Error("Substrate RPC returned invalid JSON"));
        return;
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
          payload.jsonrpc !== "2.0" || !pending.has(payload.id)) {
        finish(new Error("Substrate RPC returned an unexpected JSON-RPC envelope"));
        return;
      }
      const method = pending.get(payload.id);
      if (payload.error !== undefined && payload.error !== null) {
        results[method] = { ok: false, error: payload.error?.message || JSON.stringify(payload.error) };
      } else {
        results[method] = { ok: true, value: payload.result };
      }
      pending.delete(payload.id);
      if (pending.size === 0) finish(null, results);
    });
    ws.addEventListener("error", () => finish(new Error("Substrate WebSocket connection failed")), { once: true });
    ws.addEventListener("close", () => {
      if (!settled) finish(new Error("Substrate WebSocket closed before all responses arrived"));
    }, { once: true });
  });
}

function requiredSubstrateResult(results, method) {
  const item = results[method];
  if (!item?.ok) throw new Error(method + ": " + (item?.error || "no result"));
  return item.value;
}

async function checkSubstrate() {
  const startedAt = performance.now();
  try {
    const first = await substrateBatch(NETWORK.substrateRpc, [
      { id: 1, method: "chain_getBlockHash", params: [0] },
      { id: 2, method: "chain_getFinalizedHead" },
      { id: 3, method: "system_chain" },
      { id: 4, method: "system_version" },
      { id: 5, method: "state_getRuntimeVersion" },
      { id: 6, method: "system_health" },
    ]);
    const genesisHash = requiredSubstrateResult(first, "chain_getBlockHash");
    const finalizedHead = requiredSubstrateResult(first, "chain_getFinalizedHead");
    const chainName = requiredSubstrateResult(first, "system_chain");
    const nodeVersion = requiredSubstrateResult(first, "system_version");
    const runtimeVersion = requiredSubstrateResult(first, "state_getRuntimeVersion");
    const health = requiredSubstrateResult(first, "system_health");
    const headers = await substrateBatch(NETWORK.substrateRpc, [
      { id: 7, method: "chain_getHeader", params: [finalizedHead] },
    ]);
    const finalizedHeader = requiredSubstrateResult(headers, "chain_getHeader");
    const evaluated = evaluateSubstrateSnapshot({
      expectedGenesisHash: NETWORK.substrateGenesisHash,
      genesisHash,
      finalizedHead,
      finalizedHeader,
      chainName,
      nodeVersion,
      runtimeVersion,
      health,
    });
    return {
      name: "testnet Substrate RPC", url: NETWORK.substrateRpc,
      latencyMs: elapsedSince(startedAt), ...evaluated,
    };
  } catch (error) {
    return {
      name: "testnet Substrate RPC", url: NETWORK.substrateRpc, status: "fail",
      latencyMs: elapsedSince(startedAt), error: error.message,
    };
  }
}

async function checkPublicSurface(surface) {
  const startedAt = performance.now();
  try {
    const response = await fetch(surface.url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { "user-agent": "Verigate-PortalDot-readiness-check/1.0" },
    });
    const initialStatus = classifySurfaceHttp(response.status);
    const finalUrl = response.url;
    const finalHostChanged =
      new URL(finalUrl).hostname.toLowerCase() !== new URL(surface.url).hostname.toLowerCase();
    const contentType = response.headers.get("content-type");
    try { await response.body?.cancel(); } catch { /* response body is intentionally not consumed */ }
    let status = initialStatus;
    const notes = [];
    if (finalHostChanged) notes.push("request redirected to a different hostname");
    if (initialStatus !== "ok") notes.push("HTTP " + response.status);
    if (finalHostChanged && status === "ok") status = "warning";
    return {
      name: surface.name, url: surface.url, status,
      httpStatus: response.status, finalUrl, contentType,
      latencyMs: elapsedSince(startedAt), notes,
    };
  } catch (error) {
    return {
      name: surface.name, url: surface.url, status: "fail",
      latencyMs: elapsedSince(startedAt),
      error: error.name === "TimeoutError" ? "request timed out" : error.message,
    };
  }
}

async function createReadinessReport() {
  const checkedAt = new Date().toISOString();
  const [evm, substrate, ...surfaces] = await Promise.all([
    checkEvm(),
    checkSubstrate(),
    ...PUBLIC_SURFACES.map(checkPublicSurface),
  ]);
  return {
    schemaVersion: 1,
    tool: "portaldot-network-readiness",
    checkedAt,
    overallStatus: aggregateStatus([evm, substrate, ...surfaces]),
    checks: { evm, substrate, publicSurfaces: surfaces, mainnetEvm: MAINNET_EVM_IDENTITY },
    knownLimitations: [
      "The EVM and Substrate checks use the announced testnet endpoints only.",
      "No Mainnet V3 EVM RPC or EVM chain ID was supplied in the announcement used by this project; mainnet EVM identity is NOT_CONFIGURED, not inferred from the explorer URL.",
      "HTTP success confirms only that a public URL responded; it does not validate explorer data correctness or backend dependencies.",
      "One RPC endpoint per protocol is checked. This is not independent network authentication and does not compare multiple providers.",
      "The probe is read-only and does not sign, submit, or broadcast transactions.",
    ],
  };
}

export function exitCodeForReport(report) {
  if (report.overallStatus === "FAIL") return 2;
  if (report.overallStatus === "DEGRADED") return 1;
  return 0;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: npm run portal:readiness\n\nRead-only check of PortalDot V3 testnet EVM/Substrate RPCs and the announced public web surfaces.\nExit 0=PASS, 1=DEGRADED, 2=FAIL. Mainnet EVM RPC is intentionally not inferred or queried.");
    return;
  }
  const unknownArgs = args.filter((arg) => arg !== "--json");
  if (unknownArgs.length) throw new Error("Unknown argument(s): " + unknownArgs.join(", "));
  const report = await createReadinessReport();
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = exitCodeForReport(report);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("PortalDot readiness check failed: " + error.message);
    process.exitCode = 2;
  });
}
