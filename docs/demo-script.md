# PortalDot Hacker House demo script

Published demo video: https://www.youtube.com/watch?v=9WhBdwGgXLk. The reviewed render is 174.733 seconds (2:54.7), 1920×1080, 30 fps, H.264/AAC, within the three-minute limit. Final media QA is to review the exact public upload for voice-over and burned-in caption synchronization; the working sidecar SRT retains earlier wording at cues 4–8 and 46. Public dashboard: https://rudimentall1.github.io/verigate-portaldot/

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

Say: “An AI agent can prepare a payment, but it should not be able to approve its own spending. Verigate checks the action against the rules set by the application. The bridge verifies that decision and ties it to this exact payment. The PortalDot guard checks it before funds move.”

### 0:15–0:40 — Live PortalDot V2 state

On screen: click Refresh. Show chain ID, runtime code hash, authority signer, maximum transfer, spending window, and allowlisted demo recipient.

Say: “These values come from the deployed contract over the PortalDot V3 RPC. The expected chain ID and recorded runtime hash must match. This dashboard is read-only: no wallet connection, signature request, or transaction broadcast.”

### 0:40–1:15 — Denial against the deployed contract, without sending a transaction

On screen: click “Inspect denial proof”. Run “Simulate unlisted recipient (read-only)” and show `InvalidRecipient()`. Then run “Simulate over-cap amount (read-only)” and show the requested `0.100000000000000001 POT` against the live `0.1 POT` cap and `AmountExceedsCap(amount, cap)`.

Say: “The first check uses an address that is not on the allowlist, and the contract returns `InvalidRecipient()`. The second asks to send one wei more than the 0.1 POT limit, and the contract returns `AmountExceedsCap`. These are read-only calls to the deployed contract. Nothing was signed or sent, so there is no failed transaction on-chain and no fee. The separate local test shows how the Verigate decision reaches the bridge.”

### 1:15–1:35 — End-to-end Verigate integration, local

On screen: show the isolated `scripts/verigate_local_demo.py` output and passing CI.

Say: “Here the local test runs through Verigate and the bridge. When the decision is BLOCK, the bridge does not authorize execution. When it is ALLOW, the bridge signs the exact action and the guard code executes it on a temporary local EVM. This is a local integration test, not a PortalDot testnet payment.”

### 1:35–2:10 — Successful public testnet payment

On screen: in the receipt lookup, submit the recorded V2 hash `0xaf3df785fdeaf85bbc9af2ae1342a7c664f4a55877469c4996eff2fe90f5551e`. Show the live successful receipt, block 149241, and the matching `TransferExecuted` event only if the current RPC returns them. Keep the saved evidence visibly distinguished from the current lookup.

Say: “The recorded V2 ALLOW flow moved 0.1 POT through the guard in block 149241. The current browser verification found receipt status 1 and one `TransferExecuted` event matching the action ID, recipient, and amount. The live lookup is a response from one configured RPC, not independent authentication of that provider.”

### 2:10–2:35 — Cost and trust boundaries

On screen: show the saved cost reconciliation with sender and recipient balance changes together.

Say: “For that isolated transaction, the sender's EVM balance decreased by 7.82782148139542551 POT while the recipient received 0.1 POT. The sender debit matches `gasUsed × effectiveGasPriceWei` through the configured RPC, but the runtime execution-fee versus storage-deposit split is unresolved. This is meaningful testnet evidence, not an economic-cost claim for production.”

### 2:35–2:55 — Close

On screen: show the repository, deployed V2 contract address, demo URL, and replacement V1/V2 evidence card.

Say: “This project puts a policy check between an AI agent and a payment. The EVM demo has a recorded PortalDot testnet transfer and live read-only checks against the deployed guard. A separate adapter demonstrates the native Substrate path. These are testnet results, not an audit or a production wallet product. The EVM guard only controls funds routed through it, and the chain reads shown here came from one RPC provider.”

## Final checks before submission

- [x] A sub-three-minute demo URL is present on the BUIDL: https://www.youtube.com/watch?v=9WhBdwGgXLk.
- [ ] Watch and listen to that exact public YouTube upload from start to finish; verify the new V1-recording wording, final PortalDot-testnet wording, stitched narration in segment 5, and all subtitle transitions.
- [ ] Confirm burned-in subtitles match the voice track and the sidecar SRT. The currently attached SRT in working materials still has the previous lines “Here is the live, read-only console” and “Verigate and PortalDot demonstrate…”. It may predate the new public upload; verify rather than assuming either way.
- [ ] Open the BUIDL page, YouTube video, repository, presentation PDF and public DApp in a logged-out/private browser window.
- [x] Keep V1 historical proof (block 132475) separate from V2 transaction proof (block 149241).
- [x] Keep live read-only `eth_call` denial results separate from mined transactions and local Verigate ALLOW/BLOCK integration results.
- [x] Preserve the one-RPC/no-independent-authentication caveat and unresolved sender fee/storage-deposit split.
- [ ] Confirm the final long-form BUIDL description uses the resettable 3,600-second interval wording, not “rolling window”.

## Known limits

V1 remains deployed at `0x3f2f484484fbE6e224d058fDfDB6B5A14F09655b` and does not enforce an on-chain recipient allowlist or spending caps. V2 is deployed at `0x87C494a5e4B0A8E055F283767579667E10E046C6`. The published dashboard now runs read-only `eth_call` probes against the live V2 runtime: an unlisted recipient returns `InvalidRecipient()`, and a request one wei over the live per-transfer cap returns `AmountExceedsCap(amount, cap)`. These results were verified by the 24 October published Chromium smoke test, but are not mined revert transactions, incur no transaction fee, and use one configured RPC. The recorded positive transfer remains 0.1 POT in block 149241, receipt status 1, one matching event and reconciled sender/recipient balance changes. The sender debit of 7.82782148139542551 POT was reconciled against the sender's before/after balance using the configured RPC; the runtime execution-fee/storage-deposit split remains unresolved. No independent second-RPC check is available. H160-to-SS58 mapping remains unverified; do not claim cross-chain mapping support. The revised 2:54.7 cut is recorded as the published version. Final media QA is limited to reviewing the exact public upload and confirming voice-over, burned-in captions and the sidecar SRT are synchronized. The replacement V1/V2 card is retained as historical source material in `docs/media/portaldot-v1-v2-outro.svg`.
