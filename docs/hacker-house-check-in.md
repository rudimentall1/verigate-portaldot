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
- Current implementation branch: https://github.com/rudimentall1/verigate-portaldot/tree/main
- Live Web3 DApp: https://rudimentall1.github.io/verigate-portaldot/
- DApp source: https://github.com/rudimentall1/verigate-portaldot/blob/main/web3-dapp/index.html

## Requirement matrix

| Requirement | Current status | Evidence / action |
|---|---|---|
| Public GitHub repository | Present | `main` is published and current CI runs succeeded |
| Full README and architecture | Present, being reconciled | README, [architecture](architecture.md), [operations runbook](testnet-operations-2026-10-20.md) |
| Ongoing development history | Present | Preserve dated commits and CI evidence from the event period |
| Product prototype / core workflow | Partially demonstrated | Public read-only DApp shows live contract state; full Verigate ALLOW/BLOCK path verified on isolated loopback EVM |
| PortalDot testnet deployment | Verified | [Deployment evidence](deployment-evidence-2026-10-20.md) |
| Verigate-authorized PortalDot transfer | Minimal amount confirmed | [Receipt and TransferExecuted evidence](authorized-transfer-evidence-2026-10-21.md); amount was one EVM base unit, so non-dust transfer still pending |
| Contract address and transaction hash | Verified and recorded | Address: `0x3f2f484484fbE6e224d058fDfDB6B5A14F09655b`; tx: `0xb1cf9cca75bb029b0a723f13c398479d2c18704c1138c02c6d92a02c1fcdce3c` |
| Explorer link, if available | Generic console available; transaction deep link unverified | https://node-console.portaldot.dev/; do not invent a transaction URL. The live DApp independently reads the current deployed code and signer. |
| Live Web3 DApp preview URL | Deployed as a static GitHub Pages web app | https://rudimentall1.github.io/verigate-portaldot/ (live PortalDot RPC dashboard; read-only state view plus explicit wallet-gated execution of a signed Verigate authorization; not evidence of a transaction until a receipt is recorded)
| Demo URL or video under 3 minutes | **Pending** | Record the product workflow; clearly separate local execution from PortalDot deployment evidence |
| Presentation PDF / public link | Published | https://github.com/rudimentall1/verigate-portaldot/blob/main/docs/Verigate-PortalDot-Presentation.pdf |
| Clear local run instructions | Present | README and operations runbook |
| Third-party sources/licenses disclosed | Review before final submission | MIT project license; retain dependency licenses and disclose pre-existing Verigate components |
| At least three event-period commits | Strong history exists | Keep the original chronology; do not squash away event-period evidence |
| Latest published-main CI | Passed | [Test](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39436673209), [audit](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39436673259), [RPC health](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39436673280), [PortalDot CI](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39436673277), and [Substrate runtime metadata](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39436673332) all succeeded on `f5aee87` |
| DoraHacks build entry | Created; final publish state not independently verified here | https://dorahacks.io/build/50065. Confirm saved fields and public visibility in DoraHacks UI |

## Verified deployment facts

- Network: PortalDot V3 EVM testnet; expected chain ID 420420777.
- Contract: `PortalDotAgentGuard`.
- Address: `0x3f2f484484fbE6e224d058fDfDB6B5A14F09655b`.
- Deployment transaction: `0xb1cf9cca75bb029b0a723f13c398479d2c18704c1138c02c6d92a02c1fcdce3c`.
- Receipt status: `0x1`; block: 116872.
- Runtime bytecode Keccak-256: `0xb3d71ff82b4b654c7bafe855ce13b0dc277627a046e3190f6f6e0ee5eb7f7671`.
- Configured authority signer matches the on-chain `authoritySigner()` readback.
- 156 local tests passed on the deployment workspace. The published `main` also has successful CI jobs; those CI results are separate from the local live RPC re-check.

## Security and honesty requirements

- The initial deployment receipt was captured in the deployment record. On 20 October, the configured RPC still served the contract code and correct signer, but returned `null` for the historical deployment transaction and receipt and failed to serve the old block state. Do not interpret that RPC retention limitation as a failed deployment, a minimal public transfer receipt is now recorded in the 21 October evidence; do not represent the one-base-unit call as a meaningful-value payment.
- The exact H160-to-SS58 mapping for the wallet-displayed EVM address remains unverified.
- Do not claim independent RPC authentication, a meaningful-value transfer based only on the one-base-unit receipt, a security audit, or production readiness.
- Never commit `.env`, `.env.save`, mnemonics, private keys, wallet exports, or sensitive signed authorizations.
- The project uses pre-existing Verigate components and third-party dependencies. Clearly distinguish reused code from the PortalDot-specific work performed during the event.