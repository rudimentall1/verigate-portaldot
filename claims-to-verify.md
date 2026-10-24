# Verigate PortalDot — claims to verify before submission

Updated: 24 October 2026. Use this file as the wording boundary for the demo, slide deck, captions and DoraHacks submission.

## Supported claims

### V1 historical transfer — block 132475

**Use this wording:**

> A Verigate-authorized 0.1 EVM POT transfer through the V1 `PortalDotAgentGuard` was recorded in block `132475`. The saved verification record reports receipt status `1`, one matching `TransferExecuted` event, and a block containing one transaction. A later lookup of that historical transaction through the configured PortalDot V3 RPC did not return the transaction/receipt, so the old receipt is shown as recorded evidence, not as a fresh successful lookup.

Sources:
- [V1 transfer report](docs/authorized-transfer-evidence-2026-10-21-nondust.md)
- [V1 machine-readable record](evidence/authorized-transfer-0p1-2026-10-21.json)

**Do not say:** the current RPC successfully returns the V1 receipt now; that a second EVM RPC provider confirmed it; or that V1 has V2's allowlist/spending caps.

### V2 live transfer — block 149241

**Use this wording:**

> The current V2 path recorded a real 0.1 EVM POT transfer in block `149241`. The read-only verifier found receipt status `1` and exactly one `TransferExecuted` event matching the expected action ID, recipient and amount. A later read-only check through the same configured RPC found only one EVM transaction in the block, reconciled the sender's balance decrease from `416.196502092920504516` to `408.368680611525079006` POT against `gasUsed × effectiveGasPriceWei`, and measured the recipient's balance increase from `0` to `0.1` POT.

Sources:
- [V2 transfer evidence](docs/evidence/portaldot-v2-live-transfer-2026-10-22.json)
- [Sender/recipient balance reconciliation](docs/evidence/portaldot-v2-cost-reconciliation-2026-10-23.json)

**Required caveat:** all of those reads used the same configured RPC. No second EVM provider authenticated the result, and no EVM genesis hash pin was configured for these transfers. The sender's gross debit reconciles, but the precise split between runtime execution fee and any refundable storage deposit has not been determined.

### Supported wording for the live read-only denial probes

> On 24 October 2026, the published DApp's browser smoke test called the deployed V2 guard using read-only `eth_call` against the configured PortalDot V3 RPC. The contract returned `InvalidRecipient()` for an unlisted recipient and `AmountExceedsCap(amount, cap)` for a request one wei above the current per-transfer cap. The test first checked chain ID and the expected runtime code hash. No signature or transaction was broadcast, and no fee was paid. This is a live endpoint-reported simulation, not a mined revert transaction or independent RPC authentication.

Sources: [Committed browser evidence JSON](docs/evidence/published-dapp-browser-smoke-2026-10-24.json), [published Chromium smoke workflow](https://github.com/rudimentall1/verigate-portaldot/actions/runs/40071558856), tested DApp code commit [`af41b2f`](https://github.com/rudimentall1/verigate-portaldot/commit/af41b2f0b646922bb79638012d835ac3f8651abe).

### V2 policy and trust boundaries

- The recorded deployment/configuration readback shows an initial recipient allowlist, `0.1 POT` maximum per transfer and a `0.5 POT` cap per resettable `3600-second` interval.
- The counter resets after the configured interval. Do not call it a continuously sliding rolling window.
- The administrator can change the recipient allowlist and limits. Do not describe them as immutable against a compromised administrator.
- Verigate's Ed25519 authorization is checked off-chain by the bridge. The Solidity guard checks the bridge authority's EIP-712 signature and the bound transfer fields. Do not claim the contract verifies Verigate's Ed25519 signature on-chain.
- The guard covers only transactions routed through that contract. It is not a global RPC proxy or universal wallet interceptor.

### Local tests versus public-chain evidence

- The ALLOW/BLOCK end-to-end integration and Hardhat contract tests run against an isolated loopback/local EVM. Label them **LOCAL TEST**.
- The 24 October published Chromium smoke test used read-only `eth_call` against the live V2 contract after checking chain ID `420420777` and matching its recorded runtime hash. The unlisted-recipient probe returned `InvalidRecipient()`; a `0.100000000000000001 POT` amount against the live `0.1 POT` cap returned `AmountExceedsCap(amount, cap)` with matching arguments. Label these **LIVE READ-ONLY CONTRACT SIMULATION**. The probes sent no transaction, produced no mined receipt, and do not prove Verigate's API returned BLOCK for those exact calls. RPC operator authentication is not independent because only one configured endpoint was used.
- Do not present the probes as mined public-testnet reverts; no such negative-case transaction is recorded. The positive V1/V2 payment evidence is separate and transaction-backed.
- The V1 and V2 positive transfers are public-testnet evidence, but keep their contract versions and blocks separate: V1 `132475`, V2 `149241`.

### Read-only arbitrary transaction lookup in the DApp

- The published dashboard provides an editable 32-byte EVM transaction-hash field and queries the configured PortalDot V3 RPC for the transaction, receipt and containing block.
- It checks that the requested hash matches the transaction and receipt, that transaction/receipt block metadata is consistent, and that the returned block hash/number matches the receipt.
- It reports receipt success or revert and decodes matching `TransferExecuted` events emitted by the transaction destination when present. A missing/null RPC response is reported as unavailable; it is not described as proof that the transaction never existed.
- The dashboard remains read-only: no wallet connection, signature request, or transaction-broadcast path was added. The feature is deployed through the GitHub Pages workflow, which copies the HTML and `receipt-lookup.mjs` module. `npm test` runs `scripts/validate-dapp.mjs` plus nine built-in `node:test` cases covering successful and reverted receipts, null responses, transaction/block/chain mismatches, and event filtering.
- The published page also passed a clean Chromium smoke test on 23 October 2026. The browser read chain ID `420420777`, the expected V2 runtime hash, authority signer, live spending policy and allowlisted demo recipient. The generic lookup returned the known V2 transaction's successful receipt in block `149241` and exactly one `TransferExecuted` event matching the expected action ID, recipient and `0.1 POT` amount. The check sent no transaction; machine-readable output is in [the browser smoke evidence](docs/evidence/published-dapp-browser-smoke-2026-10-23.json), generated by [Pages workflow run 39942560216](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39942560216).
- **Limit:** all live reads used one configured RPC. A valid receipt or `TransferExecuted` event is not independent authentication of the RPC operator and does not by itself prove that Verigate returned `ALLOW`. Availability may change if that endpoint prunes historical receipts; a null lookup is reported as unavailable, not as proof the transaction never existed.

## Claims not established

Do not claim:
- a second independent RPC provider or independent authentication of the RPC operator;
- an EVM genesis-hash pin for the recorded transfers;
- a security audit, mainnet deployment, or production readiness;
- integration into PortalDot Wallet or DaaS, PortalDot team endorsement, or external user adoption;
- verified H160-to-SS58 account mapping;
- public-chain reverts for V2 policy violations;
- that the entire sender debit is a confirmed, irrecoverable execution fee.

## Demo-video review

The candidate render supplied for review on 24 October 2026 is 174.733 seconds (2:54.7), 1920×1080 at 30 fps, H.264 High/yuv420p with AAC-LC stereo at 48 kHz. It is 5.267 seconds below the three-minute limit. The supplied MP4 was checked with ffprobe; an FFmpeg audio scan measured a peak of -4.2 dBFS and integrated loudness of -17.3 LUFS. A black-frame scan found no black segment lasting 0.5 seconds or longer.

The current cut's evidence framing is materially improved:
- The dashboard footage is labelled as a recording of the V1 guard dated 21 October 2026; it is not a live V2 dashboard demonstration.
- The V1 receipt is presented as historical saved evidence because the configured RPC later stopped returning it.
- V2 is presented as a text evidence card for block 149241, not as live V2 dashboard footage. It reports the successful receipt, one matching `TransferExecuted` event and balance reconciliation through the same configured RPC.
- The ending says no second RPC provider was used and does not ask the viewer to repeat the transfer.

The supplied SRT contains 49 cues. Its last cue ends at 172.716 seconds, approximately 2.017 seconds before the MP4 ends. The current subtitles, burned-in captions and sampled key frames were inspected, but the MP4 has not been watched and listened to continuously. The new stitched narration in segment 5 and its transitions still require a human end-to-end playback check before calling this submission-ready.

### Two wording refinements recommended before submission

1. **Clarify the dated V1 console footage.** The on-screen label identifies a “DASHBOARD RECORDING · V1 GUARD · 21 OCT 2026”, but the narration still says “Here is the live, read-only console” and then refers to the “current” chain state and “latest block”. That can be mistaken for current live V2 footage. Prefer wording such as:

   > This is a recording of the read-only console captured with the V1 guard on October 21. At capture time, it read the PortalDot V3 chain ID, latest block, guard bytecode, native balance and on-chain authority signer from the public RPC.

   Update the spoken audio, burned-in captions and sidecar SRT together. Do not imply the screen is a live V2 view.

2. **Avoid implying a joint demonstration or endorsement by PortalDot.** Replace “Verigate and PortalDot demonstrate an authorization-gated transfer on testnet” with:

   > This prototype demonstrates an authorization-gated transfer on PortalDot’s EVM testnet.

   Update the narration, burned-in subtitles and SRT consistently.

Keep the V1 and V2 contract versions separate. Do not make the V2 evidence card resemble a live dashboard capture, and do not remove the one-RPC / no-independent-authentication caveat.
