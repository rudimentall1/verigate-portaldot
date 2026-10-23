# DoraHacks submission draft: Verigate PortalDot

**Status (updated 2026-10-23):** V1 and V2 are deployed on PortalDot V3 testnet. V2 is `PortalDotAgentGuardV2` at `0x87C494a5e4B0A8E055F283767579667E10E046C6`; its runtime code hash and configuration readback are recorded in [`docs/evidence/portaldot-v2-deployment-2026-10-22.json`](evidence/portaldot-v2-deployment-2026-10-22.json). A real Verigate `ALLOW` was converted by the V2 bridge into a signed action and executed as a `0.1 POT` transfer in block `149241`; the read-only follow-up verifier reported receipt status `1` and exactly one matching `TransferExecuted` event. The reported fee was `7.82782148139542551 POT`. Full evidence: [`docs/evidence/portaldot-v2-live-transfer-2026-10-22.json`](evidence/portaldot-v2-live-transfer-2026-10-22.json). This verification used the configured PortalDot RPC; it is not independent authentication of that RPC operator. The recipient balance delta has not been measured, no second EVM RPC provider was used, and the EVM genesis hash pin was not configured for this transfer. This is testnet evidence, not an audit or production-readiness claim.

**CI and DApp deployment for code commit `1dd1660` (2026-10-23):** `Test`, `PortalDot CI`, `PortalDot RPC health`, and `Deploy Web3 DApp to GitHub Pages` all completed successfully: [Test](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39909025944), [PortalDot CI](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39909025871), [RPC health](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39909025896), [Pages deployment](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39909025904). The source now defaults to V2 and validates the expected V2 runtime hash and live policy reads in the page code. A clean-browser visual check of the published page has not yet been performed. The demo video is still pending. DoraHacks build entry: [50065](https://dorahacks.io/build/50065); confirm saved/published state in the DoraHacks UI.

## Submission fields

**Project name:** Verigate PortalDot

**Recommended track:** Modular Cloud & Middleware

This is the closest fit because the project provides a reusable authorization and execution middleware layer. It is not a node monitoring dashboard, nor does it yet implement a bridge between independent chains.

**One-line description**

Verigate PortalDot is open-source authorization middleware that turns a signed Verigate ALLOW decision into a short-lived, exact-amount EIP-712 payment authorization enforced by a dedicated Solidity guard on PortalDot V3.

**Project description**

AI agents can propose payments, but a proposal should not grant spending authority. The current demonstration uses `PortalDotAgentGuardV2` on PortalDot V3 EVM testnet. Verigate evaluates the action off-chain; the bridge verifies the Verigate authorization and signs an exact, short-lived EIP-712 transfer authorization. V2 checks the recipient allowlist, per-transfer maximum, configured time-window cap, deadline and nonce before transferring native POT from the guard's own balance.

The V2 policy recorded in deployment evidence allows one configured recipient, limits a transfer to `0.1 POT`, and sets a `0.5 POT` cap for a `3,600-second` resettable interval. The spending counter resets when the configured interval expires; this is not a continuously sliding rolling-window calculation. The administrator can change the allowlist and policy, so the caps are not immutable limits against a compromised administrator.

A real `0.1 POT` V2 transfer is recorded in block `149241`, with a successful receipt and one matching `TransferExecuted` event reported by a separate read-only query to the configured PortalDot RPC. The reported fee was `7.82782148139542551 POT`. No second EVM RPC provider was used, the recipient balance delta was not measured by the recorded verifier, and the public-testnet negative cases for recipient/cap violations are not established by this transfer. Those negative cases have local Solidity-test evidence.

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
- **V2 live transfer:** `0xaf3df785fdeaf85bbc9af2ae1342a7c664f4a55877469c4996eff2fe90f5551e`, block `149241`, amount `0.1 POT`, receipt status `1`, reported actual fee `7.82782148139542551 POT`
- **Deployment transaction:** `0xb1cf9cca75bb029b0a723f13c398479d2c18704c1138c02c6d92a02c1fcdce3c`
- **Receipt:** success (`0x1`), block `116872`
- **Initial minimal authorized transfer:** transaction 0xbe3ade2ba3209cf0df3647cea50fb6608a77bb837213a25b8ec419fa9914cc14 at block 130741; the original record documents the one-base-unit `TransferExecuted` event.
- **Non-dust authorized transfer:** transaction 0x21acff99d30652161f7e4ba6e1d76e6b6b67e8b9e02b09edd64d8bd7f2d5dd9c at block 132475; executor reports `transfer_executed`, `TransferExecuted` confirmed, and guard balance decreased exactly 0.1 EVM POT. This is recorded from terminal output; read-only receipt/event re-query and recipient/relayer balance reconciliation are complete against the configured RPC; the EVM genesis pin is not configured and no second provider was used.
- **Runtime bytecode Keccak-256:** `0xb3d71ff82b4b654c7bafe855ce13b0dc277627a046e3190f6f6e0ee5eb7f7671`
- **Recorded validation:** the merged PR CI run reported `171 passing` Hardhat tests; the compile step, network smoke test, dependency audit and isolated Verigate ALLOW/BLOCK integration also passed. The compile step reported `No contracts to compile` because Hardhat had compiled during the test step; this is not being presented as an independent fresh compilation.
- **Isolated end-to-end test:** Verigate returned ALLOW for the permitted case and BLOCK for the denied case. Signatures were verified; the guard's real Solidity source executed the exact authorized transfer on a temporary loopback Hardhat EVM. This is local integration evidence, not a public PortalDot transfer.

## Why PortalDot

PortalDot V3 offers an EVM-compatible deployment target for a narrow, reusable spending guard while retaining Substrate runtime information needed for operational preflight. This allows developers to reuse Solidity/EIP-712 patterns without treating a connected agent or the RPC endpoint as an authority by itself. The current contribution is an execution-control middleware component, deployment/operations tooling, and reproducible local ALLOW/BLOCK evidence.

## Current limitations (disclose, do not hide)

1. V1 and V2 are deployed on PortalDot V3 testnet. The V2 live transfer receipt and `TransferExecuted` event were re-queried through the configured RPC, but no second RPC provider or EVM-genesis pin was used. The V2 recipient balance delta has not been separately measured.
2. The specific H160-to-SS58 mapping for the wallet-displayed address has not been confirmed by the runtime storage lookup. The deployment evidence explicitly records this limitation.
3. The public RPC's reported chain/genesis values are consistency checks, not independent authentication of the RPC operator.
4. This is a testnet prototype, not a production deployment or independent security audit.
5. The V2 allowlist, per-transfer cap and resettable time-window cap are confirmed by deployment/configuration readback, and the positive transfer path has public testnet evidence. Negative cap/window behavior is currently proven by local contract tests rather than paid public-chain revert transactions. The recipient balance delta has not been separately measured. The end-user demo recording has not yet been added; do not submit a placeholder or present the static slide preview as a live demo.

## Remaining before submitting

- [x] Publish the implementation on `main`; verify the repository and current CI runs are publicly accessible.
- [x] Merge the read-only dashboard source and complete the GitHub Pages deployment workflow. [ ] Verify the published page in a clean browser at the V2 guard URL and confirm live RPC reads of the deployed V2 configuration.
- [ ] Add the short live/demo recording (under 3 minutes) showing the real product behavior and clearly separating local simulation from testnet deployment evidence. **Still pending.**
- [x] Presentation PDF is published in the repository. (This is not the demo video.)
- [ ] Enter the final repository, deployment address, transaction hash, demo link, and PDF/public presentation link in DoraHacks.
- [ ] Confirm the account/team registration is complete and the submission is actually visible on DoraHacks.

## Development provenance and intellectual property

The submission should distinguish existing Verigate components from work specifically added for this hackathon. Disclose the pre-existing open-source components and third-party SDKs/dependencies used; the repository's MIT license remains in place. Do not imply that all of Verigate originated during the event. Preserve dated commits and CI records showing the work done during the 14 October–6 November build period.

## Suggested build update

Verigate PortalDot has V1 and V2 guards deployed on PortalDot V3 testnet, a public read-only DApp, and local ALLOW/BLOCK integration evidence. The V2 path completed a real `0.1 POT` transfer after Verigate returned `ALLOW`; the receipt and matching `TransferExecuted` event were re-queried successfully in block `149241`. The reported actual fee was `7.82782148139542551 POT`. Main-branch `Test`, `PortalDot CI`, `PortalDot RPC health`, and GitHub Pages deployment passed for code commit `1dd1660` (workflow links are listed in the status section above). Remaining work is the short demo recording, a clean-browser check of the published V2 dashboard, and optionally a recipient-balance-delta read. The EVM genesis pin and a second-provider cross-check remain absent; negative cap/window behavior is covered by local tests, not a live paid revert test.
