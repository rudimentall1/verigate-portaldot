# PortalDot Hacker House demo script

Recording status: working render exists (2:39, 1920×1080, 30 fps, H.264/AAC). Do not submit this render as final until the stale outro is replaced and the complete audio/subtitle timing is checked. The MP4 is user-provided outside the repo; its matching SRT is not present in this repository snapshot. Target maximum: 3:00. Public dashboard: https://rudimentall1.github.io/verigate-portaldot/

## Gate before final render/submission

V2 deployment/configuration and a positive live transfer are now documented in `docs/evidence/portaldot-v2-deployment-2026-10-22.json` and `docs/evidence/portaldot-v2-live-transfer-2026-10-22.json`. Before recording, check these gates:
- The current V2 code and configuration are read live from chain ID `420420777` if the RPC serves them; the historical deployment receipt may no longer be returned by this RPC, so distinguish a saved deployment receipt from a fresh lookup.
- Readback shows the recorded admin, authority signer, `0.1 POT` max-per-transfer, `0.5 POT` cap in a resettable 3600-second interval, and the allowlisted recipient.
- The saved live transfer report shows the successful receipt and matching `TransferExecuted` event for `0.1 POT` to a recipient distinct from the relayer/sender.
- The published dashboard can now run two live read-only `eth_call` probes against the V2 contract after checking chain ID and the recorded runtime hash: an unlisted recipient returns `InvalidRecipient()`, and `maxPerTransfer + 1 wei` returns `AmountExceedsCap(amount, cap)`. These are simulation responses from one configured RPC, not mined public-chain revert transactions.
- Keep window-limit, replay, invalid-signature and reentrancy coverage labelled as **local Solidity tests**. Do not imply a denied transaction was broadcast to public PortalDot.
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

Target: 2:50–2:58. Record the live probes only after the page has confirmed the current PortalDot V3 chain ID and V2 runtime hash. If any live probe says UNVERIFIED, show that state honestly and do not narrate it as a pass.

### 0:00–0:15 — Problem and boundary

On screen: dashboard title, then the architecture overview.

Say: “An AI agent can propose a payment, but a proposal is not spending authority. Verigate decides off-chain, the bridge verifies the signed decision and binds authorization to one exact action, and the PortalDot guard checks the payment before funds move.”

### 0:15–0:40 — Live PortalDot V2 state

On screen: click Refresh. Show chain ID, runtime code hash, authority signer, maximum transfer, spending window, and allowlisted demo recipient.

Say: “These values come from the deployed contract over the PortalDot V3 RPC. The expected chain ID and recorded runtime hash must match. This dashboard is read-only: no wallet connection, signature request, or transaction broadcast.”

### 0:40–1:15 — Denial against the deployed contract, without sending a transaction

On screen: click “Inspect denial proof”. Run “Simulate unlisted recipient (read-only)” and show `InvalidRecipient()`. Then run “Simulate over-cap amount (read-only)” and show the requested `0.100000000000000001 POT` against the live `0.1 POT` cap and `AmountExceedsCap(amount, cap)`.

Say: “These are live read-only `eth_call` probes against the confirmed V2 runtime. The first returns `InvalidRecipient()`; the second returns `AmountExceedsCap` with the exact live amount and cap. The contract checks recipient and amount before signature recovery, so no valid signing key is needed for these probes. No transaction was broadcast, no fee was paid, and this is not a mined revert transaction. It proves the deployed contract's enforcement branches respond; the Verigate-to-bridge ALLOW/BLOCK path is separately tested in local integration.”

### 1:15–1:35 — End-to-end Verigate integration, local

On screen: show the isolated `scripts/verigate_local_demo.py` output and passing CI.

Say: “The local end-to-end harness exercises Verigate's actual API and bridge path. BLOCK has no execution authorization and the bridge refuses it. ALLOW is signed and executed against the real guard source on a temporary Hardhat EVM. This segment is local integration evidence, not a public PortalDot transaction.”

### 1:35–2:10 — Successful public testnet payment

On screen: in the receipt lookup, submit the recorded V2 hash `0xaf3df785fdeaf85bbc9af2ae1342a7c664f4a55877469c4996eff2fe90f5551e`. Show the live successful receipt, block 149241, and the matching `TransferExecuted` event only if the current RPC returns them. Keep the saved evidence visibly distinguished from the current lookup.

Say: “The recorded V2 ALLOW flow moved 0.1 POT through the guard in block 149241. The current browser verification found receipt status 1 and one `TransferExecuted` event matching the action ID, recipient, and amount. The live lookup is a response from one configured RPC, not independent authentication of that provider.”

### 2:10–2:35 — Cost and trust boundaries

On screen: show the saved cost reconciliation with sender and recipient balance changes together.

Say: “For that isolated transaction, the sender's EVM balance decreased by 7.82782148139542551 POT while the recipient received 0.1 POT. The sender debit matches `gasUsed × effectiveGasPriceWei` through the configured RPC, but the runtime execution-fee versus storage-deposit split is unresolved. This is meaningful testnet evidence, not an economic-cost claim for production.”

### 2:35–2:55 — Close

On screen: show the repository, deployed V2 contract address, demo URL, and replacement V1/V2 evidence card.

Say: “Verigate demonstrates off-chain policy authorization, exact-action signing, live on-chain recipient and amount checks, and a recorded PortalDot testnet payment. It is an unaudited testnet prototype. It does not protect payments that bypass this guard, and we have not independently authenticated the RPC provider.”

## Final checks before publishing

- [ ] Video is under three minutes with clear audio. Replace the Status/Next segment from approximately 02:18 through the final frame using [the video edit brief](video-edit-brief.md) and [the replacement card](media/portaldot-v1-v2-outro.svg).
- [ ] Dashboard URL points at the deployed V2 address, and all shown values are read from RPC.
- [ ] Live RPC, local Hardhat ALLOW/BLOCK, and public testnet transfer are clearly distinguished.
- [ ] Transfer recipient is not the sender/relayer; amount and reconciled sender debit are visible together, and the single-RPC basis and missing fee/storage-deposit breakdown are disclosed.
- [ ] Live `eth_call` probes are labelled read-only simulation; do not present them as mined reverts or evidence that Verigate's API returned BLOCK for those exact calls.
- [ ] Local cap/window/allowlist/replay/signature/reentrancy tests are labelled local.
- [ ] No raw authorization JSON, secret files, private keys or mnemonics appear.
- [ ] No H160-to-SS58 mapping claim is made unless a real runtime storage entry was verified.
- [ ] No explorer claim is made unless the matching transaction hash was personally confirmed there.
- [ ] Full-playback verification of narration/subtitle sync is complete; the architecture subtitle collision near 01:02 is corrected.
- [ ] Upload the actual corrected recording and paste its exact public/judge-accessible URL into DoraHacks.

## Known limits

V1 remains deployed at `0x3f2f484484fbE6e224d058fDfDB6B5A14F09655b` and does not enforce an on-chain recipient allowlist or spending caps. V2 is deployed at `0x87C494a5e4B0A8E055F283767579667E10E046C6`. The published dashboard now runs read-only `eth_call` probes against the live V2 runtime: an unlisted recipient returns `InvalidRecipient()`, and a request one wei over the live per-transfer cap returns `AmountExceedsCap(amount, cap)`. These results were verified by the 24 October published Chromium smoke test, but are not mined revert transactions, incur no transaction fee, and use one configured RPC. The recorded positive transfer remains 0.1 POT in block 149241, receipt status 1, one matching event and reconciled sender/recipient balance changes. The sender debit of 7.82782148139542551 POT was reconciled against the sender's before/after balance using the configured RPC; the runtime execution-fee/storage-deposit split remains unresolved. No independent second-RPC check is available. H160-to-SS58 mapping remains unverified; do not claim cross-chain mapping support. The current working MP4 still has the stale repeat-transfer outro and an architecture-caption overlap near 01:02. The replacement V1/V2 outro card is versioned at `docs/media/portaldot-v1-v2-outro.svg`; follow `docs/video-edit-brief.md` and do not mark the video complete until the edited render and full audio/subtitle playback have been reviewed.
