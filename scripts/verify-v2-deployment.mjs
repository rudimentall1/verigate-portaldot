#!/usr/bin/env node
/**
 * Read-only independent re-query of the V2 deployment reported on 2026-10-22.
 * Uses the configured public PortalDot EVM RPC; never signs or broadcasts.
 */
import "dotenv/config";
import {
  Contract,
  JsonRpcProvider,
  formatEther,
  getAddress,
  keccak256
} from "ethers";

const EXPECTED_CHAIN_ID = 420420777n;
const EXPECTED_DEPLOYER = "0x4c07B4f328FA738290Db96BCE2F9CBc4d020D2CB";
const DEPLOYMENT = {
  address: "0x87C494a5e4B0A8E055F283767579667E10E046C6",
  transactionHash: "0x331c1fc027da51af26ed5ee92ef22a8250fe4efdf0d84526f5fe2203f5d3494b",
  blockNumber: 148397,
  runtimeBytecodeHash: "0x010a565cad83a33442d0f23f6fcb6f605a76082a5b58434813bedf84c54f0859",
  admin: "0x4F714813407Efa8084189e58374F7Ce9CF2249b5",
  authoritySigner: "0x48F9B07d37b5AF744BA8195c4d6740145b593ea6",
  initialRecipient: "0xa0fC1a7248955A159d54D84E48681d9cEbB86Be4",
  maxPerTransfer: 100000000000000000n,
  windowLimit: 500000000000000000n,
  windowSeconds: 3600n
};

const ABI = [
  "function admin() view returns (address)",
  "function authoritySigner() view returns (address)",
  "function maxPerTransfer() view returns (uint256)",
  "function windowLimit() view returns (uint256)",
  "function windowSeconds() view returns (uint256)",
  "function allowedRecipients(address) view returns (bool)"
];

async function main() {
  const rpcUrl = (process.env.PORTALDOT_RPC_URL || "").trim();
  const configuredChainId = (process.env.PORTALDOT_CHAIN_ID || "").trim();
  if (!rpcUrl) throw new Error("PORTALDOT_RPC_URL is missing.");
  if (!configuredChainId || !/^[1-9][0-9]*$/.test(configuredChainId)) {
    throw new Error("PORTALDOT_CHAIN_ID must be a canonical positive integer.");
  }
  if (BigInt(configuredChainId) !== EXPECTED_CHAIN_ID) {
    throw new Error(`Configured chain ID is ${configuredChainId}; expected ${EXPECTED_CHAIN_ID}.`);
  }

  const provider = new JsonRpcProvider(rpcUrl);
  try {
    const network = await provider.getNetwork();
    const latestBlock = await provider.getBlockNumber();
    const guardAddress = getAddress(process.env.PORTALDOT_V2_GUARD_ADDRESS || DEPLOYMENT.address);
    const txHash = process.env.PORTALDOT_V2_DEPLOYMENT_TX_HASH || DEPLOYMENT.transactionHash;
    const expectedCodeHash = (process.env.PORTALDOT_V2_GUARD_CODE_HASH || DEPLOYMENT.runtimeBytecodeHash).toLowerCase();

    const [tx, receipt, code, deployerBalance, guardBalance] = await Promise.all([
      provider.getTransaction(txHash),
      provider.getTransactionReceipt(txHash),
      provider.getCode(guardAddress),
      provider.getBalance(EXPECTED_DEPLOYER),
      provider.getBalance(guardAddress)
    ]);

    if (!tx || !receipt) {
      throw new Error("RPC has not returned both the deployment transaction and receipt. Do not redeploy; inspect the same hash again.");
    }

    const block = await provider.getBlock(receipt.blockNumber);
    const guard = new Contract(guardAddress, ABI, provider);
    const [admin, authoritySigner, maxPerTransfer, windowLimit, windowSeconds, initialRecipientAllowed] =
      await Promise.all([
        guard.admin(),
        guard.authoritySigner(),
        guard.maxPerTransfer(),
        guard.windowLimit(),
        guard.windowSeconds(),
        guard.allowedRecipients(DEPLOYMENT.initialRecipient)
      ]);

    const observedCodeHash = code === "0x" ? null : keccak256(code);
    const receiptContractAddress = receipt.contractAddress ? getAddress(receipt.contractAddress) : null;
    const actualFeeWei = receipt.gasUsed * receipt.gasPrice;
    const checks = {
      chainIdMatches: network.chainId === EXPECTED_CHAIN_ID,
      transactionAndReceiptAvailable: true,
      receiptSucceeded: receipt.status === 1,
      receiptContractAddressMatches: receiptContractAddress === guardAddress,
      expectedBlockMatches: receipt.blockNumber === DEPLOYMENT.blockNumber,
      receiptBlockHashMatchesBlock: Boolean(block && block.hash.toLowerCase() === receipt.blockHash.toLowerCase()),
      deployerMatchesExpected: getAddress(tx.from) === getAddress(EXPECTED_DEPLOYER),
      runtimeCodePresent: code !== "0x",
      runtimeCodeHashMatches: observedCodeHash !== null && observedCodeHash.toLowerCase() === expectedCodeHash,
      adminMatches: getAddress(admin) === getAddress(DEPLOYMENT.admin),
      authoritySignerMatches: getAddress(authoritySigner) === getAddress(DEPLOYMENT.authoritySigner),
      maxPerTransferMatches: BigInt(maxPerTransfer) === DEPLOYMENT.maxPerTransfer,
      windowLimitMatches: BigInt(windowLimit) === DEPLOYMENT.windowLimit,
      windowSecondsMatches: BigInt(windowSeconds) === DEPLOYMENT.windowSeconds,
      initialRecipientIsAllowed: initialRecipientAllowed === true
    };

    const result = {
      checkedAt: new Date().toISOString(),
      mode: "read-only",
      rpcOrigin: new URL(rpcUrl).origin,
      network: "PortalDot V3 EVM Testnet",
      chainId: network.chainId.toString(),
      latestBlock,
      transactionHash: receipt.hash,
      receiptStatus: receipt.status,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      from: getAddress(tx.from),
      contractAddress: guardAddress,
      receiptContractAddress,
      runtimeCodeBytes: code === "0x" ? 0 : (code.length - 2) / 2,
      expectedRuntimeBytecodeHash: expectedCodeHash,
      observedRuntimeBytecodeHash: observedCodeHash,
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPriceWei: receipt.gasPrice.toString(),
      actualDeploymentFeePot: formatEther(actualFeeWei),
      deployerCurrentBalancePot: formatEther(deployerBalance),
      guardCurrentBalancePot: formatEther(guardBalance),
      readback: {
        admin: getAddress(admin),
        authoritySigner: getAddress(authoritySigner),
        maxPerTransferWei: BigInt(maxPerTransfer).toString(),
        maxPerTransferPot: formatEther(maxPerTransfer),
        windowLimitWei: BigInt(windowLimit).toString(),
        windowLimitPot: formatEther(windowLimit),
        windowSeconds: BigInt(windowSeconds).toString(),
        initialRecipient: DEPLOYMENT.initialRecipient,
        initialRecipientAllowed
      },
      checks,
      ok: Object.values(checks).every(Boolean),
      limitations: [
        "Reads are from the configured RPC; this does not independently authenticate its operator.",
        "This check is read-only and does not fund the guard or execute a transfer."
      ]
    };
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    await provider.destroy();
  }
}

main().catch(error => {
  console.error(`V2 deployment verification failed: ${error.message}`);
  process.exitCode = 1;
});
