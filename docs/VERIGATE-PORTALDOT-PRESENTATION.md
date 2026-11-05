# Verigate + PortalDot
## Transaction authorization for AI-driven applications

---

## 01 — The problem

AI agents can propose transactions. A proposal must not automatically grant spending authority.

Authorization and execution need separate controls.

---

## 02 — The approach

Verigate evaluates the proposed action against policy and signs an authorization decision.

The bridge verifies the Ed25519 artifact and binds approval to the exact transfer using EIP-712.

PortalDotAgentGuardV2 validates that authorization and enforces contract-level limits.

---

## 03 — Execution flow

1. An AI application proposes a transfer.
2. Verigate evaluates policy and issues a signed decision.
3. The bridge verifies the signed artifact and prepares action-bound EIP-712 authorization.
4. The guard checks signature, recipient, amount and spending interval.
5. The contract transfers native POT from its own balance.

---

## 04 — On-chain policy

- Recipient allowlist.
- Maximum **0.1 POT per transfer**.
- Maximum **0.5 POT per resettable 3,600-second interval**.

The interval counter resets after expiry. It is not a continuously sliding rolling-window sum.

---

## 05 — Implemented on PortalDot V3

- PortalDotAgentGuardV2 deployed on EVM testnet.
- Successful 0.1 POT transfer with matching `TransferExecuted` event.
- Live read-only rejection simulations for an over-cap amount and a non-allowlisted recipient.
- Public read-only DApp, automated tests and recorded evidence.

---

## 06 — Successful testnet execution

**Contract:** `0x87C494a5e4B0A8E055F283767579667E10E046C6`

**Network:** PortalDot V3 EVM testnet  
**Chain ID:** `420420777`  
**Block:** `149241`

**Transaction:**  
`0xaf3df785fdeaf85bbc9af2ae1342a7c664f4a55877469c4996eff2fe90f5551e`

**Receipt:** successful  
**Event:** `TransferExecuted`  
**Amount:** 0.1 POT

---

## 07 — Live policy rejection checks

**Over-cap request:** `0.100000000000000001 POT`  
**Contract result:** `AmountExceedsCap(amount, cap)`

**Non-allowlisted recipient**  
**Contract result:** `InvalidRecipient()`

Both checks were read-only `eth_call` simulations. No transaction was signed or broadcast, and no transaction fee was incurred.

---

## 08 — Security boundary

The bridge verifies Verigate's Ed25519-signed artifacts. The contract does not verify Ed25519 directly; it verifies the bridge's EIP-712 execution authorization.

The guard protects transfers from its own contract balance. It does not protect arbitrary wallets or prevent bypass through other fund-access paths.

---

## 09 — Current limitations

- No live testnet simulation of a time-window cap violation.
- No successful live native Substrate transfer is claimed.
- No verified PortalDot DaaS integration is demonstrated.
- No independent second-RPC confirmation is claimed.
- No independent security audit, mainnet deployment or production-readiness claim.

---

## 10 — Why it matters

An AI agent may generate an action, but it should not define its own authority.

**Verigate authorizes. The bridge binds authorization to the exact action. The on-chain guard enforces explicit limits.**

This is an evidence-backed reference authorization-to-execution path for AI-driven payments on PortalDot.

---

## 11 — Code and evidence

Repository: [rudimentall1/verigate-portaldot](https://github.com/rudimentall1/verigate-portaldot)

The repository contains Solidity contracts, bridge implementation, deployment and verification scripts, automated tests, workflows and recorded testnet evidence.
