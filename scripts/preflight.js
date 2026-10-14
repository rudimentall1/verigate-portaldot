require("dotenv").config();

const RPC_URL = process.env.PORTALDOT_RPC_URL || "https://testnetv3-eth-rpc.feso-apps.xyz";
const EXPECTED_CHAIN_ID = BigInt(process.env.PORTALDOT_CHAIN_ID || "420420777");

async function rpc(method) {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }),
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(`${method}: ${data.error.message || JSON.stringify(data.error)}`);
  if (data.result === undefined) throw new Error(`${method}: JSON-RPC response has no result`);
  return data.result;
}

async function main() {
  console.log(`PortalDot V3 RPC: ${RPC_URL}`);
  console.log(`Expected chain ID: ${EXPECTED_CHAIN_ID}`);

  const [chainHex, blockHex] = await Promise.all([
    rpc("eth_chainId"),
    rpc("eth_blockNumber")
  ]);
  const actualChainId = BigInt(chainHex);
  const blockNumber = BigInt(blockHex);

  console.log(`Actual chain ID: ${actualChainId}`);
  console.log(`Latest block: ${blockNumber}`);
  if (actualChainId !== EXPECTED_CHAIN_ID) {
    throw new Error(`Wrong chain ID; expected ${EXPECTED_CHAIN_ID}, received ${actualChainId}. Refusing deployment.`);
  }

  console.log("RPC preflight passed. This checks connectivity only; it does not prove that a wallet is funded or a deployment will succeed.");
}

main().catch((error) => {
  console.error(`RPC preflight failed: ${error.message}`);
  process.exitCode = 1;
});
