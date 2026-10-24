# DoraHacks BUIDL review — 24 October 2026

> **Current status addendum:** the user subsequently updated the BUIDL page and published the new demo link https://www.youtube.com/watch?v=9WhBdwGgXLk. The current account-view excerpt shows the newer tags and project links. The user also reports that the separate Check-in step was cancelled. The check-in-deadline instructions below are historical notes from the earlier page view, not current action items. Remaining manual checks are the exact public video's end-to-end audio/caption review, the full long-form description/track, and logged-out reviewer access.


## Status from the current page view

The user-provided account view shows a populated Verigate PortalDot BUIDL entry with the YouTube video URL, public GitHub repository, social links and a detailed overview/evidence section. This is materially stronger evidence than an empty or draft-only entry. It does not, by itself, prove logged-out judge visibility or the event-specific check-in status.

The published event mirror lists the check-in deadline as 24 October 2026 at 20:00 UTC+8 (12:00 UTC). The workflow timestamps checked at 07:58 UTC on 24 October were still before that deadline. Confirm the saved check-in state in the DoraHacks UI now.

## Audit of the current account-view excerpt

The latest account view supplied for this review shows the project positioning line, tags `Crypto / Web3`, `Crypto-AI`, `Security`, `Substrate`, the current YouTube link, repository and social links. These are consistent with the project's implemented scope.

The supplied excerpt does **not** expose the complete long-form description or selected track. Direct public-page retrieval was not available during this audit, so those two fields are not marked verified. Do not infer that a field is correct merely because the title, tags and links are visible.

## Track recommendation

The published event listing names four tracks: Modular Cloud & Middleware, Multi-Chain & Cross-Chain Infra, Node Operations & Tooling, and Ecosystem DApps. See https://www.hackathonradar.com/database/hackathon/portaldot-hacker-house-2026.

**Recommended fit: Modular Cloud & Middleware.** The submission is a policy-to-execution middleware component with a bridge, EVM guard and read-only DApp. It is not primarily node monitoring/staking, a cross-chain asset bridge, or a consumer-facing DApp. Earlier project notes record Node Operations & Tooling as the original track choice, but the latest supplied account-view excerpt does not show the currently selected track. If the form still permits a change, switch to **Modular Cloud & Middleware**; otherwise, confirm the existing selection and do not describe the recommendation as the actual selected track.

## Mandatory factual wording for the spending policy

A previously inspected BUIDL text used “rolling spending limit” / “rolling limit of 0.5 POT over a 3,600-second window”. That wording is inaccurate for the deployed contract. The latest account-view excerpt does not include the complete long-form text, so this audit cannot confirm whether that sentence has since been corrected.

Use this exact wording wherever the policy is described:

> The current V2 configuration includes a recipient allowlist, a maximum of 0.1 POT per transfer, and a spending cap of 0.5 POT per resettable 3,600-second interval. The counter resets after the interval expires; this is not a continuously sliding rolling-window sum.

Do not say the live chain demonstrated a window-cap violation. The window-overflow and nonce non-consumption behaviour are established by local Hardhat tests, including the successful CI run on 24 October. The live DApp probes are read-only `eth_call` simulations for an unlisted recipient and a transfer above the per-transfer cap, not mined reverts.

## Claim-by-claim audit

### Supported by current repo evidence

- Positive path: V2 transaction `0xaf3df785fdeaf85bbc9af2ae1342a7c664f4a55877469c4996eff2fe90f5551e`, block `149241`, receipt status 1 and one matching `TransferExecuted` event. Sender and recipient balance deltas were reconciled through the configured RPC.
- Live denial simulations: `InvalidRecipient()` for an unlisted recipient and `AmountExceedsCap(amount, cap)` for `0.100000000000000001 POT` against the live `0.1 POT` limit. These were read-only `eth_call` probes and incurred no transaction fee.
- Local tests: spending-window overflow reverts without consuming the nonce or changing the accumulated window spend; window accounting resets after the configured interval. Latest CI run: https://github.com/rudimentall1/verigate-portaldot/actions/runs/40088327004.
- The guard controls only transfers routed through its own contract balance. The contract verifies the bridge's EIP-712 signature; Verigate Ed25519 verification occurs off-chain in the bridge.

### Must remain disclosed

- All live EVM reads and balance reconciliation used one configured RPC. There is no second-provider authentication.
- The historical V2 deployment receipt is no longer returned by the configured RPC, although saved earlier deployment evidence and later code/configuration readbacks exist. Do not claim a fresh deployment-receipt lookup.
- The sender's gross balance debit of `7.82782148139542551 POT` matches `gasUsed × effectiveGasPriceWei` in the isolated block, but the runtime execution-fee and storage-deposit components have not been separated. Do not call the entire amount an independently verified irrecoverable fee.
- No live native Substrate transfer, PortalDot Wallet/DaaS integration, PortalDot team endorsement, independent audit, production readiness or mainnet deployment is claimed.
- The project reuses the pre-existing Verigate policy engine. The public submission should retain the explicit provenance and licensing disclosure in [the final-submission reference](hacker-house-check-in-copy.md). The latest account-view excerpt does not prove that this disclosure is present in the submitted long-form text.

## Final submission gates that remain

1. Open the BUIDL form and check the actual selected track; prefer **Modular Cloud & Middleware** if you can still choose it.
2. Inspect the full long-form description and correct the spending interval wording if it still says “rolling”; ensure provenance/licensing disclosure is included.
3. Verify logged-out access to the BUIDL, repository, PDF, DApp and video.
4. Watch/listen to the exact public video upload from beginning to end to confirm voice-over and burned-in captions agree.
5. Save/verify the final submission by 6 November 2026, 09:00 in the current DoraHacks view (04:00 UTC at UTC+5).

The revised video link is already reflected in the user's reported account view. Do not re-render or replace it unless the playback check finds a real defect.
