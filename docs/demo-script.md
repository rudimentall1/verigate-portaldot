# Three-minute Hacker House demo

**Goal:** show the authorization boundary, the verified PortalDot V3 deployment, and clearly separate live deployment evidence from local transfer simulation.

## Evidence

- Deployment address: `0x3f2f484484fbE6e224d058fDfDB6B5A14F09655b`
- Deployment transaction: `0xb1cf9cca75bb029b0a723f13c398479d2c18704c1138c02c6d92a02c1fcdce3c`
- Receipt status: `0x1`, block `116872`
- Deployment evidence: https://github.com/rudimentall1/verigate-portaldot/blob/main/docs/deployment-evidence-2026-10-20.md
- Automated checks: https://github.com/rudimentall1/verigate-portaldot/actions

## Recording plan (target: 2 minutes 40 seconds)

### 0:00–0:25 — Problem and boundary

**Show:** repository front page and architecture.

**Say:**
> An AI agent proposing a payment is not proof that it has authority to execute it. Verigate evaluates the action and provides signed authorization; the bridge only creates a narrowly scoped EIP-712 authorization for ALLOW.

### 0:25–0:55 — Contract and deployment

**Show:** `contracts/PortalDotAgentGuard.sol`, then the deployment evidence document.

**Say:**
> PortalDot V3 testnet deployment is confirmed. The receipt succeeded, the runtime code was read back and fingerprinted, and the on-chain authority signer matched the configured signer. This proves deployment and configuration readback, not an independent security audit.

### 0:55–1:35 — Authorization flow

**Show:** bridge code and the automated integration evidence.

Point out:
- ALLOW is required before authorization is produced.
- BLOCK is refused.
- Dry-run simulates without broadcasting.
- The local integration confirms an exact transfer event and recipient balance delta on a disposable loopback Hardhat EVM.

**Say:**
> The end-to-end ALLOW/BLOCK transfer demonstration currently runs on a local simulator. It is not a public PortalDot transfer. The executor is dry-run by default and requires an explicit broadcast flag.

### 1:35–2:10 — Guard protections

**Show:** tests for replay protection, altered recipient/amount, expiry, invalid signatures and reentrancy.

**Say:**
> The guard binds the transfer to a trusted authority, recipient, amount, deadline and nonce. The tests exercise these constraints locally. The project is still a testnet prototype, not a production wallet or an independent audit.

### 2:10–2:40 — Next steps

**Show:** operations runbook and check-in draft.

**Say:**
> The deployment evidence and operating instructions are public. The remaining work is to publish the reproducible transfer tooling on the default branch, record the final demo and complete the DoraHacks submission.

## Do not show or claim

- Never show `.env`, private keys, mnemonic phrases, API tokens or real wallet balances.
- Do not label the local Hardhat transfer as a PortalDot transaction.
- Do not claim that the displayed EVM address-to-SS58 mapping is independently verified.
- Do not claim production readiness or an independent audit.
