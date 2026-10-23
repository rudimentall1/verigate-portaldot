# Video correction brief — Verigate PortalDot Hacker House

Use this as an edit checklist for the existing working render.

## Input and output

- Input: `Verigate-PortalDot-Hacker-House-Demo(1).mp4`.
- Source render: 159.43 s, 1920×1080, 30 fps, H.264/AAC.
- Target: keep the output under 3:00 and at 1920×1080 / 30 fps.
- Replacement closing card: [`docs/media/portaldot-v1-v2-outro.svg`](media/portaldot-v1-v2-outro.svg); a 1920×1080 PNG handoff is supplied separately.
- Keep the earlier project narration and clips unless required for the caption collision described below.

## Required edits

### 1. Replace the stale final card and final narration

- The obsolete “Status / Next” card starts at approximately **02:18 (138 seconds)**. Its bullet says “Repeat the authorized transfer and capture a fresh receipt that can be independently verified”. That claim is outdated because the V2 transfer in block 149241 has a recorded successful receipt, matching event and same-RPC balance reconciliation.
- Replace the entire image from about **02:18 to the final frame** with the new V1/V2 evidence card. Cover the old burned-in subtitles in this segment too; do not leave any old “repeat the transfer” caption visible.
- Replace the original voice-over from about **02:18 to the end** with the text below. Use the supplied narrator/audio in the editing project; do not generate fake terminal or live RPC footage. If a new audio take runs longer than the slot, extend the closing card or trim preceding dead space, staying under 3:00.
- End on the new card with the repository URL visible.

### 2. Fix the architecture caption overlap

- Around **01:02 (62 seconds)** the subtitle “decision receipt and execution authorization” crosses the `executeTransfer — explicit broadcast is opt-in` annotation/arrow and the dashed evidence footer.
- Rebuild this subtitle cue from the original text/caption source. Move it into a safe bottom caption area or retime it to a shot with less visual density. Preserve the complete sentence and avoid covering the trust-boundary label or the evidence footnote.
- The visible subtitles in the MP4 are already composited into the frame. Editing only a separate SRT will not remove the old pixels from this MP4; export again from the editable timeline/source or cover/rebuild the affected shot.

### 3. Leave these evidence boundaries intact

- V1: recorded 0.1 POT transfer, block 132475. Receipt/event was verified when captured; a later lookup through the same configured RPC no longer returned that historical receipt.
- V2: recorded 0.1 POT transfer, block 149241. Receipt status 1, one matching `TransferExecuted` event and sender/recipient balance changes were re-queried through the same configured RPC.
- Sender gross debit: 7.82782148139542551 POT, matching `gasUsed × effectiveGasPriceWei`. Do not describe this whole amount as an irrecoverable execution fee; the runtime fee vs refundable storage-deposit split is unresolved.
- One configured EVM RPC only; no second-provider authentication and no EVM genesis hash pin for this transfer.
- Testnet prototype; not audited, not mainnet.
- Do not blur the recorded public address by default; it is part of the public evidence, unless the user explicitly chooses to conceal address-to-activity correlation.

## Replacement final narration (English)

“V1: 0.1 POT recorded in block 132475; its receipt is no longer returned by this RPC. V2: 0.1 POT in block 149241, with receipt, event and both balance changes re-queried through the same RPC. No second provider. Testnet only; unaudited, not mainnet.”

Approx. 42 words. Retiming subtitles to the actual voice recording is mandatory; these instructions do not claim that a final MP4 has already been rendered or listened to in full.
