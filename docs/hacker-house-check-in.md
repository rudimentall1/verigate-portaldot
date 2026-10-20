# PortalDot Hacker House submission checklist

Updated: 20 October 2026

Event milestones from the published rules supplied for this project:
- Registration/check-in deadline: 24 October 2026, 12:00 UTC.
- Final submission and code freeze: 6 November 2026, 04:00 UTC.
- Live demo day: 8–9 November 2026.
- Community vote: 9 November, 16:00 UTC to 10 November, 16:00 UTC.
- Winner announcement: 11 November 2026.

Reconfirm deadlines on the [DoraHacks event page](https://dorahacks.io/hackathon/2362/detail) and announcements in the [official PortalDot Discord](https://discord.gg/portaldot). Times above are taken from the event information provided for this review.

## Project and track

- Project: Verigate PortalDot.
- Recommended track: **Modular Cloud Solutions and Middleware**. This best matches the reusable authorization bridge and execution-control middleware. Do not describe the current product as a multi-chain asset bridge or node-monitoring product.
- Public repository: https://github.com/rudimentall1/verigate-portaldot
- Current implementation branch: https://github.com/rudimentall1/verigate-portaldot/tree/chore/hardhat3-migration-preview

## Requirement matrix

| Requirement | Current status | Evidence / action |
|---|---|---|
| Public GitHub repository | Present | Confirm latest commit/branch is published before submission |
| Full README and architecture | Present, being reconciled | README, [architecture](architecture.md), [operations runbook](testnet-operations-2026-10-20.md) |
| Ongoing development history | Present | Preserve dated commits and CI evidence from the event period |
| Product prototype / core workflow | Partially demonstrated | Contract deployed; full Verigate ALLOW/BLOCK path verified on isolated loopback EVM |
| PortalDot testnet deployment | Verified | [Deployment evidence](deployment-evidence-2026-10-20.md) |
| Contract address and transaction hash | Verified and recorded | Address: `0x3f2f484484fbE6e224d058fDfDB6B5A14F09655b`; tx: `0xb1cf9cca75bb029b0a723f13c398479d2c18704c1138c02c6d92a02c1fcdce3c` |
| Explorer link, if available | Entry point prepared | https://node-console.portaldot.dev/; confirm whether this console exposes a public transaction detail URL |
| Demo URL or video under 3 minutes | **Pending by request** | Record later; do not treat slide deck as demo evidence |
| Presentation PDF / public link | To be attached | Use the presentation PDF prepared for submission |
| Clear local run instructions | Present | README and operations runbook |
| Third-party sources/licenses disclosed | Review before final submission | MIT project license; retain dependency licenses and disclose pre-existing Verigate components |
| At least three event-period commits | Strong history exists | Keep the original chronology; do not squash away event-period evidence |
| Latest implementation-tree CI | Passed on the validated tree | [Test](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39434604693), [audit](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39434604930), [RPC health](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39434604789), [PortalDot CI](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39434605116), and [Substrate runtime metadata](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39434604965) succeeded; tree was unchanged by the branch-parent reconciliation |
| DoraHacks build submission sent | Not yet confirmed | Submit after demo link is available and required fields are complete |

## Verified deployment facts

- Network: PortalDot V3 EVM testnet; expected chain ID 420420777.
- Contract: `PortalDotAgentGuard`.
- Address: `0x3f2f484484fbE6e224d058fDfDB6B5A14F09655b`.
- Deployment transaction: `0xb1cf9cca75bb029b0a723f13c398479d2c18704c1138c02c6d92a02c1fcdce3c`.
- Receipt status: `0x1`; block: 116872.
- Runtime bytecode Keccak-256: `0xb3d71ff82b4b654c7bafe855ce13b0dc277627a046e3190f6f6e0ee5eb7f7671`.
- Configured authority signer matches the on-chain `authoritySigner()` readback.
- 156 local tests passed on the deployment workspace. Do not describe these as the latest public CI result until CI is run on the published head.

## Security and honesty requirements

- The successful testnet contract deployment is real; the end-to-end transfer receipt is from a local loopback EVM.
- The exact H160-to-SS58 mapping for the wallet-displayed EVM address remains unverified.
- Do not claim an independent RPC authentication, public PortalDot transfer, security audit, or production readiness.
- Never commit `.env`, `.env.save`, mnemonics, private keys, wallet exports, or sensitive signed authorizations.
- The project uses pre-existing Verigate components and third-party dependencies. Clearly distinguish reused code from the PortalDot-specific work performed during the event.