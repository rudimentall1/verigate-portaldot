# DoraHacks BUIDL review — 24 October 2026

> **Current status addendum:** the user subsequently updated the BUIDL page and published the new demo link https://www.youtube.com/watch?v=9WhBdwGgXLk. The current account-view excerpt shows the newer tags and project links. The user also reports that the separate Check-in step was cancelled. The check-in-deadline instructions below are historical notes from the earlier page view, not current action items. Remaining manual checks are the exact public video's end-to-end audio/caption review, the full long-form description/track, and logged-out reviewer access.


## Status from the current page view

The user-provided account view shows a populated Verigate PortalDot BUIDL entry with the YouTube video URL, public GitHub repository, social links and a detailed overview/evidence section. This is materially stronger evidence than an empty or draft-only entry. It does not, by itself, prove logged-out judge visibility or the event-specific check-in status.

The published event mirror lists the check-in deadline as 24 October 2026 at 20:00 UTC+8 (12:00 UTC). The workflow timestamps checked at 07:58 UTC on 24 October were still before that deadline. Confirm the saved check-in state in the DoraHacks UI now.

## Mandatory factual correction

The current BUIDL text calls the V2 spending restriction a “rolling spending limit” and a “rolling limit of 0.5 POT over a 3,600-second window”. This misdescribes the contract.

The contract logic starts a new interval when the current interval has expired. It is not a continuously sliding rolling-window sum.

Use this exact wording wherever the restriction is described:

> The current V2 configuration includes a recipient allowlist, a maximum of 0.1 POT per transfer, and a spending cap of 0.5 POT per resettable 3,600-second interval. The counter resets after the interval expires; this is not a continuously sliding rolling-window sum.

Replace the sentence about a “live testnet simulation of a rolling-window violation” with:

> A separate live testnet simulation of a time-window cap violation has not been completed. Local contract tests cover window-cap overflow and nonce non-consumption on revert.

## Tags

Recommended: keep Crypto / Web3, Crypto-AI and Security. Consider removing Account Abstraction and Chain Abstraction. The current proof does not establish ERC-4337-style account abstraction or a cross-chain execution flow. Substrate is relevant to PortalDot's runtime and preflight tooling, but do not imply a live native Substrate transfer.

## Evidence wording to preserve

- Positive path: a 0.1 POT transfer, transaction `0xaf3df785fdeaf85bbc9af2ae1342a7c664f4a55877469c4996eff2fe90f5551e`, block 149241, receipt status 1 and one matching `TransferExecuted` event.
- Negative paths: the deployed V2 contract returned `AmountExceedsCap(amount, cap)` for 0.100000000000000001 POT and `InvalidRecipient()` for an unlisted recipient in read-only `eth_call` probes.
- The negative probes were not mined transactions and did not create signatures or incur transaction fees.
- The live probes used one configured RPC. Do not describe them as independent RPC authentication.
- Window-cap overflow remains local-test evidence only. Do not call it a live testnet rejection.
- The reported sender debit of 7.82782148139542551 POT is not a verified net network fee: execution-fee and storage-deposit components remain unresolved.

## Final submission quality

Keep the current contract address and successful transaction explorer link visible. Do not replace the YouTube link until the corrected video is rendered and reviewed end-to-end. The video should say “resettable interval cap”, never “rolling limit”.
