# Video review brief — Verigate PortalDot Hacker House

Updated: 24 October 2026. This file describes the current candidate render, not a claim that it has been approved after full playback.

## Current candidate render

- File supplied for review: `Verigate-PortalDot-Hacker-House-Demo (1).mp4`; sidecar captions: `Verigate-PortalDot-Hacker-House-Demo.srt`.
- Duration: 174.733 seconds (2:54.7), 5.267 seconds under the 3-minute limit.
- Video: 1920×1080, 30 fps, H.264 High, yuv420p.
- Audio: AAC-LC, 48 kHz, stereo. Independent FFmpeg checks measured peak -4.2 dBFS and integrated loudness -17.3 LUFS.
- The supplied SRT has 49 cues; its last cue ends at 172.716 seconds, about 2.017 seconds before video end.
- A black-frame scan found no black segment of 0.5 seconds or longer.
- Metadata, sampled frames and selected updated scenes have been checked. The MP4 has not been watched and listened to continuously; a human full-playback check is still required.

## Evidence framing in this cut

- The dashboard footage is explicitly labelled as a recording of the V1 guard dated 21 October 2026. It is not a live V2 dashboard demonstration.
- V1 historical transfer: block 132475. It is shown as saved evidence because the configured RPC later stopped returning that old receipt.
- V2 transfer: block 149241. V2 is shown as a text evidence card, not as live dashboard footage. The card describes a successful receipt, one matching `TransferExecuted` event and sender/recipient balance reconciliation from the same configured RPC.
- The final card says that only one RPC provider was used and that independent verification is absent. Keep that caveat.
- The sender debit of 7.82782148139542551 POT reconciles with `gasUsed × effectiveGasPriceWei`; the split between execution fee and any refundable storage deposit remains unresolved. Do not call the full debit an irrecoverable fee.
- The video must not imply a PortalDot team endorsement, global wallet interception, a public-chain policy-revert transaction, a security audit or production readiness.

## Two wording refinements recommended before submission

### 1. Clarify the V1 console recording

The visible label says “DASHBOARD RECORDING · V1 GUARD · 21 OCT 2026”, but the voice-over still says “Here is the live, read-only console” and then says it reads the “current” chain state and “latest block”. That can sound like current live V2 footage.

Replace the narration with wording along these lines:

> This is a recording of the read-only console captured with the V1 guard on October 21. At capture time, it read the PortalDot V3 chain ID, latest block, guard bytecode, native balance and on-chain authority signer from the public RPC.

Update the voice track, burned-in captions and SRT together. Do not present the V1 footage as a live V2 view.

### 2. Avoid implying a joint PortalDot demonstration

Replace:

> Verigate and PortalDot demonstrate an authorization-gated transfer on testnet.

With:

> This prototype demonstrates an authorization-gated transfer on PortalDot’s EVM testnet.

Update the voice track, burned-in subtitles and SRT consistently. This describes what the prototype demonstrates without implying PortalDot endorsement or co-authorship.

## Final human check

Before uploading, play the MP4 from start to finish with sound and captions enabled. In particular, verify the stitched segment 5 narration, the transitions between audio fragments, subtitle timing on all 49 cues, the architecture caption near 01:02, and the final 2-second closing card. The technical checks alone do not establish intelligibility or natural audio continuity.
