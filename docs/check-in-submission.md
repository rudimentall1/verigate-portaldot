# DoraHacks submission draft: Verigate PortalDot

**Status (updated 2026-10-24):** V1 and V2 are deployed on PortalDot V3 testnet. V2 is `PortalDotAgentGuardV2` at `0x87C494a5e4B0A8E055F283767579667E10E046C6`; its runtime code hash and configuration readback are recorded in [`docs/evidence/portaldot-v2-deployment-2026-10-22.json`](evidence/portaldot-v2-deployment-2026-10-22.json). A real Verigate `ALLOW` was converted by the V2 bridge into a signed action and executed as a `0.1 POT` transfer in block `149241`; the read-only follow-up verifier reported receipt status `1` and exactly one matching `TransferExecuted` event. A follow-up read-only check found block 149241 contained exactly one EVM transaction. The sender's EVM balance decreased from `416.196502092920504516` to `408.368680611525079006 POT`, exactly matching `gasUsed × effectiveGasPriceWei` (`7.82782148139542551 POT`). This was reconciled through the configured RPC only; the runtime cost has not been split into execution-fee and storage-deposit components. See [cost reconciliation evidence](evidence/portaldot-v2-cost-reconciliation-2026-10-23.json). Full evidence: [`docs/evidence/portaldot-v2-live-transfer-2026-10-22.json`](evidence/portaldot-v2-live-transfer-2026-10-22.json). This verification used the configured PortalDot RPC; it is not independent authentication of that RPC operator. A later read-only follow-up measured the recipient balance increasing from `0` to `0.1 POT` across the isolated block; no second EVM RPC provider was used, and the EVM genesis hash pin was not configured for this transfer. This is testnet evidence, not an audit or production-readiness claim.

**Latest published-DApp runtime verification (24 October 2026; tested DApp code commit `af41b2f0b646922bb79638012d835ac3f8651abe`):** [PortalDot CI](https://github.com/rudimentall1/verigate-portaldot/actions/runs/40071558877), [Test](https://github.com/rudimentall1/verigate-portaldot/actions/runs/40071558867), and [PortalDot RPC health](https://github.com/rudimentall1/verigate-portaldot/actions/runs/40071558866) all completed successfully. The deployed DApp passed its [published Chromium smoke test](https://github.com/rudimentall1/verigate-portaldot/actions/runs/40071558856): chain ID `420420777`, V2 runtime hash, signer, on-chain policy (`0.1 POT` per transfer, `0.5 POT` per 3600-second resettable interval), and the allowlisted recipient matched the recorded configuration. The browser exercised two live read-only `eth_call` denial probes against the deployed V2 code: `InvalidRecipient()` for an unlisted recipient and `AmountExceedsCap(amount, cap)` for `0.100000000000000001 POT` versus the live `0.1 POT` cap. The read-only generic lookup also returned receipt status 1 and one matching `TransferExecuted` event for the recorded 0.1 POT transaction in block 149241. No transaction or signature was created by the denial probes. This is one-RPC testnet evidence, not independent RPC authentication and not a mined public-chain revert. The CI run reported 178 passing Mocha tests; the repository tests, DApp validator, Explorer/receipt lookup tests, integration workflow and compile step completed successfully. Hardhat reported `No contracts to compile` in the separate compile step because no source changes needed compilation at that step. The full [machine-readable browser evidence](evidence/published-dapp-browser-smoke-2026-10-24.json) is committed in the repository; the original [published-browser-smoke workflow](https://github.com/rudimentall1/verigate-portaldot/actions/runs/40071558856) also retained a time-limited artifact.

The dependency audit and Substrate metadata checks passed on earlier revisions; they were not rerun at the current head. The published presentation is a seven-slide deck with a successful render check. The user reports that the BUIDL now links to the published [2:54.7 demo](https://www.youtube.com/watch?v=9WhBdwGgXLk). The inspected working render fits the three-minute cap, but the exact public upload has not been watched/listened to continuously in this review. The sidecar SRT available in working materials still contains the previous wording at cues 4–8 and 46; it may predate the current YouTube upload, so confirm the audio and burned-in subtitles on the public version rather than assuming. The user's current account-view excerpt confirms the updated video link, GitHub and social links; logged-out judge visibility and the selected track/complete long-form description were not established by that excerpt. The user's current DoraHacks view says the Check-in step was cancelled and shows Final Submission deadline 6 November 2026, 09:00 (04:00 UTC when displayed at UTC+5).

## Submission fields

**Project name:** Verigate PortalDot

**Recommended track:** Modular Cloud & Middleware

This is the closest fit because the project provides a reusable authorization and execution middleware layer. It is not a node monitoring dashboard, nor does it yet implement a bridge between independent chains.

**One-line description**

Verigate PortalDot is open-source authorization middleware that turns a signed Verigate ALLOW decision into a short-lived, exact-amount EIP-712 payment authorization enforced by a dedicated Solidity guard on PortalDot V3.

**Project description**

AI agents can propose payments, but a proposal should not grant spending authority. The current demonstration uses `PortalDotAgentGuardV2` on PortalDot V3 EVM testnet. Verigate evaluates the action off-chain; the bridge verifies the Verigate authorization and signs an exact, short-lived EIP-712 transfer authorization. V2 checks the recipient allowlist, per-transfer maximum, configured time-window cap, deadline and nonce before transferring native POT from the guard's own balance.

The V2 policy recorded in deployment evidence allows one configured recipient, limits a transfer to `0.1 POT`, and sets a `0.5 POT` cap for a `3,600-second` resettable interval. The spending counter resets when the configured interval expires; this is not a continuously sliding rolling-window calculation. The administrator can change the allowlist and policy, so the caps are not immutable limits against a compromised administrator.

A real `0.1 POT` V2 transfer is recorded in block `149241`, with a successful receipt and one matching `TransferExecuted` event reported by a separate read-only query to the configured PortalDot RPC. The receipt-derived cost figure was `7.82782148139542551 POT`, calculated from `gasUsed × effectiveGasPriceWei`; the sender debit was later reconciled to the receipt-derived figure using a read-only before/after EVM-balance query for the isolated block. No second EVM RPC provider was used, the recipient balance delta was checked separately using the same RPC, and the runtime cost was not split into execution-fee and storage-deposit components. Separate from that successful transfer, the published dashboard now exercises the deployed V2 recipient/cap checks with read-only `eth_call`: the current code hash is checked, an unlisted recipient returns `InvalidRecipient()`, and an amount one wei above the live cap returns `AmountExceedsCap(amount, cap)` with matching arguments. These are live endpoint-reported simulation results, not mined public-testnet revert transactions and not proof that Verigate returned BLOCK for those exact probe inputs; the Verigate API/bridge ALLOW/BLOCK path remains local end-to-end evidence. No transaction signature or fee is involved in these probes.

The contract does not verify Verigate's Ed25519 authorization itself; the bridge verifies it off-chain, and the contract verifies the bridge's EIP-712 signature. The guard is not a global wallet interceptor: only transfers routed through the funded guard contract are covered. No integration into PortalDot Wallet or DaaS, external user adoption, PortalDot team endorsement, mainnet deployment, or independent audit is claimed.
## Status and evidence

- **Public repository:** https://github.com/rudimentall1/verigate-portaldot
- **Implementation branch:** https://github.com/rudimentall1/verigate-portaldot/tree/main
- **Live Web3 DApp:** https://rudimentall1.github.io/verigate-portaldot/
- **Read-only DApp source:** https://github.com/rudimentall1/verigate-portaldot/blob/main/web3-dapp/index.html
- **V2 deployment runbook:** [docs/v2-deployment-runbook.md](v2-deployment-runbook.md)
- **V2 live transfer evidence:** [docs/evidence/portaldot-v2-live-transfer-2026-10-22.json](evidence/portaldot-v2-live-transfer-2026-10-22.json)
- **V2 deployment/configuration evidence:** [docs/evidence/portaldot-v2-deployment-2026-10-22.json](evidence/portaldot-v2-deployment-2026-10-22.json)
- **V2 deployment script:** [scripts/deploy-v2.mjs](../scripts/deploy-v2.mjs)
- **Architecture:** [docs/architecture.md](architecture.md)
- **Presentation PDF:** [Verigate-PortalDot-Presentation.pdf](Verigate-PortalDot-Presentation.pdf)
- **Testnet deployment evidence:** [docs/deployment-evidence-2026-10-20.md](deployment-evidence-2026-10-20.md)
- **Initial minimal public transfer evidence:** [docs/authorized-transfer-evidence-2026-10-21.md](authorized-transfer-evidence-2026-10-21.md)
- **Non-dust 0.1 EVM POT transfer evidence:** [docs/authorized-transfer-evidence-2026-10-21-nondust.md](authorized-transfer-evidence-2026-10-21-nondust.md)
- **Operations runbook:** [docs/testnet-operations-2026-10-20.md](testnet-operations-2026-10-20.md)
- **PortalDot node console:** https://node-console.portaldot.dev/
- **EVM chain ID:** `420420777`
- **V1 contract:** `PortalDotAgentGuard` at `0x3f2f484484fbE6e224d058fDfDB6B5A14F09655b`
- **V2 contract:** `PortalDotAgentGuardV2` at `0x87C494a5e4B0A8E055F283767579667E10E046C6`
- **V2 live transfer:** `0xaf3df785fdeaf85bbc9af2ae1342a7c664f4a55877469c4996eff2fe90f5551e`, block `149241`, amount `0.1 POT`, receipt status `1`, sender debit `7.82782148139542551 POT`, reconciled against the sender's before/after EVM balance through one RPC
- **Deployment transaction:** `0xb1cf9cca75bb029b0a723f13c398479d2c18704c1138c02c6d92a02c1fcdce3c`
- **Receipt:** success (`0x1`), block `116872`
- **Initial minimal authorized transfer:** transaction 0xbe3ade2ba3209cf0df3647cea50fb6608a77bb837213a25b8ec419fa9914cc14 at block 130741; the original record documents the one-base-unit `TransferExecuted` event.
- **Non-dust authorized transfer:** transaction 0x21acff99d30652161f7e4ba6e1d76e6b6b67e8b9e02b09edd64d8bd7f2d5dd9c at block 132475; executor reports `transfer_executed`, `TransferExecuted` confirmed, and guard balance decreased exactly 0.1 EVM POT. This is recorded from terminal output; read-only receipt/event re-query and recipient/relayer balance reconciliation are complete against the configured RPC; the EVM genesis pin is not configured and no second provider was used.
- **Runtime bytecode Keccak-256:** `0xb3d71ff82b4b654c7bafe855ce13b0dc277627a046e3190f6f6e0ee5eb7f7671`
- **Recorded validation:** the merged PR CI run reported `171 passing` Hardhat tests; the compile step, network smoke test, dependency audit and isolated Verigate ALLOW/BLOCK integration also passed. The compile step reported `No contracts to compile` because Hardhat had compiled during the test step; this is not being presented as an independent fresh compilation.
- **Isolated end-to-end test:** Verigate returned ALLOW for the permitted case and BLOCK for the denied case. Signatures were verified; the guard's real Solidity source executed the exact authorized transfer on a temporary loopback Hardhat EVM. This is local integration evidence, not a public PortalDot transfer.

## Why PortalDot

PortalDot V3 offers an EVM-compatible deployment target for a narrow, reusable spending guard while retaining Substrate runtime information needed for operational preflight. This allows developers to reuse Solidity/EIP-712 patterns without treating a connected agent or the RPC endpoint as an authority by itself. The current contribution is an execution-control middleware component, deployment/operations tooling, and reproducible local ALLOW/BLOCK evidence.

### Innovation and technical differentiation

The differentiator is not an allowlist or a signature scheme in isolation. It is an authorization-to-execution boundary: Verigate makes the policy decision; the adapter validates that the signed decision authorizes the exact intended action; and the target execution surface performs its own checks before funds move.

The EVM adapter demonstrates this with a short-lived EIP-712 authorization enforced by `PortalDotAgentGuardV2`. The PortalDot-specific direction is the separate native Substrate adapter for `Balances.transfer_keep_alive`: it binds the intent to the target testnet genesis, SS58 recipient, base-unit amount and maximum estimated fee; checks the runtime and balances; supports runtime `system_dryRun`; and submits only with explicit `--broadcast`. These are separate paths, not a claim that the EVM guard protects native Substrate or arbitrary wallet transactions.

The project does not claim that the individual primitives are novel, that the design is unique, or that PortalDot has adopted the integration. Its contribution is a reusable reference implementation showing how policy authorization can be connected to two distinct execution surfaces with explicit trust boundaries.

### Differentiation from adjacent PortalDot tooling

[PortalPilot](https://github.com/ismailridwans/portalpilot) publicly describes a Substrate-native copilot and explorer with chain reads, fee estimation, `system.dryRun`, and explicit user confirmation before writes. Those capabilities are useful and we do not claim them as our innovation. The distinction is the authority boundary:

| Adjacent component | Primary responsibility | Verigate PortalDot contribution |
|---|---|---|
| Explorer / RPC monitor | Observe balances, blocks, transactions and receipts | Decide whether a specific proposed action is authorized before execution; retain provenance for the resulting evidence |
| PortalPilot-style interactive tooling | Help a user compose, price, simulate and confirm chain actions | Verify a signed Verigate policy decision and bind it to the exact native transfer and signed maximum-fee ceiling before the adapter can sign/submit |
| Policy engine alone | Evaluate an action against off-chain rules | Connect the signed decision to a target execution boundary and fail closed on action mismatch, wrong network identity or expired authorization |
| EVM spending guard | Enforce constraints for transfers routed through a contract | Provide a separate native Substrate adapter; this does not extend the EVM guard's protection to arbitrary native wallet transactions |

The claim is complementary, not competitive superiority: an interactive wallet/copilot can be the user-facing layer, while Verigate controls whether the proposed action receives execution authority. For Substrate, that enforcement is at the trusted adapter's signing/submission boundary because the runtime does not verify Verigate signatures. For EVM, the deployed guard separately enforces the scoped EIP-712 authorization and contract policy on-chain.

### Commercial and ecosystem contribution

The target user is a team building an autonomous service or AI agent that must make native POT payments without receiving unrestricted spending authority. The reusable contribution to PortalDot developers is source code, testnet deployment evidence, a native Substrate execution adapter, fail-closed preflight checks, and a documented route for integrating policy-controlled payments into an application.

A possible commercial model is hosted policy evaluation and authorization receipts for application developers, with a self-hosted or enterprise option for teams needing control over policy data and infrastructure. This is a business hypothesis only: the project has no verified revenue, paying customers, production deployment, PortalDot Wallet/DaaS integration, or team endorsement to claim. The next validation step is developer feedback or a third-party integration, not an unsupported adoption statement.

## Current limitations (disclose, do not hide)

1. V1 and V2 are deployed on PortalDot V3 testnet. The V2 live transfer receipt and `TransferExecuted` event were re-queried through the configured RPC, but no second RPC provider or EVM-genesis pin was used. A later read-only check measured the recipient's EVM balance increasing from `0` to `0.1 POT` in the isolated transaction block, using the configured RPC.
2. The specific H160-to-SS58 mapping for the wallet-displayed address has not been confirmed by the runtime storage lookup. The deployment evidence explicitly records this limitation.
3. The public RPC's reported chain/genesis values are consistency checks, not independent authentication of the RPC operator.
4. This is a testnet prototype, not a production deployment or independent security audit.
5. The V2 allowlist, per-transfer cap and resettable time-window cap are confirmed by deployment/configuration readback. The published browser verified live read-only rejection responses (`InvalidRecipient()` and `AmountExceedsCap(amount, cap)`); they are `eth_call` simulations, not mined reverts. Window-overflow and nonce non-consumption remain local contract tests. All live reads use one configured RPC. The revised demo is published at https://www.youtube.com/watch?v=9WhBdwGgXLk and is under three minutes. Remaining video gate: listen/watch the exact public upload end-to-end and verify burned-in captions. The attached working SRT still contains the prior text at cues 4–8 and 46, which may predate the YouTube upload.

## Remaining before submitting

- [x] Publish the implementation on `main`; verify the repository and current CI runs are publicly accessible.
- [x] Merge the read-only dashboard source and complete the GitHub Pages deployment workflow.
- [x] Verify the published page in a clean Chromium browser at the V2 guard URL; the browser checked live RPC reads, both read-only denial probes and the known transaction receipt. Evidence: [published-dapp-browser-smoke-2026-10-24.json](evidence/published-dapp-browser-smoke-2026-10-24.json).
- [x] Publish the demo link on DoraHacks: https://www.youtube.com/watch?v=9WhBdwGgXLk (reported duration 2:54.7).
- [ ] Watch/listen to the exact public upload end-to-end and confirm that both corrected voice lines and the burned-in captions are present and synchronized.
- [x] Presentation PDF is published in the repository. (This is not the demo video.)
- [x] The current account view shows the demo URL, GitHub repository and social links on DoraHacks.
- [ ] Confirm logged-out access to the BUIDL, video, PDF and public DApp, and confirm the full description/selected track remain correct.
- [ ] Verify the final submission is visible to a logged-out reviewer and saved before 6 November 2026, 09:00 as shown in DoraHacks.

## Development provenance and intellectual property

The submission should distinguish existing Verigate components from work specifically added for this hackathon. Disclose the pre-existing open-source components and third-party SDKs/dependencies used; the repository's MIT license remains in place. Do not imply that all of Verigate originated during the event. Preserve dated commits and CI records showing the work done during the 14 October–6 November build period.

## Suggested build update

Verigate PortalDot has V1 and V2 guards deployed on PortalDot V3 testnet
