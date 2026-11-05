# PortalDot Hacker House 2026 — final submission reference

Updated: 5 November 2026 after reviewing the current BUIDL text and repository evidence. This is the reference copy for final submission. The separate Check-in step is recorded as cancelled; the Final Submission deadline shown in the account is 6 November 2026 at 09:00.

## Project name

Verigate PortalDot

## Current public positioning line

Policy authorization and spending controls for AI-agent payments on PortalDot V3

## Submission tags

Crypto / Web3; Crypto-AI; Security; Substrate

## One-line description

Verigate checks whether an AI agent is allowed to take a specific action. In this PortalDot V3 testnet integration, the decision is checked before a payment is submitted: the EVM guard enforces recipient and spending limits on funds held by the guard, while a separate native Substrate adapter checks the signed decision before submitting a native transfer.

## Short project description

An AI agent can prepare a valid payment without having the authority to approve it. Verigate checks the proposed action against the application's policy and issues a signed ALLOW, WARN or BLOCK decision. For an approved EVM payment, the bridge verifies Verigate's Ed25519-signed artifacts and creates a short-lived EIP-712 authorization tied to the recipient, amount, nonce, deadline and action ID. PortalDotAgentGuardV2 verifies that authorization and checks the recipient allowlist and spending limits before transferring POT held by the contract.

The recorded EVM testnet flow transferred 0.1 POT in block 149241 and produced a successful receipt with one matching TransferExecuted event. The public dashboard also demonstrates two read-only rejection checks against the deployed contract. The saved native Substrate execution record reports a Verigate ALLOW, a successful pre-broadcast `system_dryRun`, and a 0.1 POT `Balances.transfer_keep_alive` finalized in block 175489 with one matching `balances.Transfer` event. A later read-only re-query through the same configured Substrate RPC matched the transaction, signer, recipient, amount and event. No second provider was used, and the saved evidence bundle does not contain the original Ed25519 artifacts for independent signature re-verification. This is a separate adapter path, not an extension of the EVM guard; the Substrate runtime does not verify Verigate's signature, and direct extrinsics outside the adapter are not covered. Both the EVM and Substrate evidence use one configured RPC each, with no second-provider confirmation. This is a testnet reference implementation, not a global wallet firewall, DaaS integration, security audit or production deployment.

The deployed V2 policy allows configured recipients, caps each transfer at 0.1 POT, and sets a 0.5 POT limit for a resettable 3,600-second interval. The counter resets after the interval expires; it is not a sliding rolling-window sum. The contract administrator can change the recipient allowlist and spending limits.

## Project provenance and licensing disclosure

This project builds on the pre-existing Verigate policy engine. The PortalDot-specific integration in this repository includes the bridge authorization path, the V2 EVM guard, the read-only DApp/receipt lookup and the testnet verification tooling. The project does not claim that all Verigate components originated during this hackathon. The repository is MIT-licensed; third-party dependency licenses remain applicable.

## Track

The selected hackathon track is a separate BUIDL field; confirm that it is set to **Modular Cloud & Middleware**. The Substrate tag does not determine the track.

## Canonical demo link

**Demo URL (use this exact URL in DoraHacks and all submission materials; do not replace it with the site root or another query variant):**

https://rudimentall1.github.io/verigate-portaldot/?guard=0x87C494a5e4B0A8E055F283767579667E10E046C6

The URL opens the deployed V2 guard dashboard directly. It is read-only and does not require a wallet connection or transaction.

## Other project links

- Demo video (separate video field): https://www.youtube.com/watch?v=9WhBdwGgXLk
- Repository: https://github.com/rudimentall1/verigate-portaldot
- V2 guard: `0x87C494a5e4B0A8E055F283767579667E10E046C6`
- Successful transaction hash: `0xaf3df785fdeaf85bbc9af2ae1342a7c664f4a55877469c4996eff2fe90f5551e`
- Block: `149241`
- Recorded transaction evidence: https://github.com/rudimentall1/verigate-portaldot/blob/main/docs/evidence/portaldot-v2-live-transfer-2026-10-22.json
- Live denial-probe evidence (read-only `eth_call`, not mined reverts): https://github.com/rudimentall1/verigate-portaldot/blob/main/docs/evidence/published-dapp-browser-smoke-2026-10-24.json
- Native Substrate transfer evidence (separate adapter): https://github.com/rudimentall1/verigate-portaldot/blob/main/docs/evidence/portaldot-native-substrate-live-transfer-2026-10-24.json
- Native Substrate read-only re-verification (block 175489; one RPC): https://github.com/rudimentall1/verigate-portaldot/blob/main/docs/evidence/portaldot-native-substrate-reverification-2026-10-27.json
- Presentation PDF (7 slides): https://github.com/rudimentall1/verigate-portaldot/blob/main/docs/Verigate-PortalDot-Presentation.pdf
- The PDF is the original deck retained with the published demo. It predates the separate native Substrate transfer recorded on 24 October 2026; see the later evidence links above.
- Architecture and trust boundaries: https://github.com/rudimentall1/verigate-portaldot/blob/main/docs/architecture.md

## Current progress

- V2 guard deployed on PortalDot V3 EVM testnet; current code hash and policy readbacks were recorded as passing.
- One 0.1 POT transfer completed after Verigate ALLOW, bridge signing and pre-broadcast simulation; receipt status was 1 and one matching TransferExecuted event was recorded.
- The public DApp provides read-only policy state and transaction lookup.
- Local contract tests cover over-cap transfers, recipient allowlisting, time-window overflow, replay protection and altered signed fields.
- The published DApp's 24 October Chromium smoke test checked the expected runtime hash and executed two live read-only `eth_call` probes. An unlisted recipient returned `InvalidRecipient()`; `0.100000000000000001 POT` against the live `0.1 POT` cap returned `AmountExceedsCap(amount, cap)` with matching arguments. No signature or transaction was submitted, and no fee was paid. Full output is committed in [browser evidence JSON](evidence/published-dapp-browser-smoke-2026-10-24.json); these are not mined reverts and do not independently authenticate the single configured RPC.
- The saved native Substrate execution record reports a Verigate ALLOW and a 0.1 POT transfer. A later read-only re-query through one configured RPC matched the finalized extrinsic in block 175489 and one balances.Transfer event. The original Ed25519 artifacts are not in the evidence bundle, so their signatures cannot now be independently re-verified; no second-provider confirmation is available.

## Known limitations

- The guard only controls transfers from its own contract balance. It does not intercept arbitrary transactions from a user's wallet.
- Verigate Ed25519 verification occurs in the bridge; the contract verifies a separate EIP-712 authority signature.
- The recorded live transaction and readbacks use one configured PortalDot RPC. They are not an independent second-provider verification.
- The historical deployment receipt later became unavailable from the configured RPC; do not interpret that as deployment failure or redeploy solely to recreate receipt history.
- No direct DaaS integration is claimed because a verified public DaaS call interface was not found.
- No independent security audit, production readiness or mainnet deployment is claimed.

## Final submission checklist

- [x] BUIDL page updated from the account view with the current video URL, GitHub repository and social links.
- [ ] Open the BUIDL and video in a logged-out/private browser window and verify judge access.
- [ ] Watch/listen to the exact public YouTube upload from start to finish; confirm both wording changes, stitched narration, and burned-in caption/SRT alignment. The SRT currently attached in working materials still contains the prior wording, which may be older than the public upload.
- [ ] Confirm the long-form BUIDL description accurately says “0.5 POT per resettable 3,600-second interval”, not a continuously sliding rolling window.
- [ ] Confirm the selected hackathon track separately from the displayed tags.
- [ ] Ensure the public BUIDL long-form description includes the project provenance/licensing disclosure above; preserve third-party dependency licenses.
- [ ] Save/verify the final submission before 6 November 2026, 09:00 as shown in DoraHacks (04:00 UTC under the UTC+5 display).
- [x] Keep local negative tests, read-only public-RPC eth_call simulations and mined testnet transactions clearly distinguished.

## Publication status note

The submission record includes the published demo URL, project tags and repository/social links. The long-form description and selected track should be checked directly in the BUIDL form before final submission. The separate Check-in step is recorded as cancelled.

## Superseded correction notes

Earlier in this file, recommendations were made to correct “rolling window” wording and remove unsupported Account Abstraction / Chain Abstraction tags. The current account-view excerpt now shows the tags Crypto / Web3, Crypto-AI, Security and Substrate, so the old tag warning is superseded. The 5 November account snapshot includes the full long-form description. It uses the correct resettable 3,600-second interval wording; the final track selection and logged-out access still need separate confirmation. The deployed contract uses a cap of 0.5 POT per resettable 3,600-second interval, not a continuously sliding rolling-window sum.
