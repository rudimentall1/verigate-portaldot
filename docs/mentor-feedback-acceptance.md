# Mentor feedback: acceptance criteria

Updated: 27 October 2026

The PortalDot Hacker House mentor review marked the project **PASSED** for Check-in and gave three improvement directions: a more solid technical base; explicit commercial and ecosystem contribution; and clearer innovation. This document turns those directions into evidence gates. It is a working checklist, not a claim that every gate is already closed.

## 1. Technical foundation

### Evidence already recorded

| Capability | Current evidence | What the evidence does not prove |
|---|---|---|
| EVM AgentGuard V2 transfer | [V2 transfer record](evidence/portaldot-v2-live-transfer-2026-10-22.json), block 149241, 0.1 EVM POT, successful receipt and matching `TransferExecuted` event | The reads used one configured EVM RPC; no second-provider authentication or EVM genesis-hash pin is claimed |
| EVM policy denial | [Published DApp browser evidence](evidence/published-dapp-browser-smoke-2026-10-24.json) records `InvalidRecipient()` and `AmountExceedsCap(amount, cap)` from read-only `eth_call` probes against the deployed V2 code | These are simulations, not mined failed transactions; they do not prove the exact requests were returned as BLOCK by Verigate |
| Native Substrate execution | [Native transfer evidence](evidence/portaldot-native-substrate-live-transfer-2026-10-24.json) records a Verigate ALLOW, successful `system_dryRun`, a reported finalized `Balances.transfer_keep_alive`, and one matching `balances.Transfer` event | This is an observation from one configured Substrate RPC, not independent provider verification; a finalized event is not a security audit |
| Local contract and adapter checks | `npm test` and `npm run compile` completed successfully in [GitHub Actions run 40460230079](https://github.com/rudimentall1/verigate-portaldot/actions/runs/40460230079) at commit `14c2d21b1c6442aaa22ef7d6a1115db536935ac9` | This is the repository's CI result, not yet an independent rerun by a reviewer |
| Native fee ceiling | `max_fee_base_units` is included in the signed action binding; the adapter compares runtime `paymentInfo.partialFee` with the signed ceiling before it can proceed | It is an estimated fee ceiling, not an on-chain guarantee of final fee; do not claim the final fee can never differ |

### Required engineering gates

- [x] Fail-closed ordering is tested: BLOCK/WARN and expired authorization fail before the native adapter touches the RPC client; the unit test also checks the authorization expiry boundary exactly at the current second. On the updated commit, the native adapter suite reports 21 passing tests.
- [x] Authorization expiry is rechecked after asynchronous verification and RPC preflight, immediately before the native broadcast call, and before creating a locally signed dry-run extrinsic. If expiry is found after reservation, the replay record is changed to `refused_before_broadcast`.
- [x] [GitHub Actions run 40462671557](https://github.com/rudimentall1/verigate-portaldot/actions/runs/40462671557) passed `npm ci --no-audit --no-fund`, `npm test`, and `npm run compile` on commit `87c0a25c48ae`. [PortalDot CI run 40462671621](https://github.com/rudimentall1/verigate-portaldot/actions/runs/40462671621) and [V2 read-only policy simulation run 40462671603](https://github.com/rudimentall1/verigate-portaldot/actions/runs/40462671603) also passed for that revision. This confirms repository CI coverage; it is still not an independent rerun by an outside reviewer.
- [ ] An outside reviewer independently clones the pinned commit and repeats the commands above without private keys or a public-chain broadcast.
- [ ] Reports distinguish `LOCAL TEST`, `LIVE READ-ONLY SIMULATION`, and `PUBLIC TESTNET EXECUTION`. Never present a local transaction or read-only revert as a public testnet transaction.
- [ ] Any second-provider verification is recorded only if a genuinely independent provider returns matching chain identity, transaction/receipt, block hash and event. If no such provider is available, retain the single-provider limitation.
- [ ] An outside reviewer independently verifies the full negative path for changed target/amount, wrong genesis/runtime, failed dry-run and fee estimates above the signed ceiling. Unit tests cover the validation helpers, but this full negative path has not yet been independently exercised against an external signer/submission observer.
- [ ] A timeout, null historical receipt, or ambiguous submission is represented as `UNKNOWN` / unavailable unless there is positive evidence of failure. Do not infer that a transaction never existed from a missing RPC response.

### Security boundaries that must stay explicit

- Verigate's Ed25519 artifacts are checked off-chain by the adapter/bridge. The EVM guard trusts its configured EIP-712 authority signer; it does not verify Verigate's Ed25519 signature on-chain.
- `PortalDotAgentGuardV2` controls only funds routed through its own contract balance. It is not a universal wallet firewall.
- The Substrate adapter supports the specific `Balances.transfer_keep_alive` action. Its local replay ledger is single-host state, not distributed replay protection. Verigate's authorization is enforced by the adapter, not by the Substrate runtime; direct native submissions outside the adapter can bypass policy, and expiry cannot be enforced by the runtime after the extrinsic has been submitted.
- Native Substrate and EVM account identities and fee semantics must not be treated as interchangeable. No H160-to-SS58 mapping is inferred.
- The native transfer fee is estimated before execution; actual runtime charges may differ. The EVM sender debit record is reconciled to `gasUsed × effectiveGasPriceWei`, but the exact execution-fee/storage-deposit split remains unresolved.

## 2. Commercial and ecosystem contribution

### Target user and job

The initial user is a team developing an autonomous application or AI agent that needs to make native POT payments while keeping spending authority constrained by policy. The integration is intended to prevent an agent's proposed action from becoming execution authority by default.

### Concrete contribution to PortalDot

1. An open-source reference adapter that binds a Verigate decision to one exact native Substrate transfer.
2. Runtime-aware preflight for chain/genesis identity, recipient, amount, account balance, estimated fee and `system_dryRun`.
3. An explicit opt-in broadcast boundary, with reported finalized transaction/event evidence.
4. Reusable test cases and operational documentation that other PortalDot application developers can inspect and adapt.

This is a developer integration contribution, not a claim that the PortalDot team requested, endorsed, or adopted it. PortalDot Wallet and DaaS integrations are not claimed.

### Commercial hypothesis

Potential models to validate, not existing revenue:

- Hosted policy evaluation and authorization receipts for application developers.
- Self-hosted or enterprise deployments for teams that need policy data and execution controls in their own environment.
- Support or integration work for teams embedding policy-bound payments into agents.

The project currently has no verified paying customers, revenue, production deployment, or measured demand. The next credible commercial signal would be an external developer who reproduces the example, requests an integration, or commits to a pilot. Until then, describe this only as a monetization hypothesis.

## 3. Innovation and differentiation

The project does not claim that address allowlists, spending caps, EIP-712 signatures, fee estimation or transaction simulation are novel in isolation.

### Comparison with adjacent tooling

The [PortalPilot repository](https://github.com/ismailridwans/portalpilot) describes a Substrate-native copilot/explorer with chain reads, fee estimation, `system.dryRun`, and explicit user confirmation. The [PortalDot developer documentation](https://portaldot-dev.readthedocs.io/en/latest/) also exposes transaction-payment and runtime RPC concepts. Therefore neither a fee preview nor a dry-run is a defensible standalone innovation claim.

The defensible differentiation to test is the policy-authorization layer placed before execution:
- a signed Verigate decision is checked against the exact intent/action;
- native target identity, recipient, amount and signed maximum-fee estimate are bound before adapter signing/submission;
- authorization expiry is checked again after asynchronous preflight and immediately before signing/submission;
- the EVM and native Substrate paths are clearly separated, with different enforcement guarantees.

This makes Verigate complementary to interactive tooling rather than another explorer or chat copilot. It is an integration contribution, not proof that the project is unique in the market or that existing tools cannot add similar features.

The proposed differentiation is their composition into a policy-to-execution path:

1. An agent proposes a typed action.
2. Verigate makes the policy decision.
3. The adapter verifies signed artifacts and checks that the authorization binds to the exact action.
4. The execution adapter checks the target network/runtime and applicable operational constraints.
5. The action is either refused before submission or executed with inspectable evidence.

The EVM path demonstrates a contract-enforced native-token transfer from a dedicated guard balance. The native Substrate path demonstrates the PortalDot-specific extension: policy-bound authorization and fail-closed checks before `Balances.transfer_keep_alive`. The two paths are separate adapters; the EVM guard does not secure native Substrate wallet operations.

This architecture is a defensible integration contribution, not proof of market uniqueness. Any stronger novelty claim requires a cited comparison with existing policy engines, wallet guards and Substrate transaction authorization tools.

## 4. Prioritized delivery order

1. **Close the technical regression gate:** BLOCK/WARN-before-RPC and expiry-boundary checks pass CI; next, have an outside reviewer reproduce the negative path.
2. **Make reproduction easy:** ensure the README's clean-clone commands match the actual scripts; preserve a CI link tied to the tested commit.
3. **Keep evidence boundaries visible:** link one EVM-positive record, one EVM read-only denial record, and the native Substrate finalized-transfer record; label their verification limits.
4. **Publish the product explanation:** use the target user, integration contribution and commercial hypothesis above in README and submission copy.
5. **Seek one external reproduction or integration review:** record the commit tested, commands run, results and findings. Do not call this an audit unless it is one.

Do not add another explorer, broaden the contract, or add UI polish solely for activity. A new implementation task should either close one of the gates above or be deferred until the project has outside validation.
