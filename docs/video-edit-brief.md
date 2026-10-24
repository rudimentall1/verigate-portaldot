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

## Final wording verification for the published link

The public BUIDL now links to https://www.youtube.com/watch?v=9WhBdwGgXLk. The current sidecar SRT available in the working materials still contains these earlier lines:
- Cue 4–8: “Here is the live, read-only console” and “current PortalDot V3 chain ID…”
- Cue 46: “Verigate and PortalDot demonstrate an authorization-gated transfer on testnet.”

This SRT may predate the public YouTube upload; no reliable current transcript or continuous playback of that exact public upload has been verified here. Confirm these two audio lines and their burned-in captions in the public video. If they have already been replaced, do not edit them again. If not, replace them with:

1. V1 footage wording:

   > This is a recording of the V1 guard console from October 21. At capture time, it read PortalDot V3's chain ID, latest block, guard bytecode, native balance and authority signer from the public RPC. The signer matched the project's recorded value.

2. Final statement:

   > This prototype demonstrates an authorization-gated transfer on PortalDot's EVM testnet.

Do not infer PortalDot endorsement or current live V2 footage from the V1 recording. If edits are needed, update the voice track, burned-in subtitles and sidecar SRT together, then re-export and verify synchronization.

## Final human check

Before uploading, play the MP4 from start to finish with sound and captions enabled. In particular, verify the stitched segment 5 narration, the transitions between audio fragments, subtitle timing on all 49 cues, the architecture caption near 01:02, and the final 2-second closing card. The technical checks alone do not establish intelligibility or natural audio continuity.
