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
| Mainnet safety guard | Added; CI passed 23 Oct 2026 | V1/V2 deployment entrypoints and explicit transaction-broadcast/funding paths require EVM chain ID `420420777` and pin the write RPC host to `test-evm-rpc-v3.portaldot.dev`; local read-only simulation remains available. See [V2 runbook safety model](v2-deployment-runbook.md#safety-model). |
| PortalDot Mainnet V3.0 rollout | Monitoring only; no project mainnet deployment | Updated network-endpoints notice supplied 23 Oct schedules rollout for 23 Oct 2026 at 23:00 UTC (24 Oct 01:00 Europe/Berlin). The notice confirms Mainnet explorer, Node Console and bridge URLs but still omits Mainnet EVM RPC, EVM chain ID and Mainnet Substrate WSS. Do not change networks or use Mainnet claims without those identity parameters and read-only verification. See [network watch](portaldot-v3-network.md#mainnet-v30-rollout-watch--network-endpoints-notice-supplied-23-october-2026). |
| PortalDot V2 deployment and policy readback | Previously confirmed via configured RPC | [V2 deployment record](evidence/portaldot-v2-deployment-2026-10-22.json). Deployment receipt is no longer returned by that RPC; current runtime code and policy readbacks were reported successful. Do not redeploy to recreate RPC history. |
| Core Verigate ALLOW → bridge signature → PortalDot execution | Live testnet transfer recorded | [V2 live-transfer evidence](evidence/portaldot-v2-live-transfer-2026-10-22.json): receipt status 1, block 149241, one matching TransferExecuted event, recipient and amount 0.1 POT. [Sender-debit reconciliation](evidence/portaldot-v2-cost-reconciliation-2026-10-23.json) records the sender balance change through the configured RPC. |
| Independent verification limits | Explicitly documented | The recorded checks use the configured PortalDot RPC; they do not independently authenticate the RPC operator or use a second provider. The original live verifier did not record the recipient delta or post-transaction nonce state. A later read-only check confirmed the recipient balance increase from `0` to `0.1 POT` and reconciled the sender debit against `gasUsed × effectiveGasPriceWei` in the isolated V2 block, using the configured RPC; no second EVM provider was used. |
| V2 policy negative cases | Local tests exist; live negative cases not verified | [V2 contract tests](../test/PortalDotAgentGuardV2.test.js) cover over-cap transfer, time-window cap overflow, and nonce non-consumption on revert. Do not describe those tests as live testnet evidence. |
| Public DApp | Published, read-only view with transaction lookup | Use the V2 guard URL above. The receipt lookup accepts any 32-byte EVM transaction hash and checks transaction/receipt/block consistency through the configured RPC. The page is deployed and the clean Chromium smoke test passed in Pages run [39942560216](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39942560216), including live policy readback and the known V2 receipt/event lookup. Evidence is saved in [published-dapp-browser-smoke-2026-10-23.json](evidence/published-dapp-browser-smoke-2026-10-23.json). This uses one RPC and is not an independent provider check. Dashboard state is not itself proof of Verigate ALLOW or independent RPC authentication. |
| Demo video under 3 minutes | Working draft rendered; final pass required | User-provided MP4 is 2:39 at 1920×1080, 30 fps, H.264/AAC. The [replacement V1/V2 outro card](media/portaldot-v1-v2-outro.svg) and [video edit brief](video-edit-brief.md) are now versioned. The MP4 still needs the new card/narration rendered, the architecture-scene subtitle overlap fixed, and a full audio/subtitle timing review. |
| Presentation | Published; source being refreshed | [Presentation PDF](Verigate-PortalDot-Presentation.pdf). The repository's reproducible deck has 7 slides; the separate 10-slide working deck described in the video notes is not present in this repository snapshot. |
| Run instructions and architecture | Present | [Architecture](architecture.md), [operations runbook](testnet-operations-2026-10-20.md), [V2 runbook](v2-deployment-runbook.md). |
| License / reused components | Final disclosure review pending | MIT project license; preserve dependency licenses and distinguish existing Verigate components from PortalDot-specific integration work. |
| DoraHacks check-in visibility | Not independently confirmed | Open the build entry and verify saved fields/public visibility in the DoraHacks UI. Do not assume a GitHub commit completes check-in. |

See [claims-to-verify.md](../claims-to-verify.md) for approved wording and prohibited overclaims.

## Current live V2 facts

- Network: PortalDot V3 EVM testnet; chain ID `420420777`.
- Guard: `PortalDotAgentGuardV2`.
- Address: `0x87C494a5e4B0A8E055F283767579667E10E046C6`.
- Runtime code hash recorded: `0x010a565cad83a33442d0f23f6fcb6f605a76082a5b58434813bedf84c54f0859`.
- Deployment transaction recorded: `0x331c1fc027da51af26ed5ee92ef22a8250fe4efdf0d84526f5fe2203f5d3494b`, block 148397. Historical receipt availability later failed on the configured RPC; the current code/configuration readback was reported successful.
- Initial policy: 0.1 POT maximum per transfer, 0.5 POT per resettable 3600-second interval, initial recipient allowlisted.
- Successful live transfer: `0xaf3df785fdeaf85bbc9af2ae1342a7c664f4a55877469c4996eff2fe90f5551e`, block 149241, amount 0.1 POT, one matching `TransferExecuted` event. Sender debit: 7.82782148139542551 POT, reconciled against sender balance before/after the isolated block through the configured RPC. The runtime cost was not split into execution-fee and storage-deposit components. See [cost reconciliation](evidence/portaldot-v2-cost-reconciliation-2026-10-23.json).
- The transfer was preceded by a fresh Verigate `ALLOW`, bridge signature, pre-broadcast re-simulation, refreshed gas quote and fee-budget check.
- Latest main CI on commit `132d7dfc9cd96c452c441764af621ff349c4d80e`: [Test](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39946722124), [PortalDot CI](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39946722238), and [PortalDot RPC health](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39946722047) completed successfully. The local ALLOW/BLOCK integration now uses a synthetic Substrate genesis response inside the isolated local EVM run; it no longer depends on public Substrate RPC availability and is not testnet evidence. [GitHub Pages deployment](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39919152732) and [seven-page presentation build/render](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39919858927) also passed on their source commits. CI does not replace live transaction evidence, external user validation, or the pending demo video.

## Remaining risks and honest-claim rules

1. Produce the sub-3-minute demo; this is the clearest remaining submission gap.
2. If broader policy enforcement is claimed, separately verify live over-cap and time-window cap reverts and nonce behavior. Local tests alone are insufficient for a live claim.
3. Measure recipient balance before/after only if needed for the final demo; the current transfer evidence does not claim that measurement.
4. H160-to-SS58 account mapping remains unverified; do not infer it from address conversion or successful EVM execution.
5. Do not claim independent RPC authentication, a second-provider cross-check, a security audit, or production readiness.
6. Never commit `.env`, wallet exports, private keys, mnemonics, or sensitive signed authorizations.
7. Preserve the separate V1 and V2 identities and evidence. Do not redeploy V2 solely because historical RPC receipt lookup is unavailable.
