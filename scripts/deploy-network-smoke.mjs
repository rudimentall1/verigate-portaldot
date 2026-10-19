import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const chainId = 420420777n;
const chainIdHex = `0x${chainId.toString(16)}`;
const methodsSeen = [];
const transactionMethods = new Set([
  "eth_sendTransaction",
  "eth_sendRawTransaction",
  "eth_signTransaction",
  "personal_sendTransaction"
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

function rpcResponse(request) {
  methodsSeen.push(request.method);
  if (transactionMethods.has(request.method)) {
    return {
      jsonrpc: "2.0",
      id: request.id ?? null,
      error: { code: -32601, message: "Transactions are forbidden by the deploy smoke-test RPC" }
    };
  }

  let result;
  switch (request.method) {
    case "eth_chainId":
      result = chainIdHex;
      break;
    case "net_version":
      result = chainId.toString();
      break;
    case "eth_blockNumber":
      result = "0x1";
      break;
    case "eth_getBlockByNumber":
    case "eth_getBlockByHash":
      result = block;
      break;
    case "web3_clientVersion":
      result = "PortalDotDeploySmoke/1.0";
      break;
    case "eth_syncing":
      result = false;
      break;
    default:
      return {
        jsonrpc: "2.0",
        id: request.id ?? null,
        error: { code: -32601, message: `Unsupported read-only smoke method: ${request.method}` }
      };
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
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const output = Array.isArray(input) ? input.map(rpcResponse) : rpcResponse(input);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(output));
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON-RPC request" }));
  }
});

await new Promise((resolveListen, rejectListen) => {
  server.once("error", rejectListen);
  server.listen(0, "127.0.0.1", resolveListen);
});

try {
  const address = server.address();
  assert(address && typeof address === "object", "Mock RPC server did not bind to an ephemeral port.");

  const cliPath = resolve("node_modules/hardhat/dist/src/cli.js");
  assert(existsSync(cliPath), `Hardhat CLI not found at expected path: ${cliPath}`);

  const childEnv = { ...process.env };
  childEnv.PORTALDOT_RPC_URL = `http://127.0.0.1:${address.port}`;
  childEnv.PORTALDOT_CHAIN_ID = chainId.toString();
  delete childEnv.DEPLOYER_PRIVATE_KEY;
  delete childEnv.AUTHORITY_SIGNER_ADDRESS;

  async function runDeploy(childEnvironment) {
    const child = spawn(
      process.execPath,
      [cliPath, "run", "scripts/deploy.mjs", "--network", "portaldot"],
      { cwd: process.cwd(), env: childEnvironment, stdio: ["ignore", "pipe", "pipe"] }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });

    return new Promise((resolveResult) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolveResult(value);
      };
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish({ error: new Error("Hardhat deploy smoke process timed out after 60 seconds"), status: null });
      }, 60_000);
      child.once("error", (error) => finish({ error, status: null }));
      child.once("close", (status, signal) => finish({ error: undefined, status, signal, stdout, stderr }));
    });
  }

  const result = await runDeploy(childEnv);
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

  assert.equal(result.error, undefined, `Hardhat deployment smoke process failed to launch: ${result.error?.message}`);
  assert.notEqual(result.status, 0, "Deployment script must refuse to deploy without DEPLOYER_PRIVATE_KEY.");
  assert(
    output.includes("DEPLOYER_PRIVATE_KEY is missing"),
    `Expected the script to validate chain ID and then fail at the missing deployer key. Output:\n${output}`
  );
  assert(
    methodsSeen.includes("eth_chainId"),
    `Hardhat did not query the configured mock PortalDot RPC. Methods seen: ${methodsSeen.join(", ")}`
  );
  assert(
    !methodsSeen.some((method) => transactionMethods.has(method)),
    `Deploy smoke test unexpectedly attempted a transaction RPC: ${methodsSeen.join(", ")}`
  );

  console.log("PASS: --network portaldot reached the configured read-only mock RPC (chainId 420420777).");
  console.log("PASS: deployment stopped at the missing DEPLOYER_PRIVATE_KEY guard.");
  console.log("PASS: no transaction RPC methods were called.");

  const rpcCallCountBeforeCredentialTest = methodsSeen.length;
  const credentialEnv = {
    ...childEnv,
    PORTALDOT_RPC_URL: `http://user:password@127.0.0.1:${address.port}`
  };
  const credentialResult = await runDeploy(credentialEnv);
  const credentialOutput = `${credentialResult.stdout ?? ""}\n${credentialResult.stderr ?? ""}`;
  assert.equal(credentialResult.error, undefined, `Hardhat credential-validation smoke failed to launch: ${credentialResult.error?.message}`);
  assert.notEqual(credentialResult.status, 0, "Hardhat must refuse an RPC URL containing embedded credentials.");
  assert(
    credentialOutput.includes("PORTALDOT_RPC_URL must not embed credentials"),
    `Expected Hardhat to reject embedded RPC credentials. Output:\n${credentialOutput}`
  );
  assert.equal(
    methodsSeen.length,
    rpcCallCountBeforeCredentialTest,
    "A credentialed RPC URL must be rejected before any network request."
  );
  console.log("PASS: Hardhat rejects RPC URLs containing embedded credentials before network requests.");
} finally {
  server.closeAllConnections?.();
  await new Promise((resolveClose) => server.close(() => resolveClose()));
}
