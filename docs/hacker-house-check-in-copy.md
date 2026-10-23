# PortalDot Hacker House 2026 — check-in copy

Prepared: 23 October 2026. This file is a copy/paste aid, not proof that the DoraHacks form has been saved. The public build entry exists, but saved check-in fields and judge visibility have not been independently confirmed.

## Project title

Verigate PortalDot

## One-line description

Policy-gated execution for AI agents on PortalDot: Verigate authorizes an exact action off-chain, and a deployed EVM guard enforces recipient and native-token spending limits before transferring funds held by the guard.

## Short project description

AI agents can propose token transfers, but a warning or fee estimate does not enforce the owner's authority limits. Verigate PortalDot connects Verigate's signed ALLOW decision to a narrowly scoped PortalDot V3 EVM guard. The bridge verifies the signed decision and binds a short-lived EIP-712 authorization to the exact recipient, amount, nonce, deadline and action ID. The deployed guard enforces an allowlist, a per-transfer cap and a resettable spending-interval cap for funds held by that guard.

The public testnet evidence includes a 0.1 POT transfer following a fresh Verigate ALLOW. The transaction succeeded in block 149241 and emitted one matching TransferExecuted event. This is a testnet prototype, not a global wallet firewall, DaaS integration, security audit or production deployment.

## Track

Modular Cloud Solutions and Middleware.

## Links

- Repository: https://github.com/rudimentall1/verigate-portaldot
- Public DApp: https://rudimentall1.github.io/verigate-portaldot/
- V2 guard view: https://rudimentall1.github.io/verigate-portaldot/?guard=0x87C494a5e4B0A8E055F283767579667E10E046C6
- V2 guard: `0x87C494a5e4B0A8E055F283767579667E10E046C6`
- Successful testnet transaction: https://rudimentall1.github.io/verigate-portaldot/?guard=0x87C494a5e4B0A8E055F283767579667E10E046C6
- Transaction hash: `0xaf3df785fdeaf85bbc9af2ae1342a7c664f4a55877469c4996eff2fe90f5551e`
- Block: `149241`
- Evidence: https://github.com/rudimentall1/verigate-portaldot/blob/main/docs/evidence/portaldot-v2-live-transfer-2026-10-22.json

## Current progress

- V2 guard deployed on PortalDot V3 EVM testnet; current code hash and policy readbacks were recorded as passing.
- One 0.1 POT transfer completed after Verigate ALLOW, bridge signing and pre-broadcast simulation; receipt status was 1 and one matching TransferExecuted event was recorded.
- The public DApp provides read-only policy state and transaction lookup.
- Local contract tests cover over-cap transfers, recipient allowlisting, time-window overflow, replay protection and altered signed fields.
- A read-only verifier now simulates over-cap and non-allowlisted-recipient reverts against the deployed contract via eth_call only. The dedicated GitHub Actions run still needs to pass and its output be inspected before these results can be claimed. These simulations do not submit transactions and are not mined public-chain revert evidence.
- A separate native Substrate adapter exists in code and offline tests, but no native Substrate transfer is claimed as live evidence.

## Known limitations

- The guard only controls transfers from its own contract balance. It does not intercept arbitrary transactions from a user's wallet.
- Verigate Ed25519 verification occurs in the bridge; the contract verifies a separate EIP-712 authority signature.
- The recorded live transaction and readbacks use one configured PortalDot RPC. They are not an independent second-provider verification.
- The historical deployment receipt later became unavailable from the configured RPC; do not interpret that as deployment failure or redeploy solely to recreate receipt history.
- No direct DaaS integration is claimed because a verified public DaaS call interface was not found.
- No live native Substrate transfer, security audit, production readiness or mainnet deployment is claimed.

## Submission checklist

- [ ] Open https://dorahacks.io/build/50065 while logged in and confirm the entry is attached to PortalDot Hacker House 2026.
- [ ] Paste/check the project description, selected track, repository URL and public DApp URL; save and reload the page to confirm persistence.
- [ ] Confirm the check-in form itself is submitted, not merely the public BUIDL page updated.
- [ ] Add the final demo video URL only after rendering and watching the corrected sub-three-minute video end to end. Do not use a placeholder or an unreviewed draft.
- [ ] Keep this distinction in the submission: local negative tests, read-only public-RPC eth_call simulations and mined public-chain transactions are three different evidence classes.
- [ ] Reopen the public entry in a logged-out/private browser window to confirm judge access.

## Deadline recorded in the project checklist

Check-in: 24 October 2026, 12:00 UTC. Final submission/code freeze: 6 November 2026, 04:00 UTC. Reconfirm against the live DoraHacks event page before relying on these timestamps.
