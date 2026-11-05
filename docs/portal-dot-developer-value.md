# Verigate on PortalDot: a reference integration for agent payments

An AI agent can prepare a payment, but the application still needs a way to decide whether that payment is allowed. Verigate makes that decision before execution and binds the approval to the action being requested.

This repository shows two ways to put that check into a PortalDot payment flow: an EVM guard and a separate native Substrate adapter.

## The problem for application developers

A transaction can be valid on the network and still break the rules set by the person or application using the agent. For example, the agent might choose a different recipient, send more than the allowed amount or reuse an old approval.

The integration puts a policy check between the agent and the code that submits the payment. Verigate evaluates the request and returns ALLOW, WARN or BLOCK. The relevant adapter verifies the signed decision and checks that it applies to the exact action before submission.

## What is implemented

- **EVM path:** `PortalDotAgentGuardV2` checks the bridge's EIP-712 authorization, recipient allowlist, per-transfer limit and resettable spending-interval limit. It transfers only funds held by the guard contract.
- **Native Substrate path:** a separate adapter verifies the Verigate authorization and checks the requested `Balances.transfer_keep_alive` before it submits the transfer.
- **Operational checks:** the adapters check network identity, recipient, amount, expiry and applicable fee limits. They default to read-only preflight; sending a transaction requires an explicit broadcast option.
- **Evidence:** the repository includes contracts, adapter code, tests, machine-readable transaction records and verification instructions.

These are two different execution paths, not one cross-chain policy engine. The EVM guard cannot control funds held in an unrelated wallet. The Substrate adapter cannot stop a transaction submitted outside that adapter.

## How an application uses the flow

1. The application asks its agent to prepare a payment with a network, recipient and amount.
2. Verigate checks the request against the configured policy.
3. The adapter verifies the signed decision and confirms that it covers the same payment.
4. The adapter checks the network and the relevant balance, fee and simulation conditions.
5. If the request is denied, expired or changed, the adapter stops. An approved payment is submitted only through the explicit execution path.
6. The application can retain the decision, payment details and transaction record for review.

The repository includes a [native Substrate adapter guide](native-substrate-authorized-transfer.md), [architecture and trust boundaries](architecture.md), and [README quick start](../README.md#quick-start). The local ALLOW/BLOCK harness runs against a local EVM; it is not a public-chain transaction.

## Why this is useful to PortalDot developers

The goal is to give developers a working example they can inspect and adapt when building services that let AI agents make payments. It shows where the policy decision happens, how it is tied to the requested action, and what each execution path checks before it submits a transaction.

This is a reference integration, not a claim that PortalDot requested or adopted the feature. PortalDot Wallet and DaaS are possible future integration points; neither is integrated here.

## What is and is not new

The contribution is in putting the pieces together into an inspectable payment flow:

- a signed policy decision;
- a check that binds approval to the exact recipient, amount and target;
- fail-closed checks for network identity, expiry and applicable fee limits;
- a clear point where a transaction can be submitted; and
- records that let another developer inspect what happened.

Allowlisting, spending caps, EIP-712 signatures, fee estimation and dry-run checks are established techniques. We do not claim that any one of them is new by itself. The EVM and Substrate paths also have different security guarantees; they should not be presented as one shared on-chain policy engine.

## Commercial direction

The practical next step is to work with an application developer who needs agent payments and test whether this integration fits their workflow. If that proves useful, possible delivery models include hosted policy evaluation, self-hosted deployment for teams that need to keep policy data under their control, or paid integration support. These are options to validate, not existing revenue or customer commitments.

## What would validate the work

A useful next test is for a PortalDot developer who was not involved in building this repository to reproduce one payment flow. We should record:

1. whether the instructions work from a clean checkout;
2. what setup steps or missing details they encounter;
3. whether the authorization boundary solves a real requirement;
4. what would be needed to integrate it into their application; and
5. whether they would consider using it in a pilot.

Until someone has completed that exercise, it should be described as a proposed validation step, not as external adoption.

## Evidence and limits

- The EVM V2 record shows a 0.1 POT testnet transfer and a successful receipt with one matching `TransferExecuted` event.
- The published dashboard's recipient and amount rejection checks are read-only `eth_call` simulations. They are not mined failed transactions.
- The native Substrate record shows a Verigate ALLOW, successful `system_dryRun`, and a reported finalized `Balances.transfer_keep_alive` with a matching transfer event. The transaction was re-queried through one configured RPC; no second-provider confirmation is available.
- Local tests and CI results show the behavior of the code under those test conditions. They are not an independent security review.
- The Substrate runtime does not verify Verigate's signature. That check is performed by the adapter, so direct submissions outside it are not covered.
- No independent security audit, mainnet deployment, universal wallet protection or external market validation is claimed.

See the [mentor-feedback acceptance criteria](mentor-feedback-acceptance.md) for the remaining evidence and validation steps.
