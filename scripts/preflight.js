require("dotenv").config();

function requiredNetworkConfig() {
  const rpcUrl = (process.env.PORTALDOT_RPC_URL || "").trim();
  const chainIdText = (process.env.PORTALDOT_CHAIN_ID || "").trim();

  if (!rpcUrl) throw new Error("PORTALDOT_RPC_URL is required. Set only an independently confirmed PortalDot EVM RPC endpoint.");
  if (!chainIdText || !/^[1-9][0-9]*$/.test(chainIdText)) {
    throw new Error("PORTALDOT_CHAIN_ID must be explicitly set to the confirmed positive decimal chain ID.");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rpcUrl);
  } catch {
    throw new Error("PORTALDOT_RPC_URL must be a valid absolute URL.");
  }
  if (parsedUrl.username || parsedUrl.password) {
    throw new Error("PORTALDOT_RPC_URL must not embed credentials.");
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("PORTALDOT_RPC_URL must use HTTP or HTTPS.");
  }
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (parsedUrl.protocol === "http:" && !loopbackHosts.has(parsedUrl.hostname.toLowerCase())) {
    throw new Error("Remote RPC endpoints must use HTTPS. Plain HTTP is allowed only for local loopback development.");
  }

  return { rpcUrl, expectedChainId: BigInt(chainIdText) };
}

function safeRpcOrigin(rpcUrl) {
  return new URL(rpcUrl).origin;
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
  if (data.jsonrpc !== "2.0") {
    throw new Error(`${method}: invalid JSON-RPC version`);
  }
  if (data.id !== 1) {
    throw new Error(`${method}: JSON-RPC response ID mismatch`);
  }
  if (data.error !== undefined && data.error !== null) {
    const message = data.error && typeof data.error.message === "string"
      ? data.error.message
      : JSON.stringify(data.error);
    throw new Error(`${method}: JSON-RPC error: ${message}`);
  }
  if (typeof data.result !== "string" || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(data.result)) {
    throw new Error(`${method}: result must be a canonical hexadecimal quantity`);
  }

  return data.result;
}

async function main() {
  const { rpcUrl, expectedChainId } = requiredNetworkConfig();
  console.log(`Configured PortalDot EVM RPC origin: ${safeRpcOrigin(rpcUrl)}`);
  console.log(`Expected chain ID: ${expectedChainId}`);

  const [chainHex, blockHex] = await Promise.all([
    rpc(rpcUrl, "eth_chainId"),
    rpc(rpcUrl, "eth_blockNumber")
  ]);
  const actualChainId = BigInt(chainHex);
  const blockNumber = BigInt(blockHex);

  console.log(`Actual chain ID: ${actualChainId}`);
  console.log(`Latest block: ${blockNumber}`);
  if (actualChainId !== expectedChainId) {
    throw new Error(`Wrong chain ID; expected ${expectedChainId}, received ${actualChainId}. Refusing deployment.`);
  }

  console.log("RPC preflight passed. This checks connectivity only; it does not prove that a wallet is funded or a deployment will succeed.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`RPC preflight failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { requiredNetworkConfig, safeRpcOrigin, rpc };
