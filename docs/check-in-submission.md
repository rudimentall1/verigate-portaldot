# DoraHacks submission draft: Verigate PortalDot

**Status:** the public repository, deployed testnet guard, live Web3 DApp with wallet-gated signed execution, local test suite and presentation PDF are available. A 0.1 EVM POT Verigate-authorized transfer was reported as executed by the executor; its output confirms `TransferExecuted` and a matching decrease in guard balance. Independent receipt re-query and a separate recipient post-balance snapshot remain outstanding. The under-three-minute demo video is still pending. The DoraHacks build entry is [50065](https://dorahacks.io/build/50065); confirm the final saved/published state in the DoraHacks UI.

## Submission fields

**Project name:** Verigate PortalDot

**Recommended track:** Modular Cloud Solutions and Middleware

This is the closest fit because the project provides a reusable authorization and execution middleware layer. It is not a node monitoring dashboard, nor does it yet implement a bridge between independent chains.

**One-line description**

Verigate PortalDot is open-source authorization middleware that turns a signed Verigate ALLOW decision into a short-lived, exact-amount EIP-712 payment authorization enforced by a dedicated Solidity guard on PortalDot V3.

**Project description**

AI agents can propose payments, but a proposal should not grant spending authority. Verigate PortalDot checks signed decision and execution-authorization artifacts off-chain, binds the approved action to one recipient and exact base-unit amount, and creates a short-lived EIP-712 authorization for a minimal PortalDot EVM contract. The guard rejects invalid signatures, altered recipients or amounts, expired authorizations, and replayed nonces. The executor validates the configured network and deployed code, simulates before broadcast, and requires explicit opt-in to send a transaction.

The project makes use of PortalDot V3's EVM-compatible execution environment for the Solidity guard and records separate Substrate runtime/genesis checks for network-configuration hardening. It does not claim that the contract itself verifies Verigate's Ed25519 signatures: that trust boundary remains in the off-chain bridge.

## Status and evidence

- **Public repository:** https://github.com/rudimentall1/verigate-portaldot
- **Implementation branch:** https://github.com/rudimentall1/verigate-portaldot/tree/main
- **Live Web3 DApp:** https://rudimentall1.github.io/verigate-portaldot/
- **DApp source:** https://github.com/rudimentall1/verigate-portaldot/blob/main/web3-dapp/index.html
- **Architecture:** [docs/architecture.md](architecture.md)
- **Presentation PDF:** [Verigate-PortalDot-Presentation.pdf](Verigate-PortalDot-Presentation.pdf)
- **Testnet deployment evidence:** [docs/deployment-evidence-2026-10-20.md](deployment-evidence-2026-10-20.md)
- **Initial minimal public transfer evidence:** [docs/authorized-transfer-evidence-2026-10-21.md](authorized-transfer-evidence-2026-10-21.md)
- **Non-dust 0.1 EVM POT transfer evidence:** [docs/authorized-transfer-evidence-2026-10-21-nondust.md](authorized-transfer-evidence-2026-10-21-nondust.md)
- **Operations runbook:** [docs/testnet-operations-2026-10-20.md](testnet-operations-2026-10-20.md)
- **PortalDot node console:** https://node-console.portaldot.dev/
- **EVM chain ID:** `420420777`
- **Contract:** `PortalDotAgentGuard`
- **Contract address:** `0x3f2f484484fbE6e224d058fDfDB6B5A14F09655b`
- **Deployment transaction:** `0xb1cf9cca75bb029b0a723f13c398479d2c18704c1138c02c6d92a02c1fcdce3c`
- **Receipt:** success (`0x1`), block `116872`
- **Initial minimal authorized transfer:** transaction 0xbe3ade2ba3209cf0df3647cea50fb6608a77bb837213a25b8ec419fa9914cc14 at block 130741; the original record documents the one-base-unit `TransferExecuted` event.
- **Non-dust authorized transfer:** transaction 0x21acff99d30652161f7e4ba6e1d76e6b6b67e8b9e02b09edd64d8bd7f2d5dd9c at block 132475; executor reports `transfer_executed`, `TransferExecuted` confirmed, and guard balance decreased exactly 0.1 EVM POT. This is recorded from terminal output; independent receipt re-query and a separate recipient post-balance snapshot remain outstanding.
- **Runtime bytecode Keccak-256:** `0xb3d71ff82b4b654c7bafe855ce13b0dc277627a046e3190f6f6e0ee5eb7f7671`
- **Local validation:** 156 tests passed on the server workspace; network preflight and RPC monitor passed on 20 October 2026. GitHub Actions test, integration, audit, RPC health, PortalDot CI and runtime metadata jobs passed on published `main`.
- **Isolated end-to-end test:** Verigate returned ALLOW for the permitted case and BLOCK for the denied case. Signatures were verified; the guard's real Solidity source executed the exact authorized transfer on a temporary loopback Hardhat EVM. This is local integration evidence, not a public PortalDot transfer.

## Why PortalDot

PortalDot V3 offers an EVM-compatible deployment target for a narrow, reusable spending guard while retaining Substrate runtime information needed for operational preflight. This allows developers to reuse Solidity/EIP-712 patterns without treating a connected agent or the RPC endpoint as an authority by itself. The current contribution is an execution-control middleware component, deployment/operations tooling, and reproducible local ALLOW/BLOCK evidence.

## Current limitations (disclose, do not hide)

1. The contract is deployed on PortalDot V3 testnet and its runtime code hash and authority signer are recorded. A minimal one-base-unit call and a non-dust 0.1 EVM POT transfer are documented. The executor output for the non-dust transfer reports the expected guard-balance delta and `TransferExecuted`; independent receipt re-query and recipient post-balance evidence remain outstanding.
2. The specific H160-to-SS58 mapping for the wallet-displayed address has not been confirmed by the runtime storage lookup. The deployment evidence explicitly records this limitation.
3. The public RPC's reported chain/genesis values are consistency checks, not independent authentication of the RPC operator.
4. This is a testnet prototype, not a production deployment or independent security audit.
5. The end-user demo recording has not yet been added. Do not submit a placeholder or present the static slide preview as a live demo.

## Remaining before submitting

- [x] Publish the implementation on `main`; verify the repository and current CI runs are publicly accessible.
- [x] Add a public Web3 DApp with live PortalDot RPC reads and explicit wallet-gated execution of bridge-signed authorizations; transaction evidence is recorded separately.
- [ ] Add the short live/demo recording (under 3 minutes) showing the real product behavior and clearly separating local simulation from testnet deployment evidence. **Still pending.**
- [x] Presentation PDF is published in the repository. (This is not the demo video.)
- [ ] Enter the final repository, deployment address, transaction hash, demo link, and PDF/public presentation link in DoraHacks.
- [ ] Confirm the account/team registration is complete and the submission is actually visible on DoraHacks.

## Development provenance and intellectual property

The submission should distinguish existing Verigate components from work specifically added for this hackathon. Disclose the pre-existing open-source components and third-party SDKs/dependencies used; the repository's MIT license remains in place. Do not imply that all of Verigate originated during the event. Preserve dated commits and CI records showing the work done during the 14 October–6 November build period.

## Suggested build update

Verigate PortalDot has a deployed PortalDot V3 testnet guard, a public Web3 DApp with live RPC reads and an explicit wallet-gated execution panel, documented deployment evidence and passing GitHub Actions checks. Both a minimal call and a 0.1 EVM POT transfer are recorded; the non-dust executor output reports `TransferExecuted` and the expected guard-balance decrease. Remaining live evidence includes an independent receipt re-query, a separate post-transaction recipient-balance snapshot, and negative-path testing. The under-three-minute demo video remains pending.
