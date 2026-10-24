# PortalDot Hacker House submission checklist

Updated: 24 October 2026

Event milestones recorded for this project:
- Pre-registration: 29 September 2026, 21:00 (past; informational).
- Submission opened: 13 October 2026, 21:00.
- Final Submission deadline shown in the user's DoraHacks view: 6 November 2026, 09:00 (equivalent to 04:00 UTC when displayed at UTC+5).
- The separate Check-in step was cancelled per the user's current DoraHacks information; do not treat the old 24 October check-in deadline as an open task.
- Live demo day: 8–9 November 2026.
- Community vote: 9 November, 16:00 UTC to 10 November, 16:00 UTC.
- Winner announcement: 11 November 2026.

The DoraHacks page is the controlling view for the final submission deadline. The current account view shows the BUIDL with the updated video and GitHub link; this checklist does not assert that logged-out visibility or full video playback has been independently confirmed. The copy/reference material is in [final submission reference](hacker-house-check-in-copy.md).

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
| Verigate-authorized native Substrate path | Code + offline tests added; public transfer not yet demonstrated | The new adapter verifies exact Verigate `ALLOW` artifacts and offers a read-only `Balances.transfer_keep_alive` preflight, with explicit testnet broadcast only. No native extrinsic was submitted by this change, and this is not DaaS integration. See [native adapter guide](native-substrate-authorized-transfer.md). |
| PortalDot V2 deployment and policy readback | Previously confirmed via configured RPC | [V2 deployment record](evidence/portaldot-v2-deployment-2026-10-22.json). Deployment receipt is no longer returned by that RPC; current runtime code and policy readbacks were reported successful. Do not redeploy to recreate RPC history. |
| Core Verigate ALLOW → bridge signature → PortalDot execution | Live testnet transfer recorded | [V2 live-transfer evidence](evidence/portaldot-v2-live-transfer-2026-10-22.json): receipt status 1, block 149241, one matching TransferExecuted event, recipient and amount 0.1 POT. [Sender-debit reconciliation](evidence/portaldot-v2-cost-reconciliation-2026-10-23.json) records the sender balance change through the configured RPC. |
| Independent verification limits | Explicitly documented | The recorded checks use the configured PortalDot RPC; they do not independently authenticate the RPC operator or use a second provider. The original live verifier did not record the recipient delta or post-transaction nonce state. A later read-only check confirmed the recipient balance increase from `0` to `0.1 POT` and reconciled the sender debit against `gasUsed × effectiveGasPriceWei` in the isolated V2 block, using the configured RPC; no second EVM provider was used. |
| V2 policy negative cases | Live read-only probes passed; window-overflow local only | The published Chromium smoke test checked chain ID `420420777` and the recorded V2 runtime hash, then observed `InvalidRecipient()` for an unlisted recipient and `AmountExceedsCap(amount, cap)` for `0.100000000000000001 POT` against the live `0.1 POT` cap. [Committed browser evidence](evidence/published-dapp-browser-smoke-2026-10-24.json), [workflow](https://github.com/rudimentall1/verigate-portaldot/actions/runs/40071558856). These are one-RPC `eth_call` responses, not mined reverts; no transaction or fee was involved. Window-overflow remains locally tested only. |
| Public DApp | Published and browser-verified | The 24 October Chromium smoke test checked live chain ID, runtime hash, authority signer, policy values, allowlisted recipient, both live read-only denial probes, and the known V2 receipt/event lookup. The machine-readable result is committed in [published-dapp-browser-smoke-2026-10-24.json](evidence/published-dapp-browser-smoke-2026-10-24.json); [workflow run](https://github.com/rudimentall1/verigate-portaldot/actions/runs/40071558856). This uses one configured RPC; the probes are not mined reverts or independent RPC authentication. |
| Demo video under 3 minutes | Published on the BUIDL; final content review still open | The user reports the YouTube demo is published at https://www.youtube.com/watch?v=9WhBdwGgXLk. The inspected working render is 2:54.7, 1920×1080, 30 fps, H.264/AAC. Metadata and sampled frames were checked, but the public upload has not been listened to continuously. The sidecar SRT currently available in working materials still has the earlier wording at cues 4–8 and 46; it may predate the YouTube upload. Verify the actual public cut's voice, burned-in captions and sidecar SRT end-to-end. |
| Presentation | Regenerated and verified | The reproducible 7-slide [Presentation PDF](Verigate-PortalDot-Presentation.pdf) now includes live `InvalidRecipient()` and `AmountExceedsCap` evidence plus trust limitations. Workflow [40072817001](https://github.com/rudimentall1/verigate-portaldot/actions/runs/40072817001) rebuilt and rendered all 7 pages. The separate 10-slide working deck referenced in older video notes is not present in this repo snapshot. |
| Run instructions and architecture | Present | [Architecture](architecture.md), [operations runbook](testnet-operations-2026-10-20.md), [V2 runbook](v2-deployment-runbook.md). |
| License / reused components | Final disclosure review pending | MIT project license; preserve dependency licenses and distinguish existing Verigate components from PortalDot-specific integration work. |
| BUIDL public visibility | Updated in the user's account view; logged-out check remains | The user's current page excerpt confirms the positioning line, current tags (Crypto / Web3, Crypto-AI, Security, Substrate), YouTube URL and GitHub/social links. A logged-out/private-window view is not yet confirmed in this review. The separate Check-in step was cancelled; no action is listed for it. |

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
- Latest verification: [Test](https://github.com/rudimentall1/verigate-portaldot/actions/runs/40072816973), [PortalDot CI](https://github.com/rudimentall1/verigate-portaldot/actions/runs/40072817020), and [PortalDot RPC health](https://github.com/rudimentall1/verigate-portaldot/actions/runs/40072816999) passed on the presentation-source revision; PDF build/render [40072817001](https://github.com/rudimentall1/verigate-portaldot/actions/runs/40072817001) passed. The Test run reported 178 passing Mocha tests; Explorer, DApp/receipt lookup, network-readiness, Substrate-adapter, receipt-quorum and RPC-monitor suites passed, as did isolated Verigate ALLOW/BLOCK integration. A compile step reported `No contracts to compile`, not an independent fresh Solidity compile. Published-browser proof is preserved in [the 24 October JSON report](evidence/published-dapp-browser-smoke-2026-10-24.json), from DApp commit `af41b2f`; that smoke run checked the V2 policy, two live `eth_call` denial branches and the known successful receipt. Testnet evidence uses one RPC, and no transaction was sent by the denial probes.

## Remaining risks and honest-claim rules

1. Watch/listen to the exact public YouTube upload and verify its captions; the link is published and the file is under three minutes, but the final auditory check is not evidenced here.
2. Open the DoraHacks BUIDL, YouTube, GitHub, PDF and DApp in a logged-out/private browser window.
3. Review the final description for correct resettable-interval wording and submit/save the final BUIDL before 6 November 2026, 09:00 as shown in the user's DoraHacks view.
2. The published DApp confirms two deployed-V2 rejection branches through read-only `eth_call`, after checking chain ID and runtime hash. These are not mined reverts, use one RPC, and do not prove that Verigate returned BLOCK for those exact probe inputs. Window-overflow and nonce non-consumption remain local contract tests.
3. The recorded V2 transfer evidence includes recipient and sender balance changes re-queried through the configured RPC. Do not present that as independent verification; no second EVM provider was used.
4. H160-to-SS58 account mapping remains unverified; do not infer it from address conversion or successful EVM execution.
5. Do not claim independent RPC authentication, a second-provider cross-check, a security audit, or production readiness.
6. Never commit `.env`, wallet exports, private keys, mnemonics, or sensitive signed authorizations.
7. Preserve the separate V1 and V2 identities and evidence. Do not redeploy V2 solely because historical RPC receipt lookup is unavailable.
