# PortalDot Hacker House 2026 — final submission reference

Updated: 24 October 2026 after the BUIDL video/link update. This is a reference for the current submission, not proof of logged-out judge visibility or end-to-end video review. The user reports the separate Check-in step was cancelled; the remaining deadline is Final Submission on 6 November 2026 at 09:00 as shown in DoraHacks.

## Project name

Verigate PortalDot

## Current public positioning line

Cryptographic policy & signature authorization guard for autonomous AI-agent payments on Portaldot V3 Testnet

## Current tags shown in the user's page view

Crypto / Web3; Crypto-AI; Security; Substrate

## One-line description

Policy-gated execution for AI agents on PortalDot: Verigate authorizes an exact action off-chain, and a deployed EVM guard enforces recipient and native-token spending limits before transferring funds held by the guard.

## Short project description

AI agents can propose token transfers, but a warning or fee estimate does not enforce the owner's authority limits. Verigate PortalDot connects Verigate's signed ALLOW decision to a narrowly scoped PortalDot V3 EVM guard. The bridge verifies the signed decision and binds a short-lived EIP-712 authorization to the exact recipient, amount, nonce, deadline and action ID. The deployed guard enforces an allowlist, a per-transfer cap and a resettable spending-interval cap for funds held by that guard.

The public testnet evidence includes a 0.1 POT transfer following a fresh Verigate ALLOW. The transaction succeeded in block 149241 and emitted one matching TransferExecuted event. This is a testnet prototype, not a global wallet firewall, DaaS integration, security audit or production deployment.

## Track

The page excerpt supplied for this update shows tags but not the selected hackathon track. Confirm that field in DoraHacks if it is displayed separately; a Substrate tag does not itself prove the track choice.

## Links

- Demo video (published): https://www.youtube.com/watch?v=9WhBdwGgXLk
- Repository: https://github.com/rudimentall1/verigate-portaldot
- Public DApp: https://rudimentall1.github.io/verigate-portaldot/
- V2 guard view: https://rudimentall1.github.io/verigate-portaldot/?guard=0x87C494a5e4B0A8E055F283767579667E10E046C6
- V2 guard: `0x87C494a5e4B0A8E055F283767579667E10E046C6`
- Public DApp guard view and transaction lookup: https://rudimentall1.github.io/verigate-portaldot/?guard=0x87C494a5e4B0A8E055F283767579667E10E046C6
- Successful transaction hash: `0xaf3df785fdeaf85bbc9af2ae1342a7c664f4a55877469c4996eff2fe90f5551e`
- Block: `149241`
- Recorded transaction evidence: https://github.com/rudimentall1/verigate-portaldot/blob/main/docs/evidence/portaldot-v2-live-transfer-2026-10-22.json
- Live denial-probe evidence (read-only `eth_call`, not mined reverts): https://github.com/rudimentall1/verigate-portaldot/blob/main/docs/evidence/published-dapp-browser-smoke-2026-10-24.json
- Presentation PDF (7 slides): https://github.com/rudimentall1/verigate-portaldot/blob/main/docs/Verigate-PortalDot-Presentation.pdf
- Architecture and trust boundaries: https://github.com/rudimentall1/verigate-portaldot/blob/main/docs/architecture.md

## Current progress

- V2 guard deployed on PortalDot V3 EVM testnet; current code hash and policy readbacks were recorded as passing.
- One 0.1 POT transfer completed after Verigate ALLOW, bridge signing and pre-broadcast simulation; receipt status was 1 and one matching TransferExecuted event was recorded.
- The public DApp provides read-only policy state and transaction lookup.
- Local contract tests cover over-cap transfers, recipient allowlisting, time-window overflow, replay protection and altered signed fields.
- The published DApp's 24 October Chromium smoke test checked the expected runtime hash and executed two live read-only `eth_call` probes. An unlisted recipient returned `InvalidRecipient()`; `0.100000000000000001 POT` against the live `0.1 POT` cap returned `AmountExceedsCap(amount, cap)` with matching arguments. No signature or transaction was submitted, and no fee was paid. Full output is committed in [browser evidence JSON](evidence/published-dapp-browser-smoke-2026-10-24.json); these are not mined reverts and do not independently authenticate the single configured RPC.
- A separate native Substrate adapter exists in code and offline tests, but no native Substrate transfer is claimed as live evidence.

## Known limitations

- The guard only controls transfers from its own contract balance. It does not intercept arbitrary transactions from a user's wallet.
- Verigate Ed25519 verification occurs in the bridge; the contract verifies a separate EIP-712 authority signature.
- The recorded live transaction and readbacks use one configured PortalDot RPC. They are not an independent second-provider verification.
- The historical deployment receipt later became unavailable from the configured RPC; do not interpret that as deployment failure or redeploy solely to recreate receipt history.
- No direct DaaS integration is claimed because a verified public DaaS call interface was not found.
- No live native Substrate transfer, security audit, production readiness or mainnet deployment is claimed.

## Final submission checklist

- [x] BUIDL page updated from the account view with the current video URL, GitHub repository and social links.
- [ ] Open the BUIDL and video in a logged-out/private browser window and verify judge access.
- [ ] Watch/listen to the exact public YouTube upload from start to finish; confirm both wording changes, stitched narration, and burned-in caption/SRT alignment. The SRT currently attached in working materials still contains the prior wording, which may be older than the public upload.
- [ ] Confirm the long-form BUIDL description accurately says “0.5 POT per resettable 3,600-second interval”, not a continuously sliding rolling window.
- [ ] Confirm the selected hackathon track separately from the displayed tags.
- [ ] Save/verify the final submission before 6 November 2026, 09:00 as shown in DoraHacks (04:00 UTC under the UTC+5 display).
- [x] Keep local negative tests, read-only public-RPC eth_call simulations and mined testnet transactions clearly distinguished.

## Publication status note

The BUIDL page now shows the published demo URL, current tags and repository/social links in the user's account view. The pasted excerpt did not include the complete long-form description or the selected track, and did not establish logged-out visibility. No separate Check-in task remains according to the user's current DoraHacks information.

## Superseded correction notes

Earlier in this file, recommendations were made to correct “rolling window” wording and remove unsupported Account Abstraction / Chain Abstraction tags. The current account-view excerpt now shows the tags Crypto / Web3, Crypto-AI, Security and Substrate, so the old tag warning is superseded. The excerpt provided for this update does not include the complete long-form description; verify its spending-cap sentence before final submission. The deployed contract uses a cap of 0.5 POT per resettable 3,600-second interval, not a continuously sliding rolling-window sum.
