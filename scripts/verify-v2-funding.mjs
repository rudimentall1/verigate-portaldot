#!/usr/bin/env node
/**
 * Read-only verification of the V2 guard funding transaction recorded by the deployer.
 * Does not sign or broadcast.
 */
import "dotenv/config";
import {
  Contract,
  Interface,
  JsonRpcProvider,
  formatEther,
  getAddress,
  keccak256
} from "ethers";

const CHAIN_ID = 420420777n;
const DEPLOYER = "0x4c07B4f328FA738290Db96BCE2F9CBc4d020D2CB";
const GUARD = "0x87C494a5e4B0A8E055F283767579667E10E046C6";
const CODE_HASH = "0x010a565cad83a33442d0f23f6fcb6f605a76082a5b58434813bedf84c54f0859";
const FUNDING_TX = process.argv[2] || "0x3670b42ad718232b572ba06542ffaebd713db6852a215c8acffc471f0eab5019";
const EXPECTED_BLOCK = 148577;
const EXPECTED_VALUE = 110000000000000000n;
const eventInterface = new Interface([
  "event Deposited(address indexed sender,uint256 amount)"
]);

async function main() {
  const rpcUrl = (process.env.PORTALDOT_RPC_URL || "").trim();
  const chainText = (process.env.PORTALDOT_CHAIN_ID || "").trim();
  if (!rpcUrl || !/^[1-9][0-9]*$/.test(chainText)) {
    throw new Error("PORTALDOT_RPC_URL and an explicit positive PORTALDOT_CHAIN_ID are required.");
  }
  if (BigInt(chainText) !== CHAIN_ID) throw new Error("Configured chain ID is not PortalDot V3 testnet.");

  const provider = new JsonRpcProvider(rpcUrl);
  try {
    const network = await provider.getNetwork();
    if (network.chainId !== CHAIN_ID) throw new Error(`RPC chain ID ${network.chainId} is not ${CHAIN_ID}.`);

    const [tx, receipt, code, guardBalance, deployerBalance] = await Promise.all([
      provider.getTransaction(FUNDING_TX),
      provider.getTransactionReceipt(FUNDING_TX),
      provider.getCode(GUARD),
      provider.getBalance(GUARD),
      provider.getBalance(DEPLOYER)
    ]);
    if (!tx || !receipt) throw new Error("RPC did not return both funding transaction and receipt; do not retry funding blindly.");
    if (!receipt.blockHash) throw new Error("Funding receipt does not contain a block hash.");
    const block = await provider.getBlock(receipt.blockNumber);
    const observedCodeHash = code === "0x" ? null : keccak256(code);

    const events = [];
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== GUARD.toLowerCase()) continue;
      try {
        const parsed = eventInterface.parseLog(log);
        if (parsed?.name === "Deposited") {
          events.push({
            sender: getAddress(parsed.args.sender),
            amountWei: parsed.args.amount.toString(),
            amountPot: formatEther(parsed.args.amount),
            logIndex: log.index
          });
        }
      } catch {}
    }

    const checks = {
      chainIdMatches: network.chainId === CHAIN_ID,
      receiptSucceeded: receipt.status === 1,
      transactionTargetsV2Guard: tx.to !== null && getAddress(tx.to) === getAddress(GUARD),
      senderMatchesExpectedDeployer: getAddress(tx.from) === getAddress(DEPLOYER),
      fundingValueMatches: tx.value === EXPECTED_VALUE,
      expectedBlockMatches: receipt.blockNumber === EXPECTED_BLOCK,
      receiptBlockHashMatchesBlock: Boolean(block && block.hash.toLowerCase() === receipt.blockHash.toLowerCase()),
      guardRuntimeCodeHashMatches: observedCodeHash !== null && observedCodeHash.toLowerCase() === CODE_HASH.toLowerCase(),
      oneMatchingDepositedEvent: events.length === 1 &&
        events[0].sender === getAddress(DEPLOYER) &&
        BigInt(events[0].amountWei) === EXPECTED_VALUE
    };

    const report = {
      checkedAt: new Date().toISOString(),
      mode: "read-only",
      rpcOrigin: new URL(rpcUrl).origin,
      chainId: network.chainId.toString(),
      transactionHash: receipt.hash,
      receiptStatus: receipt.status,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      from: getAddress(tx.from),
      to: tx.to ? getAddress(tx.to) : null,
      valuePot: formatEther(tx.value),
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPriceWei: receipt.gasPrice.toString(),
      receiptDerivedCostPot: formatEther(receipt.gasUsed * receipt.gasPrice),
      costInterpretation: "gasUsed * effectiveGasPriceWei from the receipt; not a balance-reconciled fee/deposit breakdown.",
      guardAddress: getAddress(GUARD),
      guardBalancePotNow: formatEther(guardBalance),
      deployerBalancePotNow: formatEther(deployerBalance),
      runtimeCodeHash: observedCodeHash,
      depositedEvents: events,
      checks,
      ok: Object.values(checks).every(Boolean),
      limitations: [
        "Transaction, receipt, block and state are reported by the configured RPC; this does not independently authenticate its operator.",
        "The verifier is read-only and submits no transaction."
      ]
    };
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } finally {
    await provider.destroy();
  }
}

main().catch(error => {
  console.error(`V2 funding verification failed: ${error.message}`);
  process.exitCode = 1;
});
