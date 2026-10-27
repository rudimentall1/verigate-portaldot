# PortalDot developer value: Verigate integration

This document explains the concrete value the current prototype offers to a PortalDot application developer, how to evaluate it, and what remains unproven.

## The developer problem

An AI agent may be able to construct a valid payment, but that should not automatically give it authority to spend. An application needs a boundary between a proposed action and an action that is allowed to execute.

Verigate provides a policy decision before execution and binds the approval to the exact payment. The adapter checks the signed decision and action parameters before it signs or submits a transaction.

## What a PortalDot developer can reuse today

- A reference path for a policy-authorized native POT transfer using `Balances.transfer_keep_alive` on PortalDot V3 Substrate testnet.
- A separate EVM path where `PortalDotAgentGuardV2` enforces a signed authorization, recipient allowlist, per-transfer cap and resettable spending-interval cap against funds held by the guard contract.
- Fail-closed adapter checks for the expected network identity, recipient, amount, expiry and signed maximum-fee ceiling, plus read-only preflight and explicit opt-in broadcast.
- Machine-readable evidence, runnable tests and implementation notes that a developer can inspect before adapting the path.

These are two separate adapters, not a unified wallet firewall. The EVM guard controls only its own contract balance. The native Substrate policy checks happen in the adapter; a direct transaction that bypasses that adapter is not protected by Verigate.

## Integration shape

1. The application asks its agent to propose a typed payment: target network, recipient, amount and relevant limits.
2. Verigate evaluates the request against the configured policy and returns a signed decision.
3. The adapter verifies the signed artifacts and confirms that the authorization matches the exact requested action.
4. The adapter checks the target network/runtime and applicable balance, fee and simulation conditions.
5. A denied, expired or mismatched action is refused before submission. An allowed action is only broadcast through the explicit execution path.
6. The application stores the decision, action parameters and resulting transaction evidence for review.

Start with the repository's [native Substrate adapter guide](native-substrate-authorized-transfer.md), [architecture and trust boundaries](architecture.md), and [Quick start in the README](../README.md#quick-start). The local ALLOW/BLOCK harness is a local integration demonstration, not a public-chain transaction.

## Why this contributes to PortalDot

The ecosystem contribution is a reusable example for developers building autonomous services that make payments on PortalDot. It demonstrates how to put a policy-authorization boundary in front of a specific native Substrate payment, while preserving an EVM contract-enforced option for applications that deliberately route funds through a guard contract.

This can reduce the amount of authorization, preflight and evidence-handling logic an application team must design from scratch. That is a plausible developer benefit, not a measured productivity result yet. No PortalDot Wallet or DaaS integration, team endorsement, production deployment or external adoption is claimed.

## What is technically different

The defensible contribution is the composition of:

- a signed policy decision;
- binding that decision to the exact recipient, amount and target;
- fail-closed checks around network identity, expiry and applicable fee constraints;
- an explicit submission boundary; and
- inspectable execution evidence.

Allowlisting, spending caps, EIP-712, fee estimation and dry-run are established techniques and are not claimed as individually novel. The EVM and Substrate adapters have different enforcement guarantees and must not be described as one shared on-chain policy engine.

## Commercial hypothesis

Potential ways to sustain the work include hosted policy evaluation and authorization receipts, self-hosted deployments for teams that need control of policy data, or paid integration support. These are hypotheses only. There are currently no verified paying customers, revenue, production users or measured demand.

## How to validate the value instead of merely claiming it

The next meaningful validation is an independent PortalDot developer using the repository to adapt or reproduce one payment flow. Record:

1. whether they can follow the guide on a clean checkout without private assistance;
2. elapsed time and undocumented steps needed to get a local test passing;
3. whether the policy boundary addresses a real requirement in their application;
4. which integration surface is missing (API, SDK, example or operational support); and
5. whether they would use it in a pilot, and under what deployment/security requirements.

Do not report these as successful until a developer has actually completed the exercise. A useful outcome can also be a clear rejection of the product hypothesis; it is better evidence than commit counts.

## Current evidence and limits

- The repository records a successful 0.1 POT EVM V2 transfer and read-only probes that returned the deployed guard's recipient/cap reverts. The negative probes were simulations, not mined failed transactions.
- The native Substrate evidence records a Verigate ALLOW, successful `system_dryRun`, and a reported finalized `Balances.transfer_keep_alive` with a matching transfer event. The saved transfer was re-queried through one configured RPC; there is no second-provider confirmation.
- Local CI and test results are repository evidence, not an independent review.
- The native runtime does not verify Verigate's signature. The native adapter enforces the policy, so direct submissions outside it can bypass those checks.
- No security audit, mainnet readiness, universal transaction interception or independent market validation is claimed.

See the [mentor-feedback acceptance criteria](mentor-feedback-acceptance.md) for the project's evidence gates.
