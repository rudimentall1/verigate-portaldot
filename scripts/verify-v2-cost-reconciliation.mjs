import fs from "node:fs";
import { id } from "ethers";

const RPC_URL = (process.env.PORTALDOT_RPC_URL || "https://test-evm-rpc-v3.portaldot.dev").trim();
const EXPECTED_CHAIN_ID = 420420777n;
const TX_HASH = "0xaf3df785fdeaf85bbc9af2ae1342a7c664f4a55877469c4996eff2fe90f5551e";
const rpcParsed = new URL(RPC_URL);
if (rpcParsed.protocol !== "https:" || rpcParsed.username || rpcParsed.password) {
  throw new Error("PORTALDOT_RPC_URL must use HTTPS without embedded credentials.");
}
const EXPECTED_GUARD = "0x87c494a5e4b0a8e055f283767579667e10e046c6".toLowerCase();
const EXPECTED_RECIPIENT = "0xa0fc1a7248955a159d54d84e48681d9cebb86be4".toLowerCase();
const EXPECTED_ACTION_ID = "0xff2cc7690a604a51db85b1e5c43d02bc7cee12277754ccbf6295e78a7b75f38e";
const EXPECTED_EVENT_TOPIC0 = id("TransferExecuted(bytes32,address,uint256,uint256)").toLowerCase();
const EXPECTED_AMOUNT_WEI = 100000000000000000n;
const OUT = process.env.COST_RECONCILIATION_OUT || "";

let requestId = 0;
const rpc = async (method, params) => {
  const id = ++requestId;
  let response;
  try {
    response = await fetch(RPC_URL, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
  } catch (error) {
    throw new Error(`RPC request failed for ${method}: ${error.message}`);
  }
  if (!response.ok) throw new Error(`RPC HTTP ${response.status} for ${method}`);
  const data = await response.json();
  if (data.id !== id) throw new Error(`Unexpected JSON-RPC response ID for ${method}`);
  if (data.error) throw new Error(`RPC error for ${method}: ${data.error.message || "unknown error"}`);
  return data.result;
};

const int = (value, label) => {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value)) {
    throw new Error(`Missing or non-canonical hex quantity: ${label}`);
  }
  return BigInt(value);
};
const pot = (wei) => {
  const negative = wei < 0n;
  const abs = negative ? -wei : wei;
  const whole = abs / 10n ** 18n;
  const fraction = (abs % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? "." + fraction : ""}`;
};
const hex = (n) => "0x" + n.toString(16);

const base = {
  checkedAt: new Date().toISOString(),
  rpcOrigin: new URL(RPC_URL).origin,
  transactionHash: TX_HASH,
  expectedGuard: EXPECTED_GUARD,
  expectedRecipient: EXPECTED_RECIPIENT,
  expectedActionId: EXPECTED_ACTION_ID,
  expectedTransferAmountWei: EXPECTED_AMOUNT_WEI.toString(),
  method: "read-only transaction receipt + exact event match + block isolation + sender/recipient EVM-balance deltas",
  broadcastedTransactions: false,
  status: "unknown",
  limitations: [
    "One configured PortalDot RPC was queried; the RPC operator was not independently authenticated.",
    "The receipt-derived cost is gasUsed × effectiveGasPrice. The balance delta is the reconciliation check; this report does not guess a fee/storage-deposit breakdown.",
  ],
};

let report = { ...base };
try {
  const chainId = int(await rpc("eth_chainId", []), "eth_chainId");
  report.chainId = chainId.toString();
  if (chainId !== EXPECTED_CHAIN_ID) {
    report.status = "wrong_chain";
    report.error = `Expected chain ID ${EXPECTED_CHAIN_ID}, observed ${chainId}`;
  } else {
    const [tx, receipt] = await Promise.all([
      rpc("eth_getTransactionByHash", [TX_HASH]),
      rpc("eth_getTransactionReceipt", [TX_HASH]),
    ]);
    report.transactionAvailable = Boolean(tx);
    report.receiptAvailable = Boolean(receipt);

    if (!tx || !receipt) {
      report.status = "historical_receipt_unavailable";
      report.note = "The configured RPC did not return the existing V2 transaction or receipt. No replacement transaction was sent.";
    } else {
      const blockNumber = int(receipt.blockNumber, "receipt.blockNumber");
      const gasUsed = int(receipt.gasUsed, "receipt.gasUsed");
      const priceValue = receipt.effectiveGasPrice ?? receipt.gasPrice ?? tx.gasPrice;
      const gasPrice = int(priceValue, "receipt effective gas price");
      const derived = gasUsed * gasPrice;
      const sender = String(tx.from || "").toLowerCase();
      const target = String(tx.to || "").toLowerCase();

      report.blockNumber = blockNumber.toString();
      report.receiptStatus = int(receipt.status, "receipt.status").toString();
      report.sender = sender;
      report.target = target;
      report.gasUsed = gasUsed.toString();
      report.effectiveGasPriceWei = gasPrice.toString();
      report.receiptDerivedCostWei = derived.toString();
      report.receiptDerivedCostEvmPOT = pot(derived);
      report.targetMatchesV2Guard = target === EXPECTED_GUARD;

      const transferLogs = Array.isArray(receipt.logs) ? receipt.logs.filter((log) => {
        const topics = Array.isArray(log.topics) ? log.topics : [];
        if (String(log.address || "").toLowerCase() !== EXPECTED_GUARD || topics.length !== 3 || String(topics[0] || "").toLowerCase() !== EXPECTED_EVENT_TOPIC0) return false;
        const indexedRecipient = "0x" + String(topics[2] || "").slice(-40).toLowerCase();
        return String(topics[1] || "").toLowerCase() === EXPECTED_ACTION_ID &&
          indexedRecipient === EXPECTED_RECIPIENT &&
          typeof log.data === "string" && /^0x[0-9a-f]{128}$/i.test(log.data) &&
          BigInt("0x" + log.data.slice(2, 66)) === EXPECTED_AMOUNT_WEI;
      }) : [];
      report.matchingTransferExecutedEvents = transferLogs.length;
      report.transferEventMatchesExpectedRecipientAndAmount = transferLogs.length === 1;
      report.transferEventAmountWei = transferLogs.length === 1
        ? BigInt("0x" + transferLogs[0].data.slice(2, 66)).toString()
        : null;

      if (report.receiptStatus !== "1" || !report.targetMatchesV2Guard || sender.length !== 42) {
        report.status = "transaction_identity_check_failed";
        report.note = "Receipt status, target address, or sender format did not match the expected V2 transfer.";
      } else if (transferLogs.length !== 1) {
        report.status = "expected_transfer_event_not_found";
        report.note = "The receipt did not contain exactly one V2 TransferExecuted log matching the expected action ID, recipient and amount.";
      } else {
        const [block, senderBefore, recipientBefore] = await Promise.all([
          rpc("eth_getBlockByNumber", [receipt.blockNumber, true]),
          rpc("eth_getBalance", [tx.from, hex(blockNumber - 1n)]),
          rpc("eth_getBalance", [EXPECTED_RECIPIENT, hex(blockNumber - 1n)]),
        ]);
        if (!block || !Array.isArray(block.transactions)) {
          report.status = "block_transactions_unavailable";
          report.note = "The RPC did not return the full transaction list for the receipt block.";
        } else {
          const blockTxs = block.transactions.map(item => typeof item === "string" ? item.toLowerCase() : String(item.hash || "").toLowerCase());
          report.blockTransactionCount = blockTxs.length;
          report.transactionIsInReceiptBlock = blockTxs.includes(TX_HASH);
          if (blockTxs.length !== 1 || !report.transactionIsInReceiptBlock) {
            report.status = "insufficient_block_isolation";
            report.note = "The receipt block did not contain exactly the target transaction, so the sender's block-level balance delta cannot be attributed solely to this transaction.";
          } else {
            const [senderAfter, recipientAfter] = await Promise.all([
              rpc("eth_getBalance", [tx.from, receipt.blockNumber]),
              rpc("eth_getBalance", [EXPECTED_RECIPIENT, receipt.blockNumber]),
            ]);
            const senderBeforeWei = int(senderBefore, "sender balance before transaction block");
            const senderAfterWei = int(senderAfter, "sender balance after transaction block");
            const recipientBeforeWei = int(recipientBefore, "recipient balance before transaction block");
            const recipientAfterWei = int(recipientAfter, "recipient balance after transaction block");
            const senderDelta = senderBeforeWei - senderAfterWei;
            const recipientDelta = recipientAfterWei - recipientBeforeWei;
            report.senderBalanceBeforeEvmPOT = pot(senderBeforeWei);
            report.senderBalanceAfterEvmPOT = pot(senderAfterWei);
            report.senderBalanceDecreaseWei = senderDelta.toString();
            report.senderBalanceDecreaseEvmPOT = pot(senderDelta);
            report.balanceDeltaMatchesReceiptDerivedCost = senderDelta === derived;
            report.recipientBalanceBeforeEvmPOT = pot(recipientBeforeWei);
            report.recipientBalanceAfterEvmPOT = pot(recipientAfterWei);
            report.recipientBalanceIncreaseWei = recipientDelta.toString();
            report.recipientBalanceIncreaseEvmPOT = pot(recipientDelta);
            report.recipientBalanceDeltaMatchesTransferAmount = recipientDelta === EXPECTED_AMOUNT_WEI;

            if (senderDelta === derived && recipientDelta === EXPECTED_AMOUNT_WEI) {
              report.status = "reconciled";
              report.note = "The isolated block contains only the target transaction; sender balance decrease matches gasUsed × effectiveGasPriceWei, and the expected recipient's balance increase matches the TransferExecuted amount.";
            } else {
              report.status = "balance_delta_mismatch";
              report.note = "Sender and/or recipient balance delta did not match the recorded transaction cost or transfer amount. Do not claim full balance reconciliation.";
            }
          }
        }
      }
    }
  }
} catch (error) {
  report.status = "read_failed";
  report.error = String(error?.message || error);
  report.note = "Read-only reconciliation could not complete. No transaction was sent; retain the cost claim as unverified.";
}

const json = JSON.stringify(report, null, 2) + "\n";
if (OUT) fs.writeFileSync(OUT, json);
console.log(json);
if (process.env.GITHUB_STEP_SUMMARY) {
  const summary = [
    "# V2 cost reconciliation (read-only)",
    "",
    `- Status: **${report.status}**`,
    `- Transaction: ${TX_HASH}`,
    `- RPC: ${base.rpcOrigin}`,
    `- Receipt-derived figure: ${report.receiptDerivedCostEvmPOT ?? "unavailable"} EVM POT`,
    `- Balance-reconciled sender decrease: ${report.senderBalanceDecreaseEvmPOT ?? "unavailable"} EVM POT`,
    "",
    report.note || report.error || "No additional note.",
    "",
    "No transaction was signed or broadcast.",
  ].join("\n");
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
}
// This verifier is green only when the full receipt, event, block-isolation,
 // sender-debit, and recipient-credit checks all reconcile. Missing historical
 // RPC data is an unverified result, not a passing verification.
if (report.status !== "reconciled") {
  process.exitCode = 1;
}
