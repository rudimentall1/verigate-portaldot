# Verigate PortalDot

**A policy-to-execution gate for AI-agent payments on PortalDot V3.**

An AI agent can propose a transfer, but a proposal is not authority. Verigate makes the off-chain policy decision. The bridge verifies the signed decision and binds it to one exact action. The deployed `PortalDotAgentGuardV2` then checks the authorization, recipient allowlist and spending limits before moving native POT held by the guard.

**Why this matters to PortalDot:** this is a reference middleware pattern for EVM-compatible applications that want to let agents initiate payments without giving them unrestricted transfer authority. The implementation is on PortalDot V3 EVM testnet. It is not an integration into PortalDot Wallet or DaaS, and it does not protect transfers that bypass this guard.

## Deployed Verigate integration on PortalDot V3 testnet

1. **Open the [live V2 guard dashboard](https://rudimentall1.github.io/verigate-portaldot/?guard=0x87C494a5e4B0A8E055F283767579667E10E046C6).** It shows the deployed contract, its current policy and runtime code. The dashboard is read-only; connecting a wallet or sending a transaction is not required.
2. **See how invalid payments are blocked.** Use `Inspect denial proof` and run the two read-only checks: an unlisted recipient and an amount one wei above the `0.1 POT` per-transfer cap. The recorded PortalDot testnet checks returned `InvalidRecipient()` and `AmountExceedsCap(amount, cap)`. These are simulated calls, not mined failed transactions.
3. **Trace an authorized payment.** Click `Verify recorded transfer` to look up the recorded `0.1 POT` transfer: block `149241`, successful receipt and one matching `TransferExecuted` event. The [evidence record](https://github.com/rudimentall1/verigate-portaldot/blob/main/docs/evidence/portaldot-v2-live-transfer-2026-10-22.json) contains the transaction details and verification limits. If the RPC no longer serves the historical receipt, use that saved record rather than treating it as a fresh lookup.
4. **Implementation and test records:** [successful transfer record](docs/evidence/portaldot-v2-live-transfer-2026-10-22.json) · [published dashboard browser check](docs/evidence/published-dapp-browser-smoke-2026-10-24.json) · [V2 Solidity contract](contracts/PortalDotAgentGuardV2.sol) · [V2 contract tests](test/PortalDotAgentGuardV2.test.js) · [GitHub Actions test run](https://github.com/rudimentall1/verigate-portaldot/actions/runs/40089146180).

## Current implementation and evidence

| Claim | Evidence | Evidence boundary |
|---|---|---|
| An allowed action reached testnet execution | Recorded Verigate `ALLOW`, successful V2 receipt and one matching `TransferExecuted` event for `0.1 POT` | Testnet; reads were checked through one configured RPC |
| The deployed V2 code and policy matched the recorded configuration | Published Chromium check read chain ID `420420777`, runtime hash, authority signer, and the `0.1 POT` / `0.5 POT per resettable 3,600-second interval` policy | Snapshot is dated; one RPC; not independent authentication of the RPC operator |
| V2 rejects an unlisted recipient and an over-cap amount | Live read-only `eth_call` probes returned `InvalidRecipient()` and `AmountExceedsCap` | Simulated calls, not mined public-chain revert transactions |
| Interval overflow does not consume a nonce; interval accounting resets | Local Hardhat contract tests | Local test evidence, not a live public-chain overflow transaction |

**Scope:** PortalDot V3 EVM testnet prototype, not a security audit, production deployment, or mainnet-ready system. Verigate's Ed25519 decision verification occurs off-chain in the bridge; the contract verifies the bridge's EIP-712 authorization. The guard only controls payments from its own contract balance. No second RPC provider, PortalDot Wallet/DaaS integration, team endorsement, or mainnet deployment is claimed.

## How it works

```mermaid
flowchart TD
    A["AI agent / application"] -->|"proposes an action"| B["Verigate policy API"]
    B --> C{"Decision"}
    C -->|"WARN / BLOCK"| X["Bridge refuses to authorize"]
    C -->|"ALLOW + signed artifacts"| D["PortalDot bridge"]
    D --> E["Verify Verigate Ed25519 artifacts and exact action off-chain"]
    E --> F["Check chain, guard code hash, authority signer and limits"]
    F --> G["Dedicated EVM signer creates EIP-712 authorization"]
    G --> H["Executor validates and simulates exact call"]
    H --> I{"Explicit broadcast requested?"}
    I -->|"No"| J["Dry-run only; no transaction sent"]
    I -->|"Yes"| K["PortalDotAgentGuardV2.executeTransfer"]
    K --> L{"EIP-712 signature, expiry, nonce, amount and balance valid?"}
    L -->|"No"| M["Revert / reject"]
    L -->|"Yes"| N["Native-token transfer + TransferExecuted event"]
```

### Security boundary

- Verigate makes the off-chain policy decision. The bridge verifies Verigate's Ed25519-signed artifacts and checks that the approved action matches the exact recipient and amount.
- The on-chain guard verifies a separate EIP-712 signature from the configured EVM authority signer. It binds the authorization to the chain, contract, recipient, amount, nonce, deadline and action ID.
- The contract does **not** verify Verigate's Ed25519 signature on-chain. That check belongs to the bridge. The guard is not a global network firewall: it only controls transfers from its own balance and has no arbitrary contract-call function.
- Execution is not automatic by default. The executor's public broadcast path requires the explicit `--broadcast` flag after validation and simulation.

## PortalDot V3 testnet

| Setting | Value |
|---|---|
| Network | PortalDot V3 EVM testnet |
| EVM RPC | `https://test-evm-rpc-v3.portaldot.dev` |
| EVM chain ID | `420420777` |
| Substrate WebSocket RPC | `wss://test-node-v3.portaldot.dev` |
| Recorded Substrate genesis hash | `0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd` |
| Node console | [node-console.portaldot.dev](https://node-console.portaldot.dev/) |
| Current contract | `PortalDotAgentGuardV2` |
| Current V2 address | `0x87C494a5e4B0A8E055F283767579667E10E046C6` |
| V2 deployment transaction (recorded) | `0x331c1fc027da51af26ed5ee92ef22a8250fe4efdf0d84526f5fe2203f5d3494b` |
| V2 runtime code hash (recorded) | `0x010a565cad83a33442d0f23f6fcb6f605a76082a5b58434813bedf84c54f0859` |
| Configured authority signer | `0x48F9B07d37b5AF744BA8195c4d6740145b593ea6` |
| Recorded V2 policy | `0.1 POT` per transfer; `0.5 POT` per resettable `3600`-second spending window; one recipient initially allowlisted |

The V2 deployment and configuration record documents the deployed bytecode, authority signer, allowlisted recipient and spend settings. The historical V2 deployment receipt is no longer returned by the configured RPC; the project records prior verification and current code/configuration readbacks separately. See [V2 deployment evidence](docs/evidence/portaldot-v2-deployment-2026-10-22.json) and the [V2 deployment runbook](docs/v2-deployment-runbook.md).

**V1 predecessor:** `PortalDotAgentGuard` at `0x3f2f484484fbE6e224d058fDfDB6B5A14F09655b`, deployed in block `116872` via `0xb1cf9cca75bb029b0a723f13c398479d2c18704c1138c02c6d92a02c1fcdce3c`. V1 does not have V2's recipient allowlist or spending cap.

### V2 live transfer evidence

A recorded Verigate `ALLOW` was followed by bridge authorization and a successful V2 transfer. The receipt and matching event were re-queried through the configured PortalDot RPC by a separate read-only verifier:

- Transaction: `0xaf3df785fdeaf85bbc9af2ae1342a7c664f4a55877469c4996eff2fe90f5551e`
- Block: `149241`
- Contract: `0x87C494a5e4B0A8E055F283767579667E10E046C6`
- Amount: `0.1 POT`
- Receipt status: `1`
- Event: exactly one matching `TransferExecuted`
- Sender debit reconciled: `7.82782148139542551 POT`; sender balance fell from `416.196502092920504516` to `408.368680611525079006 EVM POT`, matching `gasUsed × effectiveGasPriceWei` for the isolated block. Single RPC; no execution-fee/storage-deposit split.

This is single-provider testnet evidence, not independent authentication of the RPC operator. A later read-only follow-up measured the recipient balance increasing from `0` to `0.1 POT` across the same isolated block; see [cost reconciliation evidence](docs/evidence/portaldot-v2-cost-reconciliation-2026-10-23.json). This check also used the configured RPC only. The cap/allowlist negative cases have local contract-test evidence, not recorded public-chain revert evidence. The configured RPC later stopped returning the historical V2 deployment receipt. Full details: [V2 transfer evidence](docs/evidence/portaldot-v2-live-transfer-2026-10-22.json).

### Earlier V1 public transfer evidence

A Verigate-authorized transfer of `0.1` EVM POT is recorded against the V1 predecessor in [the transfer evidence report](docs/authorized-transfer-evidence-2026-10-21-nondust.md):

- Transaction: `0x21acff99d30652161f7e4ba6e1d76e6b6b67e8b9e02b09edd64d8bd7f2d5dd9c`
- Block: `132475`
- Recorded receipt status: `1` (success)
- Recorded event: `TransferExecuted` matched the action ID, recipient and amount
- Recorded guard balance delta: `-0.1` EVM POT

**Historical-RPC limitation:** the configured RPC later stopped returning this old transaction and receipt and reported discarded historical block state. The report preserves the verification performed when the receipt was available; the live dashboard does not substitute saved success for a fresh RPC response. These are single-provider testnet observations, not a second-provider cross-check or independent network authentication.

Node console is the PortalDot node UI; a dedicated EVM explorer deep link is not guaranteed to be available there. The [live DApp](https://rudimentall1.github.io/verigate-portaldot/) reads current RPC state and supports transaction-hash lookup, but an old receipt may be unavailable from the configured endpoint.

## Quick start

Requires Node.js `22.13.0` or newer. The default test and compile commands run locally and do not send public testnet transactions.

```bash
git clone https://github.com/rudimentall1/verigate-portaldot.git
cd verigate-portaldot
npm ci
npm test
npm run compile
```

To check the configured PortalDot endpoints, create a local environment file from the template and run the read-only preflight:

```bash
cp .env.example .env
# Keep the published testnet settings; do not add or commit private keys for a read-only preflight.
npm run preflight
```

Preflight checks the EVM chain ID and separately checks the Substrate endpoint against the pinned genesis hash. A matching response from one RPC is not cryptographic authentication of that endpoint.

## Local Verigate ALLOW/BLOCK integration demo

The reproducible harness `scripts/verigate_local_demo.py` uses a compatible Verigate source checkout and creates a disposable Verigate API/database/issuer plus an isolated loopback Hardhat EVM. It demonstrates a signed `ALLOW` path, a `BLOCK` refusal, bridge verification and a local transfer. It does **not** send that simulated transfer to public PortalDot.

On Windows PowerShell, from this repository, use the Python environment of a compatible Verigate checkout:

```powershell
$verigateRoot = Read-Host "Path to a compatible Verigate checkout"
$python = Join-Path $verigateRoot ".venv\Scripts\python.exe"
& $python ".\scripts\verigate_local_demo.py" --verigate-root $verigateRoot
```

The local integration may require setup of Verigate's dependencies and the selected checkout. The recorded run used Verigate revision `de24e7a02911b5803bac60f799bc1ab37891fec2`. Its local transaction hashes are not PortalDot evidence. See [local E2E verification notes](demo/E2E-LOCAL-VERIFICATION.md).

## Useful commands

| Command | Purpose |
|---|---|
| `npm test` | Run local Hardhat contract / bridge tests |
| `npm run compile` | Compile the Solidity contracts |
| `npm run preflight` | Read-only EVM + Substrate network preflight |
| `npm run monitor:rpc` | Read-only EVM chain ID and latest block check |
| `npm run verify:deployment` | Read current deployed code and authority signer |
| `npm run verify:authorized-transfer -- <TX_HASH>` | Read-only receipt and event verification, when retained by the RPC |
| `npm run bridge:sign -- ./authorization-response.json` | Verify a Verigate response and create a scoped EIP-712 authorization |
| `npm run execute:authorization -- ./signed-authorization.json` | Validate and simulate by default; broadcasting requires the explicit flag described in the CLI help/runbook |

Never commit `.env`, private keys, seed phrases, live issuer secrets or signed authorization payloads.

## Why this matters for PortalDot

PortalDot V3 exposes an EVM-compatible execution path alongside its Substrate runtime. Verigate PortalDot uses the EVM path for the guard and reads the Substrate runtime separately for network diagnostics and explorer features. The specific contribution is a reference implementation of an off-chain Verigate authorization followed by a narrowly scoped, signed native-token transfer through a contract guard.

No integration into PortalDot Wallet or DaaS is currently claimed, and no PortalDot team endorsement or external user adoption has been confirmed. This repository does not claim a production-ready multichain agent framework, a WASM/EVM cross-execution bridge, universal transaction interception, an independent audit, or mainnet readiness. The current V2 spending counter resets after its configured interval; it is not a continuously sliding rolling-window algorithm.

## Evidence and presentation

- [Architecture and trust boundaries](docs/architecture.md)
- [Network settings and units](docs/portaldot-v3-network.md)
- [Funding and account-mapping investigation, including the confirmed SubWallet/Pindex/explorer address-association discrepancy](docs/funding-and-account-mapping.md)
- [Deployment evidence](docs/deployment-evidence-2026-10-20.md)
- [0.1 EVM POT transfer evidence](docs/authorized-transfer-evidence-2026-10-21-nondust.md)
- [One-base-unit transfer evidence](docs/authorized-transfer-evidence-2026-10-21.md)
- [Three-minute demo plan](docs/demo-script.md)
- [Claims-to-verify wording matrix](claims-to-verify.md)
- [Hacker House checklist](docs/hacker-house-check-in.md)
- [Presentation PDF](docs/Verigate-PortalDot-Presentation.pdf)
- [Live DApp](https://rudimentall1.github.io/verigate-portaldot/)

**Demo recording:** [Verigate PortalDot Hacker House Demo](https://www.youtube.com/watch?v=9WhBdwGgXLk) (2:54.7, 1920×1080, 30 fps). The video labels the 21 October 2026 dashboard footage as a V1 recording and presents V2 transfer evidence for block `149241` as a text card, not as live V2 dashboard footage. The V2 receipt, event and balance readbacks used one configured RPC; no second-provider verification is claimed. Keep local ALLOW/BLOCK integration results distinct from public V1/V2 testnet transfer evidence. The MP4 and matching SRT are not committed as source files in this repository.
