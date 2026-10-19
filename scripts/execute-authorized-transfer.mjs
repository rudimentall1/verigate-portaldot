import "dotenv/config";
import fs from "node:fs";
import { createRequire } from "node:module";
import { ethers } from "ethers";

const require = createRequire(import.meta.url);
const { requiredNetworkConfig } = require("./preflight.js");
const { parseHexQuantity, formatUnitsExact, resolveEstimateFromAddresses } =
  require("./deployment-estimate.js");
const { validateSignedAuthorization, calculateExecutionBudget } =
  require("./execute-authorization-core.js");
const { verifyGuardDeployment } = require("../adapter/verigate-bridge.js");

const GUARD_ABI = [
  "function executeTransfer(address recipient,uint256 amount,uint256 nonce,uint256 deadline,bytes32 actionId,bytes signature) returns (bytes32)",
  "event TransferExecuted(bytes32 indexed actionId,address indexed recipient,uint256 amount,uint256 nonce)"
];
const SAFETY_MARGIN_BPS = 2000;
const MIN_REMAINING_TTL_SECONDS = 15;

function usage() {
  return "Usage: npm run execute:authorization -- ./signed-authorization.json [--broadcast]\n" +
    "Without --broadcast this command only simulates and estimates; it never sends a transaction.\n" +
    "With --broadcast it submits the exact EIP-712-authorized transfer using DEPLOYER_PRIVATE_KEY as relayer.";
}

function readSignedAuthorization(path) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read signed authorization JSON: ${error.message}`);
  }
  return parsed;
}

function requireConfiguredAddress(value, label) {
  if (typeof value !== "string" || !ethers.isAddress(value)) {
    throw new Error(`${label} must be a valid EVM address.`);
  }
  const address = ethers.getAddress(value);
  if (address === ethers.ZeroAddress) throw new Error(`${label} must not be the zero address.`);
  return address;
}

function assertDeadlineStillUsable(authorization, blockTimestamp) {
  const now = BigInt(blockTimestamp);
  const deadline = authorization.transfer.deadline;
  if (deadline <= now + BigInt(MIN_REMAINING_TTL_SECONDS)) {
    throw new Error(
      `Authorization has less than ${MIN_REMAINING_TTL_SECONDS} seconds remaining; request a fresh Verigate authorization.`
    );
  }
  if (deadline > now + 300n) {
    throw new Error("Authorization deadline is more than five minutes in the future at the current block.");
  }
}

async function main() {
  const args = process.argv.slice(2);
  const broadcast = args.includes("--broadcast");
  const positional = args.filter((arg) => arg !== "--broadcast");
  if (positional.length !== 1 || args.some((arg) => arg.startsWith("-") && arg !== "--broadcast")) {
    throw new Error(usage());
  }
  const artifact = readSignedAuthorization(positional[0]);
  const config = requiredNetworkConfig();

  const guardAddress = requireConfiguredAddress(
    process.env.PORTALDOT_GUARD_ADDRESS,
    "PORTALDOT_GUARD_ADDRESS"
  );
  const authoritySigner = requireConfiguredAddress(
    process.env.AUTHORITY_SIGNER_ADDRESS,
    "AUTHORITY_SIGNER_ADDRESS"
  );

  const privateKey = (process.env.DEPLOYER_PRIVATE_KEY || "").trim();
  if (broadcast && !privateKey) {
    throw new Error("Refusing to broadcast: DEPLOYER_PRIVATE_KEY must be configured in the untracked .env file.");
  }

  let relayerWallet = null;
  let privateKeyAddress = "";
  if (privateKey) {
    try {
      relayerWallet = new ethers.Wallet(privateKey);
      privateKeyAddress = relayerWallet.address;
    } catch (error) {
      throw new Error(`DEPLOYER_PRIVATE_KEY is invalid: ${error.message}`);
    }
  }
  const relayerAddress = ethers.getAddress(resolveEstimateFromAddresses(
    process.env.DEPLOYMENT_ESTIMATE_FROM,
    privateKeyAddress
  ));
  if (relayerAddress === authoritySigner) {
    throw new Error("Refusing execution: relayer and EIP-712 authority signer must be different addresses.");
  }

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  try {
    // This verifies the active chain ID, optional genesis pin, runtime bytecode
    // hash and the contract's immutable authority before simulating any transfer.
    const deployment = await verifyGuardDeployment({
      providerFactory: async () => provider
    });
    const latestBlock = await provider.getBlock("latest");
    if (!latestBlock || !Number.isSafeInteger(latestBlock.timestamp)) {
      throw new Error("RPC did not provide a valid latest-block timestamp.");
    }
    const authorization = validateSignedAuthorization(artifact, {
      expectedChainId: config.expectedChainId,
      guardAddress,
      authoritySigner,
      now: latestBlock.timestamp
    });
    assertDeadlineStillUsable(authorization, latestBlock.timestamp);

    const guard = new ethers.Contract(guardAddress, GUARD_ABI, provider);
    const guardBalanceWei = await provider.getBalance(guardAddress);
    if (guardBalanceWei < authorization.transfer.amount) {
      throw new Error(
        `Guard balance ${formatUnitsExact(guardBalanceWei, 18, 6)} POT is below the authorized transfer amount ` +
        `${formatUnitsExact(authorization.transfer.amount, 18, 6)} POT; no transaction sent.`
      );
    }

    const relayer = relayerWallet
      ? relayerWallet.connect(provider)
      : new ethers.VoidSigner(relayerAddress, provider);
    const writableGuard = guard.connect(relayer);
    const { recipient, amount, nonce, deadline, actionId } = authorization.transfer;

    // Both eth_call and eth_estimateGas are read-only simulations. No transaction
    // is sent until the explicit --broadcast flag is present and every preflight passes.
    await writableGuard.executeTransfer.staticCall(
      recipient, amount, nonce, deadline, actionId, authorization.signature
    );
    const gasUnits = await writableGuard.executeTransfer.estimateGas(
      recipient, amount, nonce, deadline, actionId, authorization.signature
    );
    const gasPriceWei = parseHexQuantity(await provider.send("eth_gasPrice", []), "eth_gasPrice result");
    const relayerBalanceWei = await provider.getBalance(relayerAddress);
    const budget = calculateExecutionBudget({
      gasUnits,
      gasPriceWei,
      relayerBalanceWei,
      safetyMarginBps: SAFETY_MARGIN_BPS
    });
    const safetyGasLimit = (gasUnits * BigInt(10000 + SAFETY_MARGIN_BPS) + 9999n) / 10000n;

    const result = {
      network: "Configured PortalDot V3 EVM RPC (chain ID and RPC response are not cryptographic network authentication)",
      rpcOrigin: new URL(config.rpcUrl).origin,
      chainId: config.expectedChainId.toString(),
      genesisHashPinConfigured: Boolean(config.expectedGenesisHash),
      guardAddress: authorization.guardAddress,
      runtimeCodeHash: deployment.runtimeCodeHash,
      authoritySigner: authorization.authoritySigner,
      recoveredSigner: authorization.recoveredSigner,
      relayerAddress,
      authorizationId: authorization.authorizationId,
      intentId: authorization.intentId,
      recipient,
      amountBaseUnits: amount.toString(),
      nonce: nonce.toString(),
      deadline: deadline.toString(),
      actionId,
      guardBalanceWei: guardBalanceWei.toString(),
      guardBalancePot: formatUnitsExact(guardBalanceWei, 18, 6),
      estimatedGasUnits: gasUnits.toString(),
      gasPriceWei: gasPriceWei.toString(),
      estimatedRelayerFeeWei: budget.estimatedCostWei.toString(),
      feeWithSafetyMarginWei: budget.costWithMarginWei.toString(),
      relayerBalanceWei: relayerBalanceWei.toString(),
      relayerBalancePot: formatUnitsExact(relayerBalanceWei, 18, 6),
      feeBudgetStatus: budget.isSufficient ? "sufficient_with_20_percent_margin" : "insufficient_for_20_percent_margin",
      shortfallWei: budget.shortfallWei.toString(),
      broadcastRequested: broadcast,
      transactionBroadcast: false
    };

    if (!budget.isSufficient) {
      console.log(JSON.stringify({
        ...result,
        status: "insufficient_relayer_fee_budget",
        note: "Preflight/simulation only; no transaction signed or broadcast."
      }, null, 2));
      process.exitCode = 2;
      return;
    }

    if (!broadcast) {
      console.log(JSON.stringify({
        ...result,
        status: "simulation_passed",
        gasLimitIfBroadcast: safetyGasLimit.toString(),
        note: "The signature, chain, contract, authority, recipient, amount, guard balance and relayer fee budget passed. This was read-only simulation only; run with --broadcast to submit the transfer."
      }, null, 2));
      return;
    }

    // Re-check time immediately before the only broadcast path. A short-lived
    // signature can expire between simulation and submission.
    const preBroadcastBlock = await provider.getBlock("latest");
    if (!preBroadcastBlock || !Number.isSafeInteger(preBroadcastBlock.timestamp)) {
      throw new Error("Could not refresh the latest block timestamp before broadcast.");
    }
    assertDeadlineStillUsable(authorization, preBroadcastBlock.timestamp);
    await verifyGuardDeployment({ providerFactory: async () => provider });
    const currentGuardBalance = await provider.getBalance(guardAddress);
    if (currentGuardBalance < amount) {
      throw new Error("Guard balance changed below the authorized amount before broadcast; no transaction sent.");
    }

    // Re-simulate at the latest state immediately before broadcast. Another
    // relayer may already have consumed this nonce since the first simulation.
    await writableGuard.executeTransfer.staticCall(
      recipient, amount, nonce, deadline, actionId, authorization.signature
    );
    const preBroadcastGasUnits = await writableGuard.executeTransfer.estimateGas(
      recipient, amount, nonce, deadline, actionId, authorization.signature
    );
    const preBroadcastGasPriceWei = parseHexQuantity(
      await provider.send("eth_gasPrice", []),
      "eth_gasPrice result immediately before broadcast"
    );
    const currentRelayerBalance = await provider.getBalance(relayerAddress);
    const currentBudget = calculateExecutionBudget({
      gasUnits: preBroadcastGasUnits,
      gasPriceWei: preBroadcastGasPriceWei,
      relayerBalanceWei: currentRelayerBalance,
      safetyMarginBps: SAFETY_MARGIN_BPS
    });
    if (!currentBudget.isSufficient) {
      throw new Error(
        `Relayer fee budget fell below the required limit before broadcast; no transaction sent. ` +
        `Current balance: ${formatUnitsExact(currentRelayerBalance, 18, 6)} POT; ` +
        `required with margin: ${formatUnitsExact(currentBudget.costWithMarginWei, 18, 6)} POT.`
      );
    }
    const preBroadcastGasLimit =
      (preBroadcastGasUnits * BigInt(10000 + SAFETY_MARGIN_BPS) + 9999n) / 10000n;

    const tx = await writableGuard.executeTransfer(
      recipient, amount, nonce, deadline, actionId, authorization.signature,
      { gasLimit: preBroadcastGasLimit, gasPrice: preBroadcastGasPriceWei }
    );
    let receipt;
    try {
      receipt = await tx.wait();
    } catch {
      // A timeout or dropped RPC connection after broadcast does not prove that
      // the transaction failed. Preserve the hash so callers do not resubmit blindly.
      console.error(JSON.stringify({
        status: "transaction_submitted_receipt_unavailable",
        transactionBroadcast: true,
        transactionHash: tx.hash,
        note: "The transaction was broadcast but its receipt could not be confirmed. Inspect this hash on the intended network before retrying."
      }, null, 2));
      process.exitCode = 3;
      return;
    }
    if (!receipt) {
      console.error(JSON.stringify({
        status: "transaction_submitted_receipt_unavailable",
        transactionBroadcast: true,
        transactionHash: tx.hash,
        note: "The transaction was broadcast but no receipt was returned. Inspect this hash on the intended network before retrying."
      }, null, 2));
      process.exitCode = 3;
      return;
    }
    if (Number(receipt.status) !== 1) {
      console.error(JSON.stringify({
        status: "transaction_reverted",
        transactionBroadcast: true,
        transactionHash: receipt.hash || tx.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        note: "The transaction was mined but did not succeed. Inspect the receipt before considering another attempt."
      }, null, 2));
      process.exitCode = 3;
      return;
    }

    let transferEventFound = false;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== guardAddress.toLowerCase()) continue;
      try {
        const parsed = guard.interface.parseLog(log);
        if (parsed?.name === "TransferExecuted" &&
            parsed.args.actionId.toLowerCase() === actionId.toLowerCase() &&
            parsed.args.recipient === recipient &&
            parsed.args.amount === amount &&
            parsed.args.nonce === nonce) {
          transferEventFound = true;
          break;
        }
      } catch {
        // Ignore unrelated logs; require the exact guard event below.
      }
    }

    let guardBalanceAfterWei = null;
    try {
      guardBalanceAfterWei = (await provider.getBalance(guardAddress)).toString();
    } catch {
      // The receipt/event remains the primary execution evidence; don't hide its
      // transaction hash if the subsequent balance read fails.
    }
    console.log(JSON.stringify({
      ...result,
      estimatedGasUnits: preBroadcastGasUnits.toString(),
      gasPriceWei: preBroadcastGasPriceWei.toString(),
      estimatedRelayerFeeWei: currentBudget.estimatedCostWei.toString(),
      feeWithSafetyMarginWei: currentBudget.costWithMarginWei.toString(),
      relayerBalanceWei: currentRelayerBalance.toString(),
      relayerBalancePot: formatUnitsExact(currentRelayerBalance, 18, 6),
      feeBudgetStatus: currentBudget.isSufficient ? "sufficient_with_20_percent_margin" : "insufficient_for_20_percent_margin",
      shortfallWei: currentBudget.shortfallWei.toString(),
      gasLimitIfBroadcast: preBroadcastGasLimit.toString(),
      status: transferEventFound ? "transfer_executed" : "transaction_confirmed_event_missing",
      transactionBroadcast: true,
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPriceWei: receipt.gasPrice?.toString() ?? gasPriceWei.toString(),
      guardBalanceAfterWei,
      guardBalanceAfterReadSucceeded: guardBalanceAfterWei !== null,
      transferExecutedEventConfirmed: transferEventFound,
      note: "The transaction was submitted using the explicit --broadcast flag. Preserve its hash and independently verify the receipt on the intended network."
    }, null, 2));
    if (!transferEventFound) process.exitCode = 1;
  } finally {
    await provider.destroy();
  }
}

main().catch((error) => {
  console.error(`Authorized transfer refused: ${error.message}`);
  process.exitCode = 1;
});
