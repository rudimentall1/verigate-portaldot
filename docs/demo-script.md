# Three-minute Hacker House demo

**Goal:** demonstrate the full authorization path from Verigate decision to an exact native-token transfer. The current demo runs entirely on temporary local services and must not be presented as a live PortalDot deployment.

## Evidence to use

Open the repository's [GitHub Actions runs](https://github.com/rudimentall1/verigate-portaldot/actions) and choose the latest successful branch-head PortalDot CI run. Download the isolated-verigate-api-evidence artifact. It includes the ALLOW response, BLOCK response, EIP-712 authorization and summary.json with simulation and local execution evidence.

## Recording plan (target: 2 minutes 40 seconds)

### 0:00–0:20 — Problem and trust boundary

**Show:** repository front page and [architecture diagram](architecture.md).

**Say:**
> An agent's proposal is not sufficient authority to move funds. Verigate evaluates the action and signs its decision; the bridge independently verifies both Ed25519 artifacts and only prepares an EIP-712 transfer authorization for ALLOW.

### 0:20–0:45 — On-chain guard and executor

**Show:** contracts/PortalDotAgentGuard.sol, then scripts/execute-authorized-transfer.mjs.

**Say:**
> The guard accepts only a short-lived EIP-712 signature from its dedicated authority signer. Recipient, amount, nonce, deadline, chain and contract are bound. The executor validates the signature, checks the deployed runtime-code hash and authority, checks funds and relayer fees, and simulates before any broadcast. It is dry-run by default; a transaction requires an explicit --broadcast flag.

### 0:45–1:30 — Reproducible full-path local integration

**Show:** the verigate-integration job and the downloaded summary.json.

Point out:
- allow.decision = ALLOW and both Verigate signature checks are true.
- block.decision = BLOCK and block.bridge_cli_refused_block = true.
- executor_dry_run.status = simulation_passed.
- executor_dry_run.transaction_broadcast = false.
- executor_dry_run.guard_balance_unchanged = true.
- local_execution.status = transfer_executed.
- local_execution.transfer_executed_event_confirmed = true.
- local_execution.balance_delta_matches_authorized_amount = true.

**Say:**
> CI starts a disposable Verigate API and a temporary Hardhat EVM bound to loopback. The signed ALLOW first passes a read-only simulation, then the executor broadcasts it only to that local EVM. The guard emits the exact transfer event and the recipient's balance delta equals the authorized amount. BLOCK is refused. These are local integration transactions, not PortalDot testnet transactions.

### 1:30–1:55 — Contract protections

**Show:** tests for replay protection, recipient/amount modification, expiry, malformed signatures and reentrancy.

**Say:**
> The tests cover altered transfer details, replay, expired authorization, invalid signatures, reentrancy and failed native transfers. They prove the tested code path on a local simulator, not the runtime configuration or availability of the public network.

### 1:55–2:25 — What remains before live testnet use

**Show:** deployment-cost-evidence.md, the [RPC preflight section](../README.md#portaldot-v3-preflight), and the open draft [PR #10](https://github.com/rudimentall1/verigate-portaldot/pull/10).

**Say:**
> The live deploy is still intentionally separate. The final authority signer, independently trusted contract fingerprint and current deployment budget must be configured and checked before deploying. No live contract address or testnet transaction is claimed. The executor's public-network broadcast path is opt-in and should not be used until the network configuration and deployed contract are verified.

### 2:25–2:40 — Close

**Show:** public repository and successful Actions run.

**Say:**
> The implementation, automated checks and local end-to-end evidence are public. The remaining live-network deployment is tracked honestly rather than being represented by a local simulation.

## Do not show or claim

- Never show .env, private keys, API tokens or a real wallet balance.
- Do not present the local guard, local transaction hashes or simulated chain ID as PortalDot testnet evidence.
- Do not claim a public transfer, testnet deployment or explorer verification.
- Keep the video under three minutes. If live deployment later completes, replace the relevant segment with independently verified transaction evidence.
