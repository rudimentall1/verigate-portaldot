# DoraHacks submission reference: Verigate PortalDot

**Status (updated 2026-10-24):** V1 and V2 are deployed on PortalDot V3 testnet. V2 is `PortalDotAgentGuardV2` at `0x87C494a5e4B0A8E055F283767579667E10E046C6`; its runtime code hash and configuration readback are recorded in [`docs/evidence/portaldot-v2-deployment-2026-10-22.json`](evidence/portaldot-v2-deployment-2026-10-22.json). A real Verigate `ALLOW` was converted by the V2 bridge into a signed action and executed as a `0.1 POT` transfer in block `149241`; the read-only follow-up verifier reported receipt status `1` and exactly one matching `TransferExecuted` event. A follow-up read-only check found block 149241 contained exactly one EVM transaction. The sender's EVM balance decreased from `416.196502092920504516` to `408.368680611525079006 POT`, exactly matching `gasUsed × effectiveGasPriceWei` (`7.82782148139542551 POT`). This was reconciled through the configured RPC only; the runtime cost has not been split into execution-fee and storage-deposit components. See [cost reconciliation evidence](evidence/portaldot-v2-cost-reconciliation-2026-10-23.json). Full evidence: [`docs/evidence/portaldot-v2-live-transfer-2026-10-22.json`](evidence/portaldot-v2-live-transfer-2026-10-22.json). This verification used the configured PortalDot RPC; it is not independent authentication of that RPC operator. A later read-only follow-up measured the recipient balance increasing from `0` to `0.1 POT` across the isolated block; no second EVM RPC provider was used, and the EVM genesis hash pin was not configured for this transfer. This is testnet evidence, not an audit or production-readiness claim.

**Latest published-DApp runtime verification (24 October 2026; tested DApp code commit `af41b2f0b646922bb79638012d835ac3f8651abe`):** [PortalDot CI](https://github.com/rudimentall1/verigate-portaldot/actions/runs/40071558877), [Test](https://github.com/rudimentall1/verigate-portaldot/actions/runs/40071558867), and [PortalDot RPC health](https://github.com/rudimentall1/verigate-portaldot/actions/runs/40071558866) all completed successfully. The deployed DApp passed its [published Chromium smoke test](https://github.com/rudimentall1/verigate-portaldot/actions/runs/40071558856): chain ID `420420777`, V2 runtime hash, signer, on-chain policy (`0.1 POT` per transfer, `0.5 POT` per 3600-second resettable interval), and the allowlisted recipient matched the recorded configuration. The browser exercised two live read-only `eth_call` denial probes against the deployed V2 code: `InvalidRecipient()` for an unlisted recipient and `AmountExceedsCap(amount, cap)` for `0.100000000000000001 POT` versus the live `0.1 POT` cap. The read-only generic lookup also returned receipt status 1 and one matching `TransferExecuted` event for the recorded 0.1 POT transaction in block 149241. No transaction or signature was created by the denial probes. This is one-RPC testnet evidence, not independent RPC authentication and not a mined public-chain revert. The CI run reported 178 passing Mocha tests; the repository tests, DApp validator, Explorer/receipt lookup tests, integration workflow and compile step completed successfully. Hardhat reported `No contracts to compile` in the separate compile step because no source changes needed compilation at that step. The full [machine-readable browser evidence](evidence/published-dapp-browser-smoke-2026-10-24.json) is committed in the repository; the original [published-browser-smoke workflow](https://github.com/rudimentall1/verigate-portaldot/actions/runs/40071558856) also retained a time-limited artifact.

The published demo video is [Verigate PortalDot Hacker House Demo](https://www.youtube.com/watch?v=9WhBdwGgXLk). The original seven-page PDF at [Verigate-PortalDot-Presentation.pdf](Verigate-PortalDot-Presentation.pdf) is the deck retained with that demo and remains unchanged. It is a snapshot of the project at the time of recording: its final slide says that a live native Substrate transfer had not yet been demonstrated. A separate native Substrate transfer was recorded on 24 October and re-queried on 27 October; the later evidence is linked below. Do not replace the original PDF with a newly written deck.

The supplied source render was 2:54.7 and within the three-minute limit. The exact public YouTube upload has not been reviewed continuously here, and the SRT available in working materials may predate that upload. Before submission, verify the actual upload's narration and burned-in captions from beginning to end. The latest supplied DoraHacks account snapshot records the video, GitHub and social links, but does not establish logged-out judge access or confirm the selected track and complete long-form description. The Check-in step is cancelled; the Final Submission deadline shown in the account is 6 November 2026, 09:00 (04:00 UTC at UTC+5).

## Submission fields

**Project name:** Verigate PortalDot

**Recommended track:** Modular Cloud & Middleware

This is the closest fit because the project provides a reusable authorization and execution middleware layer. It is not a node monitoring dashboard, nor does it yet implement a bridge between independent chains.

**One-line description**

Verigate checks whether an AI agent is allowed to make a payment, then binds that decision to the exact action before the payment can be submitted. The PortalDot V3 integration demonstrates this with an EVM guard and a separate native Substrate adapter.

**Project description**

AI agents can prepare payments, but the application or owner should remain in control of where funds can go and how much can be spent. Verigate evaluates each proposed action against configured policy and returns ALLOW, WARN or BLOCK.

In the EVM path, the bridge verifies Verigate's signed decision and creates a short-lived EIP-712 authorization for one exact payment. `PortalDotAgentGuardV2` checks the bridge signature, recipient, amount, nonce and deadline before transferring POT from the guard's own balance. The recorded policy allows one configured recipient, caps each transfer at `0.1 POT`, and sets a `0.5 POT` limit for a resettable `3,600-second` interval. The administrator can change these settings; they are not immutable against a compromised administrator.

The EVM testnet record shows a `0.1 POT` transfer in block `149241`, with a successful receipt and one matching `TransferExecuted` event. The receipt, sender debit and recipient balance change were checked through one configured PortalDot RPC. No second provider was used, and the sender's total debit has not been separated into execution-fee and storage-deposit components.

The public dashboard also makes two read-only calls to the deployed guard. An unlisted recipient returns `InvalidRecipient()`; an amount one wei above the cap returns `AmountExceedsCap(amount, cap)`. These are live endpoint responses to simulations, not mined failed transactions. They do not show that Verigate returned BLOCK for those exact inputs. The Verigate ALLOW/BLOCK API-to-bridge flow is covered separately by local end-to-end tests.

There is also a separate native Substrate adapter. Its saved evidence records a Verigate ALLOW, a successful pre-broadcast `system_dryRun`, and a finalized `Balances.transfer_keep_alive` in block `175489` with one matching `balances.Transfer` event. The transaction was re-queried through one configured RPC; it has not been checked through a second provider. The Substrate runtime does not verify Verigate's signature: the adapter performs that check, so transactions submitted outside the adapter are not covered.

The current result is a PortalDot V3 testnet reference integration. The EVM guard only controls funds held by that contract. No global wallet protection, PortalDot Wallet or DaaS integration, independent security audit, mainnet deployment or production-readiness claim is made.

## Status and evidence

- **Public repository:** https://github.com/rudimentall1/verigate-portaldot
- **Implementation branch:** https://github.com/rudimentall1/verigate-portaldot/tree/main
- **Live Web3 DApp:** https://rudimentall1.github.io/verigate-portaldot/
- **Read-only DApp source:** https://github.com/rudimentall1/verigate-portaldot/blob/main/web3-dapp/index.html
- **V2 deployment runbook:** [docs/v2-deployment-runbook.md](v2-deployment-runbook.md)
- **V2 live transfer evidence:** [docs/evidence/portaldot-v2-live-transfer-2026-10-22.json](evidence/portaldot-v2-live-transfer-2026-10-22.json)
- **Native Substrate transfer evidence (separate adapter):** [finalized transfer record](evidence/portaldot-native-substrate-live-transfer-2026-10-24.json) and [27 October read-only re-verification](evidence/portaldot-native-substrate-reverification-2026-10-27.json)
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

Verigate's contribution is the policy-to-execution architecture: a signed, action-bound authorization is verified at the execution boundary before a supported adapter can submit the action. The PortalDot reference implementation demonstrates this architecture across two distinct execution surfaces, EVM and native Substrate, with explicit trust boundaries.

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

Potential commercial delivery models include hosted policy evaluation and authorization receipts, self-hosted deployments for teams requiring control over policy data, and enterprise integration support. The next milestone is developer-led validation through a reproducible integration and a pilot with an application team.

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
