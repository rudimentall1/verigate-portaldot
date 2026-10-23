# Verigate PortalDot — claims to verify before submission

Updated: 23 October 2026. Use this file as the wording boundary for the demo, slide deck, captions and DoraHacks submission.

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

### V2 policy and trust boundaries

- The recorded deployment/configuration readback shows an initial recipient allowlist, `0.1 POT` maximum per transfer and a `0.5 POT` cap per resettable `3600-second` interval.
- The counter resets after the configured interval. Do not call it a continuously sliding rolling window.
- The administrator can change the recipient allowlist and limits. Do not describe them as immutable against a compromised administrator.
- Verigate's Ed25519 authorization is checked off-chain by the bridge. The Solidity guard checks the bridge authority's EIP-712 signature and the bound transfer fields. Do not claim the contract verifies Verigate's Ed25519 signature on-chain.
- The guard covers only transactions routed through that contract. It is not a global RPC proxy or universal wallet interceptor.

### Local tests versus public-chain evidence

- The ALLOW/BLOCK end-to-end integration and Hardhat contract tests run against an isolated loopback/local EVM. Label them **LOCAL TEST**.
- V2 cap/allowlist rejection is supported by local contract tests. Do not present it as a mined public-testnet revert; no such negative-case transaction is recorded.
- The V1 and V2 positive transfers are public-testnet evidence, but keep their contract versions and blocks separate: V1 `132475`, V2 `149241`.

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

The uploaded working render is `159.43 seconds` (2:39), `1920×1080`, 30 fps, H.264 video and AAC audio. It fits the three-minute cap.

Before submission, revise the video source and render again:
1. The end card around 2:20 still says to repeat the transfer and capture a fresh receipt. That is stale: V2's recorded transfer and sender/recipient balance reconciliation now exist. Replace this with the accurately scoped V1/V2 proof and same-RPC limitation.
2. Around 1:02 the subtitle overlaps the small `executeTransfer` annotation/arrow in the architecture frame. Retiming or repositioning the subtitle is preferable to claiming that it only touches the footnote edge.
3. The public V1 sender/recipient address `0x4c07B4f328FA738290Db96BCE2F9CBc4d020D2CB` is part of the recorded on-chain evidence. Keep it visible unless you explicitly want to conceal address-to-activity correlation; blurring makes verification harder.
4. The MP4 was inspected for technical metadata and sampled key frames, not listened to start-to-finish. Subtitle timing still needs a full playback check. The matching `.srt` was not attached to this repository snapshot, so its exact cues have not been checked here.
