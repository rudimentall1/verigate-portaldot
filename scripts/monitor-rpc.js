require("dotenv").config();

function requiredConfig(env = process.env) {
  const rpcUrl = (env.PORTALDOT_RPC_URL || "").trim();
  const chainIdText = (env.PORTALDOT_CHAIN_ID || "").trim();
  if (!rpcUrl) throw new Error("PORTALDOT_RPC_URL is required.");
  if (!/^[1-9][0-9]*$/.test(chainIdText)) {
    throw new Error("PORTALDOT_CHAIN_ID must be a positive decimal integer.");
  }

  let parsed;
  try {
    parsed = new URL(rpcUrl);
  } catch {
    throw new Error("PORTALDOT_RPC_URL must be an absolute URL.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("PORTALDOT_RPC_URL must not embed credentials.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("RPC URL must use HTTP or HTTPS.");
  }
  const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (parsed.protocol === "http:" && !loopback.has(parsed.hostname.toLowerCase())) {
    throw new Error("Remote RPC endpoints must use HTTPS.");
  }
  return { rpcUrl, expectedChainId: BigInt(chainIdText) };
}

function evaluateSnapshot({ expectedChainId, actualChainId, blockNumber, latencyMs }) {
  const expected = BigInt(expectedChainId);
  const actual = BigInt(actualChainId);
  const block = BigInt(blockNumber);
  if (block < 0n) throw new Error("Block number cannot be negative.");
  if (!Number.isFinite(latencyMs) || latencyMs < 0) throw new Error("Latency must be a non-negative finite number.");
  return {
    status: actual === expected ? "ok" : "chain_id_mismatch",
    expectedChainId: expected.toString(),
    actualChainId: actual.toString(),
    blockNumber: block.toString(),
    latencyMs: Math.round(latencyMs)
  };
}

async function rpc(rpcUrl, method) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    redirect: "error",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
  const data = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${method}: invalid JSON-RPC response object`);
  }
  if (data.error !== undefined && data.error !== null) {
    const message = data.error && typeof data.error.message === "string"
      ? data.error.message
      : JSON.stringify(data.error);
    throw new Error(`${method}: JSON-RPC error: ${message}`);
  }
  if (data.jsonrpc !== "2.0" || data.id !== 1) {
    throw new Error(`${method}: malformed JSON-RPC envelope`);
  }
  if (typeof data.result !== "string" || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(data.result)) {
    throw new Error(`${method}: result must be a canonical hexadecimal quantity`);
  }
  return data.result;
}

async function main() {
  const config = requiredConfig();
  const started = Date.now();
  const [chainHex, blockHex] = await Promise.all([
    rpc(config.rpcUrl, "eth_chainId"),
    rpc(config.rpcUrl, "eth_blockNumber")
  ]);
  const snapshot = evaluateSnapshot({
    expectedChainId: config.expectedChainId,
    actualChainId: BigInt(chainHex),
    blockNumber: BigInt(blockHex),
    latencyMs: Date.now() - started
  });
  const output = {
    network: "PortalDot V3 EVM",
    checkedAt: new Date().toISOString(),
    rpcOrigin: new URL(config.rpcUrl).origin,
    ...snapshot
  };
  console.log(JSON.stringify(output, null, 2));
  if (snapshot.status !== "ok") process.exitCode = 2;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`RPC monitor failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { requiredConfig, evaluateSnapshot, rpc };
