import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const expectedChainId = 420420777n;
const methodsSeen = [];
const forbiddenMethods = new Set([
  "eth_sendTransaction",
  "eth_sendRawTransaction",
  "eth_signTransaction",
  "personal_sendTransaction",
  "eth_sendUserOperation"
]);

const block = {
  number: "0x1",
  hash: `0x${"11".repeat(32)}`,
  parentHash: `0x${"22".repeat(32)}`,
  nonce: "0x0000000000000000",
  sha3Uncles: `0x${"33".repeat(32)}`,
  logsBloom: `0x${"00".repeat(256)}`,
  transactionsRoot: `0x${"44".repeat(32)}`,
  stateRoot: `0x${"55".repeat(32)}`,
  receiptsRoot: `0x${"66".repeat(32)}`,
  miner: `0x${"00".repeat(20)}`,
  difficulty: "0x0",
  totalDifficulty: "0x0",
  extraData: "0x",
  size: "0x0",
  gasLimit: "0x1c9c380",
  gasUsed: "0x0",
  timestamp: "0x1",
  transactions: [],
  uncles: [],
  baseFeePerGas: "0x1",
  mixHash: `0x${"77".repeat(32)}`
};

function respond(request) {
  methodsSeen.push(request.method);
  if (forbiddenMethods.has(request.method)) {
    return { jsonrpc: "2.0", id: request.id ?? null, error: { code: -32601, message: "Read-only smoke RPC: transaction methods are forbidden" } };
  }
  let result;
  switch (request.method) {
    case "eth_chainId": result = `0x${expectedChainId.toString(16)}`; break;
    case "net_version": result = expectedChainId.toString(); break;
    case "eth_blockNumber": result = "0x1"; break;
    case "eth_getBlockByNumber":
    case "eth_getBlockByHash": result = block; break;
    case "web3_clientVersion": result = "PortalDotReadOnlySmoke/1.0"; break;
    case "eth_syncing": result = false; break;
    default:
      return { jsonrpc: "2.0", id: request.id ?? null, error: { code: -32601, message: `Unsupported read-only method: ${request.method}` } };
  }
  return { jsonrpc: "2.0", id: request.id ?? null, result };
}

const server = createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405, { "content-type": "application/json" }).end(JSON.stringify({ error: "POST only" }));
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  try {
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const result = Array.isArray(payload) ? payload.map(respond) : respond(payload);
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(result));
  } catch {
    res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "Invalid JSON-RPC request" }));
  }
});

await new Promise((resolveListen, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolveListen);
});

try {
  const address = server.address();
  assert(address && typeof address === "object", "Mock RPC did not bind to an ephemeral port.");
  const hardhatBin = resolve("node_modules/.bin/hardhat");
  assert(existsSync(hardhatBin), `Hardhat executable not found: ${hardhatBin}`);

  const env = { ...process.env };
  env.PORTALDOT_RPC_URL = `http://127.0.0.1:${address.port}`;
  env.PORTALDOT_CHAIN_ID = expectedChainId.toString();
  delete env.DEPLOYER_PRIVATE_KEY;
  delete env.AUTHORITY_SIGNER_ADDRESS;

  const child = spawn(
    process.execPath,
    [hardhatBin, "--config", "./hardhat.config.js", "run", "scripts/deploy.js", "--network", "portaldot"],
    { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] }
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  const result = await new Promise((resolveResult, rejectResult) => {
    const timeout = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      rejectResult(error);
    });
    child.once("close", (status, signal) => {
      clearTimeout(timeout);
      resolveResult({ status, signal });
    });
  });
  const output = `${stdout}\\n${stderr}`;
  assert.equal(result.signal, null, `Deployment child was terminated by ${result.signal}.`);
  assert.notEqual(result.status, 0, "Deployment must stop when DEPLOYER_PRIVATE_KEY is absent.");
  assert(output.includes("DEPLOYER_PRIVATE_KEY is missing"), `Expected missing-key guard after chain validation. Output:\\n${output}`);
  assert(methodsSeen.includes("eth_chainId"), `Expected mock RPC chain validation. Methods: ${methodsSeen.join(", ")}`);
  assert(!methodsSeen.some((method) => forbiddenMethods.has(method)), `Forbidden transaction RPC observed: ${methodsSeen.join(", ")}`);

  console.log("PASS: Hardhat queried the configured local mock RPC.");
  console.log("PASS: deployment stopped at the missing-key guard after chain validation.");
  console.log("PASS: no transaction or signing RPC method was called.");
} finally {
  server.closeAllConnections?.();
  await new Promise((resolveClose) => server.close(() => resolveClose()));
}
