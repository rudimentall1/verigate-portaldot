require("dotenv").config();
const { parseExpectedSubstrateGenesisHash, validateSubstrateRpcUrl, verifySubstrateGenesisHash } = require("./substrate-genesis.js");

const PORTALDOT_V3_TESTNET_CHAIN_ID = 420420777n;

function assertPortalDotTestnetChainId(chainId, operation = "operation") {
  let actual;
  try {
    actual = BigInt(chainId);
  } catch {
    throw new Error(`Refusing ${operation}: chain ID must be the confirmed PortalDot V3 testnet chain ID 420420777.`);
  }
  if (actual !== PORTALDOT_V3_TESTNET_CHAIN_ID) {
    throw new Error(
      `Refusing ${operation}: this project's deployment and broadcast tooling is restricted to PortalDot V3 testnet chain ID 420420777. ` +
      `The Mainnet V3 EVM RPC and chain identity have not been verified; no transaction was sent.`
    );
  }
  return actual;
}

function assertPortalDotTestnetRpcUrl(value, operation = "operation") {
  let parsed;
  try {
    parsed = new URL(String(value || "").trim());
  } catch {
    throw new Error(`Refusing ${operation}: use the confirmed PortalDot V3 testnet EVM RPC endpoint or an isolated loopback simulator.`);
  }

  const hasNoUrlCredentialsOrOverrides =
    !parsed.username && !parsed.password && !parsed.search && !parsed.hash &&
    (parsed.pathname === "" || parsed.pathname === "/");
  const isOfficialTestnetRpc =
    parsed.protocol === "https:" &&
    parsed.hostname.toLowerCase() === "test-evm-rpc-v3.portaldot.dev" &&
    parsed.port === "" &&
    hasNoUrlCredentialsOrOverrides;
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  const isLoopbackSimulator =
    parsed.protocol === "http:" &&
    loopbackHosts.has(parsed.hostname.toLowerCase()) &&
    hasNoUrlCredentialsOrOverrides;

  if (!isOfficialTestnetRpc && !isLoopbackSimulator) {
    throw new Error(
      `Refusing ${operation}: remote write paths are restricted to https://test-evm-rpc-v3.portaldot.dev; HTTP is allowed only for a loopback simulator. ` +
      `A Mainnet V3 EVM RPC has not been verified; no transaction was sent.`
    );
  }
  return parsed.origin;
}

function requiredNetworkConfig() {
  const rpcUrl = (process.env.PORTALDOT_RPC_URL || "").trim();
  const chainIdText = (process.env.PORTALDOT_CHAIN_ID || "").trim();
  if (!rpcUrl) throw new Error("PORTALDOT_RPC_URL is required. Set only an independently confirmed PortalDot EVM RPC endpoint.");
  if (!chainIdText || !/^[1-9][0-9]*$/.test(chainIdText)) {
    throw new Error("PORTALDOT_CHAIN_ID must be explicitly set to the confirmed positive decimal chain ID.");
  }

  const substrateRpcUrl = validateSubstrateRpcUrl(process.env.PORTALDOT_SUBSTRATE_RPC_URL);
  const expectedSubstrateGenesisHash = parseExpectedSubstrateGenesisHash(process.env.PORTALDOT_SUBSTRATE_GENESIS_HASH);

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

  return { rpcUrl, expectedChainId: BigInt(chainIdText), substrateRpcUrl, expectedSubstrateGenesisHash };
}

function safeRpcOrigin(rpcUrl) {
  return new URL(rpcUrl).origin;
}

async function rpcResult(rpcUrl, method, params = []) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    redirect: "error",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
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
  return data.result;
}

async function rpc(rpcUrl, method) {
  const result = await rpcResult(rpcUrl, method, []);
  if (typeof result !== "string" || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(result)) {
    throw new Error(`${method}: result must be a canonical hexadecimal quantity`);
  }
  return result;
}

async function main() {
  const { rpcUrl, expectedChainId, substrateRpcUrl, expectedSubstrateGenesisHash } = requiredNetworkConfig();
  console.log(`Configured PortalDot EVM RPC origin: ${safeRpcOrigin(rpcUrl)}`);
  console.log(`Expected chain ID: ${expectedChainId}`);
  console.log(`Substrate RPC origin: ${new URL(substrateRpcUrl).origin}`);
  console.log(`Expected Substrate genesis hash: ${expectedSubstrateGenesisHash}`);

  const [chainHex, blockHex] = await Promise.all([
    rpc(rpcUrl, "eth_chainId"),
    rpc(rpcUrl, "eth_blockNumber")
  ]);
  const actualChainId = BigInt(chainHex);
  const blockNumber = BigInt(blockHex);

  console.log(`Actual chain ID: ${actualChainId}`);
  console.log(`Latest block: ${blockNumber}`);
  const actualSubstrateGenesisHash = await verifySubstrateGenesisHash(substrateRpcUrl, expectedSubstrateGenesisHash);
  console.log(`Substrate genesis hash matches configured pin: ${actualSubstrateGenesisHash}`);
  if (actualChainId !== expectedChainId) {
    throw new Error(`Wrong chain ID; expected ${expectedChainId}, received ${actualChainId}. Refusing deployment.`);
  }

  console.log("RPC preflight passed: EVM chain ID and Substrate genesis pin matched. This does not cryptographically authenticate the RPC operator or prove wallet funding or deployment success.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`RPC preflight failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { requiredNetworkConfig, safeRpcOrigin, rpcResult, rpc, assertPortalDotTestnetChainId, assertPortalDotTestnetRpcUrl };
