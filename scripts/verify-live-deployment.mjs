#!/usr/bin/env node
/**
 * Read-only live verification of the PortalDotAgentGuard deployment.
 * Does not sign, broadcast, or change chain state. Historical receipt lookup
 * is reported separately because the PortalDot RPC may prune old block state.
 */
import "dotenv/config";
import { Contract, JsonRpcProvider, formatEther, keccak256, getAddress } from "ethers";

const required = [
  "PORTALDOT_RPC_URL",
  "PORTALDOT_CHAIN_ID",
  "PORTALDOT_GUARD_ADDRESS",
  "PORTALDOT_GUARD_CODE_HASH",
  "AUTHORITY_SIGNER_ADDRESS"
];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required configuration: ${key}`);
    process.exit(2);
  }
}

const rpcUrl = process.env.PORTALDOT_RPC_URL;
const expectedChainId = BigInt(process.env.PORTALDOT_CHAIN_ID);
const guardAddress = getAddress(process.env.PORTALDOT_GUARD_ADDRESS);
const expectedCodeHash = process.env.PORTALDOT_GUARD_CODE_HASH.toLowerCase();
const expectedSigner = getAddress(process.env.AUTHORITY_SIGNER_ADDRESS);
const deploymentTxHash = process.env.PORTALDOT_DEPLOYMENT_TX_HASH
  || "0xb1cf9cca75bb029b0a723f13c398479d2c18704c1138c02c6d92a02c1fcdce3c";

let endpoint;
try {
  endpoint = new URL(rpcUrl);
  if (!["https:", "http:"].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
    throw new Error("RPC URL must be HTTP(S) without embedded credentials");
  }
  if (endpoint.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)) {
    throw new Error("Remote RPC must use HTTPS");
  }
} catch (error) {
  console.error("Invalid PORTALDOT_RPC_URL:", error.message);
  process.exit(2);
}

async function rawRpc(method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    redirect: "error",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(`${method}: RPC ${data.error.code}: ${data.error.message}`);
  if (!Object.prototype.hasOwnProperty.call(data, "result")) throw new Error(`${method}: malformed JSON-RPC response`);
  return data.result;
}

const provider = new JsonRpcProvider(rpcUrl);
try {
  const network = await provider.getNetwork();
  const latestBlock = await provider.getBlockNumber();
  const [code, balance] = await Promise.all([
    provider.getCode(guardAddress),
    provider.getBalance(guardAddress)
  ]);
  const actualCodeHash = code === "0x" ? null : keccak256(code);
  const guard = new Contract(guardAddress, ["function authoritySigner() view returns (address)"], provider);
  const actualSigner = getAddress(await guard.authoritySigner());
  const [transactionLookup, receiptLookup] = await Promise.allSettled([
    rawRpc("eth_getTransactionByHash", [deploymentTxHash]),
    rawRpc("eth_getTransactionReceipt", [deploymentTxHash])
  ]);
  const transaction = transactionLookup.status === "fulfilled" ? transactionLookup.value : null;
  const receipt = receiptLookup.status === "fulfilled" ? receiptLookup.value : null;

  const checks = {
    chainIdMatches: network.chainId === expectedChainId,
    contractHasCode: code !== "0x",
    runtimeCodeHashMatches: actualCodeHash !== null && actualCodeHash.toLowerCase() === expectedCodeHash,
    authoritySignerMatches: actualSigner === expectedSigner
  };
  const report = {
    checkedAt: new Date().toISOString(),
    mode: "read-only",
    rpcOrigin: endpoint.origin,
    latestBlock,
    chainId: { expected: expectedChainId.toString(), observed: network.chainId.toString() },
    contract: {
      address: guardAddress,
      runtimeCodeBytes: code === "0x" ? 0 : (code.length - 2) / 2,
      expectedRuntimeCodeHash: expectedCodeHash,
      observedRuntimeCodeHash: actualCodeHash,
      balanceWei: balance.toString(),
      balanceEvmPOT: formatEther(balance),
      expectedAuthoritySigner: expectedSigner,
      observedAuthoritySigner: actualSigner
    },
    checks,
    deploymentTransaction: {
      hash: deploymentTxHash,
      transactionObjectAvailable: Boolean(transaction),
      receiptAvailable: Boolean(receipt),
      receiptStatus: receipt?.status ?? null,
      receiptBlockNumber: receipt?.blockNumber ? BigInt(receipt.blockNumber).toString() : null,
      transactionLookupError: transactionLookup.status === "rejected" ? transactionLookup.reason.message : null,
      receiptLookupError: receiptLookup.status === "rejected" ? receiptLookup.reason.message : null,
      note: receipt
        ? "Historical receipt is currently available from this RPC."
        : "This RPC did not return the historical transaction/receipt on this check. Current code and signer reads are reported independently; null historical lookup is not proof of failed deployment."
    },
    limitations: [
      "A public RPC response is not independent cryptographic authentication of the RPC operator.",
      "This read-only check does not send or simulate a transfer.",
      "A successful deployment is not proof that the full Verigate ALLOW-to-PortalDot payment path has been demonstrated."
    ],
    ok: Object.values(checks).every(Boolean)
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} catch (error) {
  console.error("Live deployment verification failed:", error.message);
  process.exitCode = 1;
} finally {
  await provider.destroy();
}
