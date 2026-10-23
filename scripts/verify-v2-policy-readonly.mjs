#!/usr/bin/env node
/**
 * Read-only policy negative tests against the deployed PortalDot V3 V2 guard.
 * Uses eth_call only. Never signs, broadcasts, funds, or mutates on-chain state.
 *
 * Verifies that the current deployed bytecode/config matches the recorded V2
 * guard, then simulates an over-cap transfer and a transfer to a non-allowlisted
 * recipient. Window-overflow is covered by the local Hardhat suite; the deployed
 * guard's current balance/state may make that branch unreachable via eth_call
 * without state overrides or funding, neither of which is used here.
 */
import {
  Contract,
  Interface,
  JsonRpcProvider,
  getAddress,
  keccak256,
} from "ethers";

const RPC_URL = (process.env.PORTALDOT_RPC_URL || "https://test-evm-rpc-v3.portaldot.dev").trim();
const EXPECTED_CHAIN_ID = 420420777n;
const GUARD_ADDRESS = getAddress("0x87C494a5e4B0A8E055F283767579667E10E046C6");
const EXPECTED_CODE_HASH = "0x010a565cad83a33442d0f23f6fcb6f605a76082a5b58434813bedf84c54f0859";
const EXPECTED_SIGNER = getAddress("0x48F9B07d37b5AF744BA8195c4d6740145b593ea6");
const EXPECTED_RECIPIENT = getAddress("0xa0fC1a7248955A159d54D84E48681d9cEbB86Be4");
const ABI = [
  "function admin() view returns (address)",
  "function authoritySigner() view returns (address)",
  "function allowedRecipients(address) view returns (bool)",
  "function maxPerTransfer() view returns (uint256)",
  "function windowLimit() view returns (uint256)",
  "function windowSeconds() view returns (uint256)",
  "function windowStart() view returns (uint256)",
  "function spentInWindow() view returns (uint256)",
  "function usedNonces(uint256) view returns (bool)",
  "function executeTransfer(address recipient,uint256 amount,uint256 nonce,uint256 deadline,bytes32 actionId,bytes signature) returns (bytes32)",
  "error InvalidRecipient()",
  "error AmountExceedsCap(uint256 amount,uint256 cap)",
  "error WindowLimitExceeded(uint256 spent,uint256 requested,uint256 cap)",
  "error InsufficientBalance(uint256 available,uint256 requested)",
  "error InvalidAuthoritySignature()",
  "error InvalidSignature()",
  "error AuthorizationExpired()",
  "error AuthorizationTooFarInFuture()"
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectEthCallRevert({ guard, recipient, amount, nonce, deadline, actionId, expectedError, relayer }) {
  try {
    await guard.executeTransfer.staticCall(
      recipient, amount, nonce, deadline, actionId, "0x", { from: relayer }
    );
  } catch (error) {
    const actual = error?.errorName || error?.revert?.name || null;
    if (actual === expectedError) {
      return { passed: true, expectedError, actualError: actual, message: error.shortMessage || error.message };
    }
    throw new Error(
      `eth_call reverted with ${actual || "an undecoded error"}; expected ${expectedError}. ${error.shortMessage || error.message}`
    );
  }
  throw new Error(`eth_call unexpectedly succeeded; expected ${expectedError}.`);
}

async function main() {
  const provider = new JsonRpcProvider(RPC_URL);
  try {
    const network = await provider.getNetwork();
    assert(network.chainId === EXPECTED_CHAIN_ID, `Wrong chain ID: ${network.chainId}; expected ${EXPECTED_CHAIN_ID}.`);

    const code = await provider.getCode(GUARD_ADDRESS);
    assert(code !== "0x", "V2 guard has no runtime bytecode at the recorded address.");
    const codeHash = keccak256(code);
    assert(codeHash.toLowerCase() === EXPECTED_CODE_HASH.toLowerCase(),
      `Runtime code hash mismatch: ${codeHash}`);

    const guard = new Contract(GUARD_ADDRESS, ABI, provider);
    const [
      authoritySigner, allowed, maxPerTransfer, windowLimit, windowSeconds,
      windowStartBefore, spentBefore, balanceBefore, latestBlock
    ] = await Promise.all([
      guard.authoritySigner(),
      guard.allowedRecipients(EXPECTED_RECIPIENT),
      guard.maxPerTransfer(),
      guard.windowLimit(),
      guard.windowSeconds(),
      guard.windowStart(),
      guard.spentInWindow(),
      provider.getBalance(GUARD_ADDRESS),
      provider.getBlock("latest")
    ]);

    assert(getAddress(authoritySigner) === EXPECTED_SIGNER, "On-chain authoritySigner differs from the recorded V2 signer.");
    assert(allowed === true, "Recorded initial recipient is not currently allowlisted.");
    assert(maxPerTransfer === 100000000000000000n, `Unexpected maxPerTransfer: ${maxPerTransfer}`);
    assert(windowLimit === 500000000000000000n, `Unexpected windowLimit: ${windowLimit}`);
    assert(windowSeconds === 3600n, `Unexpected windowSeconds: ${windowSeconds}`);
    assert(latestBlock, "RPC did not return latest block.");

    let nonce = 20261023000000000000000000000000000000000000000000000000000000001n;
    while (await guard.usedNonces(nonce)) nonce += 1n;
    const deadline = BigInt(latestBlock.timestamp + 60);
    const actionId = keccak256(new TextEncoder().encode("verigate-v2-readonly-negative-check-2026-10-23"));
    const relayer = "0x000000000000000000000000000000000000dEaD";

    // Branch order in the contract checks recipient and per-transfer cap before
    // signature/balance. Invalid signatures are intentionally never reached.
    const overCap = await expectEthCallRevert({
      guard, recipient: EXPECTED_RECIPIENT, amount: maxPerTransfer + 1n,
      nonce, deadline, actionId, expectedError: "AmountExceedsCap", relayer
    });

    const unallowlistedCandidates = [
      "0x000000000000000000000000000000000000dEaD",
      "0x000000000000000000000000000000000000bEEF",
      "0x000000000000000000000000000000000000c0DE"
    ].map(getAddress);
    let rejectedRecipient = null;
    for (const candidate of unallowlistedCandidates) {
      if (!(await guard.allowedRecipients(candidate))) {
        rejectedRecipient = candidate;
        break;
      }
    }
    assert(rejectedRecipient, "Could not find a non-allowlisted probe recipient from the fixed candidate set.");
    const recipientBlock = await expectEthCallRevert({
      guard, recipient: rejectedRecipient, amount: 1n, nonce: nonce + 1n,
      deadline, actionId, expectedError: "InvalidRecipient", relayer
    });

    const [
      windowStartAfter, spentAfter, balanceAfter,
      nonceUsedAfter, secondNonceUsedAfter, latestBlockAfter
    ] = await Promise.all([
      guard.windowStart(),
      guard.spentInWindow(),
      provider.getBalance(GUARD_ADDRESS),
      guard.usedNonces(nonce),
      guard.usedNonces(nonce + 1n),
      provider.getBlock("latest")
    ]);

    const stateUnchanged = windowStartBefore === windowStartAfter &&
      spentBefore === spentAfter && balanceBefore === balanceAfter &&
      nonceUsedAfter === false && secondNonceUsedAfter === false;
    assert(stateUnchanged, "Read-only calls unexpectedly changed observable guard state.");
    const result = {
      checkedAt: new Date().toISOString(),
      mode: "read-only eth_call; no transaction submitted",
      network: "PortalDot V3 EVM testnet",
      rpcOrigin: new URL(RPC_URL).origin,
      chainId: network.chainId.toString(),
      latestBlockBefore: latestBlock.number,
      latestBlockAfter: latestBlockAfter?.number ?? null,
      guardAddress: GUARD_ADDRESS,
      runtimeCodeBytes: (code.length - 2) / 2,
      runtimeCodeHash: codeHash,
      authoritySigner: getAddress(authoritySigner),
      policy: {
        allowlistedRecipient: EXPECTED_RECIPIENT,
        maxPerTransferBaseUnits: maxPerTransfer.toString(),
        windowLimitBaseUnits: windowLimit.toString(),
        windowSeconds: windowSeconds.toString(),
        guardBalanceBaseUnitsBefore: balanceBefore.toString(),
        spentInWindowBaseUnitsBefore: spentBefore.toString(),
        windowStartBefore: windowStartBefore.toString()
      },
      simulations: [
        {
          name: "over-per-transfer-cap",
          amountBaseUnits: (maxPerTransfer + 1n).toString(),
          expectedRevert: "AmountExceedsCap",
          ...overCap
        },
        {
          name: "recipient-not-allowlisted",
          recipient: rejectedRecipient,
          amountBaseUnits: "1",
          expectedRevert: "InvalidRecipient",
          ...recipientBlock
        }
      ],
      stateAfter: {
        guardBalanceBaseUnits: balanceAfter.toString(),
        spentInWindowBaseUnits: spentAfter.toString(),
        windowStart: windowStartAfter.toString(),
        firstProbeNonceUsed: nonceUsedAfter,
        secondProbeNonceUsed: secondNonceUsedAfter,
        unchanged: stateUnchanged
      },
      notCoveredLive: [
        "WindowLimitExceeded is covered by the local Hardhat contract test. Current guard balance/state may prevent reaching that branch with an ordinary eth_call without funding or state overrides; this script deliberately does neither.",
        "An eth_call revert proves current RPC simulation behavior, not a mined public-chain revert transaction.",
        "All reads are from the configured PortalDot RPC and do not independently authenticate the RPC operator."
      ],
      ok: true
    };
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await provider.destroy();
  }
}

main().catch(error => {
  console.error(`V2 read-only policy simulation failed: ${error.message}`);
  process.exitCode = 1;
});
