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
const genesisBlock = { ...block, number: "0x0", hash: `0x${"aa".repeat(32)}` };

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
    case "eth_estimateGas":
      result = "0x5d26ed11ff8019";
      break;
    case "eth_gasPrice":
      result = "0x9beb";
      break;
    case "eth_maxPriorityFeePerGas":
      result = "0x3e8";
      break;
    case "eth_getBalance":
      // The Hardhat test signer is intentionally underfunded; the estimator fixture
      // uses a separate address with 500 POT so it exercises the estimate threshold.
      result = request.params?.[0]?.toLowerCase() === "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"
        ? "0x0"
        : `0x${(500n * 10n ** 18n).toString(16)}`;
      break;
    case "eth_getTransactionCount":
      result = "0x0";
      break;
    case "eth_getBlockByNumber":
      result = request.params?.[0] === "0x0" ? genesisBlock : block;
      break;
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
  childEnv.NODE_OPTIONS = [childEnv.NODE_OPTIONS, `--import=${resolve("scripts/mock-substrate-websocket.mjs")}`].filter(Boolean).join(" ");
  childEnv.PORTALDOT_SUBSTRATE_RPC_URL = "wss://test-node-v3.portaldot.dev";
  childEnv.PORTALDOT_SUBSTRATE_GENESIS_HASH = "0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd";
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
    !methodsSeen.includes("eth_getBlockByNumber"),
    `Hardhat must not use EVM block 0 as a substitute for Substrate genesis identity. Methods seen: ${methodsSeen.join(", ")}`
  );
  assert(
    !methodsSeen.some((method) => transactionMethods.has(method)),
    `Deploy smoke test unexpectedly attempted a transaction RPC: ${methodsSeen.join(", ")}`
  );

  console.log("PASS: --network portaldot read chainId and the configured genesis block from the read-only mock RPC.");
  console.log("PASS: deployment stopped at the missing DEPLOYER_PRIVATE_KEY guard.");
  console.log("PASS: no transaction RPC methods were called.");

  const unpinnedGenesisEnv = { ...childEnv };
  delete unpinnedGenesisEnv.PORTALDOT_SUBSTRATE_GENESIS_HASH;
  const countBeforeUnpinned = methodsSeen.length;
  const unpinnedResult = await runDeploy(unpinnedGenesisEnv);
  const unpinnedOutput = `${unpinnedResult.stdout ?? ""}\\n${unpinnedResult.stderr ?? ""}`;
  assert.equal(unpinnedResult.error, undefined, `Unpinned deployment smoke failed to launch: ${unpinnedResult.error?.message}`);
  assert.notEqual(unpinnedResult.status, 0, "Deployment must refuse to run without a pinned genesis hash.");
  assert(
    unpinnedOutput.includes("PORTALDOT_SUBSTRATE_GENESIS_HASH must be a pinned 32-byte Substrate genesis hash"),
    `Expected unpinned path to refuse deployment before checking deployer credentials. Output:\\n${unpinnedOutput}`
  );
  assert.equal(
    methodsSeen.slice(countBeforeUnpinned).includes("eth_getBlockByNumber"),
    false,
    "Without PORTALDOT_SUBSTRATE_GENESIS_HASH, deployment must not require a genesis RPC response."
  );
  console.log("PASS: deployment refuses to proceed without an independently pinned genesis hash; no transaction RPC methods were called.");

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

  const underfundedEnv = {
    ...childEnv,
    DEPLOYER_PRIVATE_KEY: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    AUTHORITY_SIGNER_ADDRESS: "0x2222222222222222222222222222222222222222"
  };
  const beforeBudgetGuard = methodsSeen.length;
  const underfundedResult = await runDeploy(underfundedEnv);
  const underfundedOutput = `${underfundedResult.stdout ?? ""}\\n${underfundedResult.stderr ?? ""}`;
  assert.equal(underfundedResult.error, undefined, `Underfunded deploy smoke failed to launch: ${underfundedResult.error?.message}`);
  assert.notEqual(underfundedResult.status, 0, "Deployment must refuse the mocked insufficient deployment budget.");
  assert(
    underfundedOutput.includes("Refusing deployment: balance 0.000000 POT is below the estimated deployment cost plus 20% safety margin"),
    `Expected a pre-broadcast budget refusal. Output:\\n${underfundedOutput}`
  );
  const budgetMethods = methodsSeen.slice(beforeBudgetGuard);
  for (const method of ["eth_estimateGas", "eth_getBalance"]) {
    assert(budgetMethods.includes(method), `Deployment budget guard did not call read-only method ${method}.`);
  }
  assert(
    !budgetMethods.some((method) => transactionMethods.has(method)),
    `Pre-deployment budget guard attempted transaction RPC methods: ${budgetMethods.join(", ")}`
  );
  console.log("PASS: deployment refuses an insufficient live-RPC budget before any transaction RPC method is called.");

  const estimatorEnv = {
    ...childEnv,
    PORTALDOT_SUBSTRATE_RPC_URL: "wss://test-node-v3.portaldot.dev",
    PORTALDOT_SUBSTRATE_GENESIS_HASH: "0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd",
    AUTHORITY_SIGNER_ADDRESS: "0x2222222222222222222222222222222222222222",
    DEPLOYMENT_ESTIMATE_FROM: "0x3333333333333333333333333333333333333333"
  };
  const beforeEstimate = methodsSeen.length;
  const estimator = spawn(
    process.execPath,
    [resolve("scripts/estimate-deployment.mjs")],
    { cwd: process.cwd(), env: estimatorEnv, stdio: ["ignore", "pipe", "pipe"] }
  );
  let estimateStdout = "";
  let estimateStderr = "";
  estimator.stdout.setEncoding("utf8").on("data", (chunk) => { estimateStdout += chunk; });
  estimator.stderr.setEncoding("utf8").on("data", (chunk) => { estimateStderr += chunk; });
  const estimateResult = await new Promise((resolveResult) => {
    const timer = setTimeout(() => {
      estimator.kill("SIGKILL");
      resolveResult({ status: null, error: "estimator timed out" });
    }, 60000);
    estimator.once("error", (error) => {
      clearTimeout(timer);
      resolveResult({ status: null, error: error.message });
    });
    estimator.once("close", (status) => {
      clearTimeout(timer);
      resolveResult({ status, error: null });
    });
  });
  assert.equal(estimateResult.error, null, `Cost estimator failed to launch: ${estimateResult.error}`);
  assert.equal(estimateResult.status, 2, `Expected insufficient mocked balance to return exit code 2. Output:\\n${estimateStdout}\\n${estimateStderr}`);
  assert(estimateStdout.includes('"budgetStatus": "insufficient_for_20_percent_margin"'), "Estimator did not compare live balance to the estimate plus its safety margin.");
  assert(estimateStdout.includes('"deployerBalancePot": "500.000000"'), "Estimator did not express EVM balance using 18-decimal POT units.");
  assert(estimateStdout.includes('"estimatedCostPot":'), "Estimator did not report a deployment cost in POT.");
  assert(methodsSeen.slice(beforeEstimate).includes("eth_estimateGas"), "Estimator did not request an estimate from the mock RPC.");
  assert(
    methodsSeen.slice(beforeEstimate).some((method) => ["eth_gasPrice", "eth_feeHistory", "eth_maxPriorityFeePerGas"].includes(method)),
    "Estimator did not request fee data from the mock RPC."
  );
  assert(methodsSeen.slice(beforeEstimate).includes("eth_getBalance"), "Estimator did not read the deployer balance from the mock RPC.");
  assert(!methodsSeen.slice(beforeEstimate).some((method) => transactionMethods.has(method)), "Estimator attempted a transaction RPC method.");
  console.log("PASS: deployment estimator queries only read-only RPC methods and flags a 500 POT balance below the mocked estimated cost plus 20% margin.");
} finally {
  server.closeAllConnections?.();
  await new Promise((resolveClose) => server.close(() => resolveClose()));
}
