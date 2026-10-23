# PortalDot Hacker House submission checklist

Updated: 23 October 2026

Event milestones recorded for this project:
- Registration/check-in deadline: 24 October 2026, 12:00 UTC.
- Final submission and code freeze: 6 November 2026, 04:00 UTC.
- Live demo day: 8–9 November 2026.
- Community vote: 9 November, 16:00 UTC to 10 November, 16:00 UTC.
- Winner announcement: 11 November 2026.

Reconfirm deadlines on the [DoraHacks event page](https://dorahacks.io/hackathon/2362/detail) and announcements in the [official PortalDot Discord](https://discord.gg/portaldot).

## Project and track

- Project: Verigate PortalDot.
- Recommended track: **Modular Cloud Solutions and Middleware**. The product is authorization-to-execution middleware, not a multi-chain asset bridge or node-monitoring product.
- Public repository: https://github.com/rudimentall1/verigate-portaldot
- Current branch: https://github.com/rudimentall1/verigate-portaldot/tree/main
- Public DApp: https://rudimentall1.github.io/verigate-portaldot/
- V2 guard view: https://rudimentall1.github.io/verigate-portaldot/?guard=0x87C494a5e4B0A8E055F283767579667E10E046C6
- DApp source: https://github.com/rudimentall1/verigate-portaldot/blob/main/web3-dapp/index.html
- DoraHacks entry: https://dorahacks.io/build/50065

## Proof-first status

| Requirement | Status | Evidence / remaining action |
|---|---|---|
| Public repository and development history | Present | Main has event-period commits and current CI runs. |
| PortalDot V1 deployment | Testnet evidence recorded | [V1 deployment evidence](deployment-evidence-2026-10-20.md); V1 remains separate and must not be relabelled as V2. |
| PortalDot V2 deployment and policy readback | Previously confirmed via configured RPC | [V2 deployment record](evidence/portaldot-v2-deployment-2026-10-22.json). Deployment receipt is no longer returned by that RPC; current runtime code and policy readbacks were reported successful. Do not redeploy to recreate RPC history. |
| Core Verigate ALLOW → bridge signature → PortalDot execution | Live testnet transfer recorded | [V2 live-transfer evidence](evidence/portaldot-v2-live-transfer-2026-10-22.json): receipt status 1, block 149241, exactly one matching `TransferExecuted` event, recipient and amount 0.1 POT. |
| Independent verification limits | Explicitly documented | The recorded checks use the configured PortalDot RPC; they do not independently authenticate the RPC operator or use a second provider. The recipient balance delta and post-transaction nonce state were not recorded by the live verifier. A later read-only check reconciled the sender's EVM-balance decrease in the isolated V2 transaction block against `gasUsed × effectiveGasPriceWei` using the configured RPC; no second EVM provider was used. |
| V2 policy negative cases | Local tests exist; live negative cases not verified | [V2 contract tests](../test/PortalDotAgentGuardV2.test.js) cover over-cap transfer, time-window cap overflow, and nonce non-consumption on revert. Do not describe those tests as live testnet evidence. |
| Public DApp | Published, read-only view | Use the V2 guard URL above. Dashboard state is not itself proof that Verigate authorized or executed a transaction. |
| Demo video under 3 minutes | **Pending** | Record one real ALLOW → V2 receipt path and one meaningful blocked/rejected case. Clearly label local tests versus live testnet evidence. |
| Presentation | Published | [Presentation PDF](Verigate-PortalDot-Presentation.pdf). |
| Run instructions and architecture | Present | [Architecture](architecture.md), [operations runbook](testnet-operations-2026-10-20.md), [V2 runbook](v2-deployment-runbook.md). |
| License / reused components | Final disclosure review pending | MIT project license; preserve dependency licenses and distinguish existing Verigate components from PortalDot-specific integration work. |
| DoraHacks check-in visibility | Not independently confirmed | Open the build entry and verify saved fields/public visibility in the DoraHacks UI. Do not assume a GitHub commit completes check-in. |

## Current live V2 facts

- Network: PortalDot V3 EVM testnet; chain ID `420420777`.
- Guard: `PortalDotAgentGuardV2`.
- Address: `0x87C494a5e4B0A8E055F283767579667E10E046C6`.
- Runtime code hash recorded: `0x010a565cad83a33442d0f23f6fcb6f605a76082a5b58434813bedf84c54f0859`.
- Deployment transaction recorded: `0x331c1fc027da51af26ed5ee92ef22a8250fe4efdf0d84526f5fe2203f5d3494b`, block 148397. Historical receipt availability later failed on the configured RPC; the current code/configuration readback was reported successful.
- Initial policy: 0.1 POT maximum per transfer, 0.5 POT per resettable 3600-second interval, initial recipient allowlisted.
- Successful live transfer: `0xaf3df785fdeaf85bbc9af2ae1342a7c664f4a55877469c4996eff2fe90f5551e`, block 149241, amount 0.1 POT, one matching `TransferExecuted` event. Sender debit: 7.82782148139542551 POT, reconciled against sender balance before/after the isolated block through the configured RPC. The runtime cost was not split into execution-fee and storage-deposit components. See [cost reconciliation](evidence/portaldot-v2-cost-reconciliation-2026-10-23.json).
- The transfer was preceded by a fresh Verigate `ALLOW`, bridge signature, pre-broadcast re-simulation, refreshed gas quote and fee-budget check.
- Current CI on commit `0133188cbe8bca6de06e72794a1da8e4d7a2b672`: Test, PortalDot CI, PortalDot RPC health, and Explorer live smoke check workflows reported success. These checks do not replace the live transaction evidence or the pending demo video.

## Remaining risks and honest-claim rules

1. Produce the sub-3-minute demo; this is the clearest remaining submission gap.
2. If broader policy enforcement is claimed, separately verify live over-cap and time-window cap reverts and nonce behavior. Local tests alone are insufficient for a live claim.
3. Measure recipient balance before/after only if needed for the final demo; the current transfer evidence does not claim that measurement.
4. H160-to-SS58 account mapping remains unverified; do not infer it from address conversion or successful EVM execution.
5. Do not claim independent RPC authentication, a second-provider cross-check, a security audit, or production readiness.
6. Never commit `.env`, wallet exports, private keys, mnemonics, or sensitive signed authorizations.
7. Preserve the separate V1 and V2 identities and evidence. Do not redeploy V2 solely because historical RPC receipt lookup is unavailable.
