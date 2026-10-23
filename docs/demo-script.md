# PortalDot Hacker House demo script

Recording status: working render exists (2:39, 1920×1080, 30 fps, H.264/AAC). Do not submit this render as final until the stale outro is replaced and the complete audio/subtitle timing is checked. The MP4 is user-provided outside the repo; its matching SRT is not present in this repository snapshot. Target maximum: 3:00. Public dashboard: https://rudimentall1.github.io/verigate-portaldot/

## Gate before final render/submission

V2 deployment/configuration and a positive live transfer are now documented in `docs/evidence/portaldot-v2-deployment-2026-10-22.json` and `docs/evidence/portaldot-v2-live-transfer-2026-10-22.json`. Before recording, check these gates:
- The current V2 code and configuration are read live from chain ID `420420777` if the RPC serves them; the historical deployment receipt may no longer be returned by this RPC, so distinguish a saved deployment receipt from a fresh lookup.
- Readback shows the recorded admin, authority signer, `0.1 POT` max-per-transfer, `0.5 POT` cap in a resettable 3600-second interval, and the allowlisted recipient.
- The saved live transfer report shows the successful receipt and matching `TransferExecuted` event for `0.1 POT` to a recipient distinct from the relayer/sender.
- Show the cap, time-window and allowlist negative cases from the local Solidity tests as **local tests**. Do not imply these negative cases were submitted as paid transactions on public PortalDot.
- The published GitHub Pages site has the read-only dashboard, and `?guard=0x87C494a5e4B0A8E055F283767579667E10E046C6` reads the actual deployed V2 state.

If a current RPC read is unavailable, show dated evidence as historical and say so explicitly. Never describe a saved receipt as a fresh lookup. V1's block-132475 transaction was successfully re-queried from the configured RPC when the 21 Oct evidence was captured; a later lookup shown in the current video no longer returned that historical receipt. V2's block-149241 receipt, exact event and sender/recipient balance deltas were subsequently re-queried through the same configured RPC.

## Recording setup

Record a 16:9 desktop capture with microphone audio. Hide browser bookmarks that reveal unrelated private projects. Open:
1. The published read-only dashboard.
2. The V2 Solidity source on GitHub.
3. The V2 test file and the CI run showing passing tests.
4. The actual V2 deployment and transfer evidence files, created only after those transactions have been confirmed.
5. The local Verigate ALLOW/BLOCK result, labelled as local Hardhat evidence.
6. PortalDot node console only if a specific result can actually be located there.

Never show `.env`, keys, mnemonics, issuer secrets, raw signed authorization payloads, or private account information. Do not invent an explorer page or use a local transaction as public testnet proof.

## Shot list and voice-over

### 0:00–0:20 — The control boundary

On screen: dashboard title, then the small architecture overview in the repo.

Say: “An AI agent can propose a payment, but a proposal is not spending authority. Verigate makes the off-chain decision, the bridge signs one exact action, and the PortalDot guard applies on-chain limits before funds can move.”

### 0:20–0:50 — Live read-only chain state

On screen: click Refresh. Show chain ID, latest block, runtime code size, balance, authority signer, admin and V2 caps. The address in the URL must be the confirmed V2 address.

Say: “This page is read-only. It queries the public PortalDot V3 EVM RPC and does not connect a wallet, request a signature, or broadcast a transaction. These policy values are read from the deployed contract, not hardcoded into the dashboard.”

### 0:50–1:20 — Enforcement in Solidity

On screen: show `executeTransfer`, allowlist check, max-per-transfer check, spending-window check, signature recovery, nonce write before external call, and the reentrancy guard. Then show the policy setters and their admin restriction.

Say: “The admin can change the recipient allowlist and spending caps, but cannot execute a payment without the bridge signer's EIP-712 authorization. The time-window counter resets when the interval elapses; it is not a strict sliding-window calculation. The signer can authorize a payment but cannot change policy. The contract does not verify Verigate Ed25519 itself; that check remains off-chain in the bridge.”

### 1:20–1:45 — ALLOW and BLOCK, local only

On screen: show the reproducible isolated integration output and CI run. Keep the Hardhat label visible.

Say: “The local integration sends allowed and denied actions through Verigate's actual routes. BLOCK does not receive an execution authorization. The ALLOW path runs against the actual Solidity source on a temporary Hardhat EVM. This is local integration evidence, not a public PortalDot transaction.”

### 1:45–2:25 — Confirmed public testnet transfer

On screen: use the dashboard receipt lookup field with the recorded V2 transaction hash 0xaf3df785fdeaf85bbc9af2ae1342a7c664f4a55877469c4996eff2fe90f5551e. Show the live response only if the configured RPC returns it. The dashboard accepts any 32-byte transaction hash, checks transaction/receipt/block consistency, reports success versus revert, and decodes TransferExecuted events when present. Then show the saved V2 transfer report: block 149241, receipt status 1, amount 0.1 POT, sender debit 7.82782148139542551 POT, and the recipient credit. If the current RPC returns null, show that result honestly and use the dated evidence card separately; do not imply that a saved result was returned by the live lookup.

Say: “This PortalDot V3 testnet transfer is recorded in block 149241. The saved evidence shows a successful receipt and matching TransferExecuted event after Verigate returned ALLOW. A read-only check through the configured RPC reconciled the sender debit from 416.196502092920504516 to 408.368680611525079006 POT and the recipient credit from zero to 0.1 POT. The sender debit matches gasUsed times effectiveGasPriceWei; the runtime fee and storage-deposit components were not separated. This is one-RPC evidence, not independent provider verification.”

### 2:25–2:45 — Close

On screen: two-column status card with V1 historical proof and the V2 proof separately. Do not show the old “repeat the transfer for a fresh receipt” prompt.

Suggested card text:

- **V1:** recorded 0.1 POT transfer, block 132475. Receipt/event were verified through the configured RPC when captured; a later lookup through that same RPC no longer returned the historical receipt.
- **V2:** recorded 0.1 POT transfer, block 149241. Receipt, matching event, sender debit and recipient credit were re-queried through the same configured RPC.
- **Boundary:** no second EVM RPC provider; testnet prototype, not audited or mainnet. Public-chain negative cap/allowlist reverts are not recorded.

Say: “The V1 transfer is recorded in block 132475, but its historical receipt is no longer returned by the configured RPC. The V2 transfer is recorded in block 149241; its receipt, matching event, sender debit and recipient credit were re-queried through the same RPC. No second provider was used. This is a testnet prototype, not an audit or production deployment.”

## Final checks before publishing

- [ ] Video is under three minutes with clear audio.
- [ ] Dashboard URL points at the deployed V2 address, and all shown values are read from RPC.
- [ ] Live RPC, local Hardhat ALLOW/BLOCK, and public testnet transfer are clearly distinguished.
- [ ] Transfer recipient is not the sender/relayer; amount and reconciled sender debit are visible together, and the single-RPC basis and missing fee/storage-deposit breakdown are disclosed.
- [ ] Local cap/window/allowlist tests are labelled local; no implication of public-chain negative tests.
- [ ] No raw authorization JSON, secret files, private keys or mnemonics appear.
- [ ] No H160-to-SS58 mapping claim is made unless a real runtime storage entry was verified.
- [ ] No explorer claim is made unless the matching transaction hash was personally confirmed there.
- [ ] Upload the actual recording and paste its exact public/judge-accessible URL into DoraHacks.

## Known limits

V1 remains deployed at `0x3f2f484484fbE6e224d058fDfDB6B5A14F09655b` and does not enforce an on-chain recipient allowlist or spending caps. V2 is deployed at `0x87C494a5e4B0A8E055F283767579667E10E046C6`; the live 0.1 POT transfer is documented, but the public-chain negative cap/window cases are not recorded as mined revert transactions. The sender debit of 7.82782148139542551 POT was reconciled against the sender's before/after balance using the configured RPC. No independent second-RPC check or runtime execution-fee/storage-deposit breakdown is available. The recipient balance delta was reconciled through the same RPC. H160-to-SS58 mapping remains unverified; do not claim cross-chain mapping support. The current working MP4's outro still asks to repeat the transfer, so replace that line with a V1/V2 evidence summary before submission.
