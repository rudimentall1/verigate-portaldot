# Verigate PortalDot

A focused PortalDot V3 Hacker House project exploring how an AI agent's proposed payment can be gated by an explicit, signed execution authorization.

**Status (21 October 2026):** the repository includes a native-payment guard, an Ed25519-verifying bridge signer, read-only network preflight and monitoring, deployment-budget checks, a guarded transfer executor, and read-only Substrate runtime/account diagnostics. The executor validates the EIP-712 signature, configured chain and guard, pinned runtime-code hash, on-chain authority signer, deadline, recipient and amount; it simulates the exact call and checks guard funds and relayer gas budget before broadcasting. By default it is dry-run only; submitting a transaction requires an explicit `--broadcast` flag. CI exercises the full flow on a temporary loopback Hardhat EVM only. A `PortalDotAgentGuard` testnet deployment has now been verified by transaction receipt, runtime bytecode hash, and on-chain authority-signer readback; the first public Verigate-authorized guard transfer has also been confirmed by receipt and TransferExecuted event. Its amount is one base unit, so a meaningful-value transfer remains the next validation step; see [live deployment evidence](docs/deployment-evidence-2026-10-20.md) and the [testnet operations runbook](docs/testnet-operations-2026-10-20.md). The bridge pins the Verigate issuer key with `VERIGATE_PUBLIC_KEY_SHA256`, preserves Python-signed JSON number spellings, and accepts only exact positive base-unit integer strings. The latest local deployment workspace verification reports 156 tests passing, with Solidity compilation, network preflight, RPC monitoring, and isolated ALLOW/BLOCK execution checked locally. The validated implementation tree passed the current GitHub Actions Test, dependency audit, PortalDot RPC health, PortalDot CI, and Substrate runtime metadata workflows; links are recorded in the [updated pull request](https://github.com/rudimentall1/verigate-portaldot/pull/10). The local deployment workspace reports 156 tests passed. The 151-test CI runs on older revisions should not be confused with the current implementation-tree checks. The one-key mapping verifier also records the reported runtime spec and finalized block before its storage lookup. A read-only Substrate metadata probe confirmed the reported V3 runtime (specVersion 3002), `Revive.OriginalAccount` mapping schema (H160 key to AccountId32 value), `AutoMap=true`, `NativeToEthRatio=10000`, and runtime storage-deposit constants. The exact H160-to-SS58 mapping for a particular wallet remains a separate one-key read-only check. See the [runtime evidence record](evidence/portaldot-v3-runtime-2026-10-19.json), [network configuration](docs/portaldot-v3-network.md), and [funding/account mapping guide](docs/funding-and-account-mapping.md). A chain ID or one RPC response does not authenticate the endpoint. These checks reduce configuration mistakes but are not a full application or smart-contract audit.

## What this MVP demonstrates

1. Verigate evaluates an agent's proposed action under its policies.
2. The off-chain bridge requires a signed ALLOW decision and a valid Ed25519 execution authorization.
3. A dedicated EVM bridge signer issues a short-lived EIP-712 authorization only when the signed action matches the exact recipient and amount encoded for PortalDot.
4. PortalDotAgentGuard accepts only a signature bound to this contract and chain, a recipient, native-token amount, nonce, deadline, and action identifier.
5. The contract can send only its own native-token balance. It has no generic arbitrary-call interface.

The contract verifies an EIP-712 bridge authorization. It does **not** verify Verigate's Ed25519 signature on-chain. That verification belongs in the off-chain bridge, and this trust boundary must remain explicit.

See [architecture and trust boundaries](docs/architecture.md), the [verified testnet deployment record](docs/deployment-evidence-2026-10-20.md), and the [testnet operations runbook](docs/testnet-operations-2026-10-20.md). The [Hacker House submission checklist](docs/hacker-house-check-in.md) tracks the requirements. The [submission text draft](docs/check-in-submission.md) and [seven-slide presentation PDF](docs/Verigate-PortalDot-Presentation.pdf) are prepared; the product demo recording remains pending and will be added separately.

## Live Web3 DApp

Public Web3 DApp: https://rudimentall1.github.io/verigate-portaldot/

GitHub Pages serves the static frontend directly from the repository. Source: [web3-dapp/index.html](web3-dapp/index.html). The live-state view works without a wallet; its separate executor supports opt-in wallet connection, exact bridge-signed authorization import, on-chain simulation, and a user-confirmed transaction relay. It never asks for private keys or seed phrases. A minimal public authorized guard call is now recorded in [transaction evidence](docs/authorized-transfer-evidence-2026-10-21.md); the amount was one EVM base unit, so a meaningful-value transfer remains pending.

The Web3 DApp at https://rudimentall1.github.io/verigate-portaldot/ reads live PortalDot V3 state and includes an explicit wallet-gated execution panel for a signed Verigate authorization. Account access, network switching and transaction broadcast are user-triggered; the exact call must pass on-chain simulation before the wallet is asked to submit it. The DApp never asks for private keys or seed phrases. The minimal receipt confirms the guard call path, but does not prove a meaningful-value payment.

## Hacker House submission package

- Recommended track: **Modular Cloud Solutions and Middleware**. The main contribution is an authorization/execution middleware component, not a node-monitoring dashboard or a cross-chain asset bridge.
- [Submission text draft](docs/check-in-submission.md)
- [Requirements and readiness checklist](docs/hacker-house-check-in.md)
- [Presentation PDF](docs/Verigate-PortalDot-Presentation.pdf)
- [Live Web3 DApp](https://rudimentall1.github.io/verigate-portaldot/)
- [Verified testnet deployment evidence](docs/deployment-evidence-2026-10-20.md)
- [Authorized public testnet transfer evidence](docs/authorized-transfer-evidence-2026-10-21.md)
- Demo recording: pending. Show live state, the wallet-gated authorization flow and the verified receipt; clearly label the one-base-unit amount and remaining non-dust validation.
The public testnet deployment and a minimal Verigate-authorized guard call are confirmed by receipt and TransferExecuted evidence. The amount was one EVM base unit, so a meaningful-value payment and the specific H160-to-SS58 mapping remain unverified.

## Quick start

Requires Node.js 22.13.0 or newer.

```bash
npm install
npm test
npm run compile
```

The tests use a local Hardhat chain. Passing local tests is not evidence that PortalDot RPC, faucet, or deployment is available.

## Isolated Verigate API integration check

The helper runs a temporary Verigate instance on loopback port 8001 with a disposable database, issuer keys and a narrow test policy. It submits ALLOW and BLOCK through the real HTTP routes and verifies the returned Ed25519 artifacts. It also starts an isolated Hardhat EVM bound to `127.0.0.1`, configures that simulator with chain ID `420420777` solely for EIP-712 domain testing, funds a disposable deployer, and deploys the repository's actual `PortalDotAgentGuard` source. The bridge must verify the local guard's chain, non-empty bytecode, runtime-code hash and authority signer, and verify the disposable issuer key against its SHA-256 SPKI fingerprint before signing ALLOW; BLOCK is refused.

The simulator is not the public PortalDot testnet, and the configured chain ID is not proof of network identity. Temporary private keys, issuer keys, and runtime database files are deleted after the run. Only sanitized response/signature fixtures and a summary are retained. The test does not contact a public RPC endpoint, and all EVM deployment/funding activity stays on the loopback simulator.

The API route used by this integration (`/v1/actions/authorize`) is not available in older Verigate checkouts. The successful local run on 20 October used the Verigate repository at commit `de24e7a` in an isolated worktree; the installed `/opt/verigate` checkout on the build server remained untouched. Use a compatible, current Verigate source checkout with its dependencies installed. Do not assume an older deployment checkout is compatible just because its API starts.

Run from this repository in PowerShell, using the Python environment associated with that compatible Verigate checkout:

```powershell
$verigateRoot = Read-Host "Path to a compatible Verigate checkout"
$python = Join-Path $verigateRoot ".venv\Scripts\python.exe"
& $python ".\scripts\verigate_local_demo.py" --verigate-root $verigateRoot
```

If port 8001 is occupied, add `--port 8011`. The script prints the paths to the ALLOW response, BLOCK response, dry-run signature and summary. These are local test artifacts, not PortalDot deployment evidence.

## PortalDot V3 preflight

Copy .env.example to .env. Keep private keys out of Git.

```bash
npm run preflight
```

The preflight requires the EVM endpoint, chain ID, Substrate WebSocket endpoint (`PORTALDOT_SUBSTRATE_RPC_URL`), and independently confirmed `PORTALDOT_SUBSTRATE_GENESIS_HASH`. It reads `eth_chainId` and `eth_blockNumber` from the EVM RPC, then separately requests `chain_getBlockHash(0)` over Substrate WebSocket. It does not treat the Substrate genesis hash as an EVM block hash. The network values and unit conversion are documented in [docs/portaldot-v3-network.md](docs/portaldot-v3-network.md). Remote RPC endpoints must use HTTPS; plain HTTP is allowed only for loopback local development. **Neither a matching chain ID nor a matching hash returned by one untrusted RPC cryptographically authenticates that RPC.** The cited network guide records the native unit conversion and H160-to-Substrate-account mapping; verify the recipient's mapped account and live balance before sending funds. The direct deployment script repeats the Substrate genesis-pin check before deployment.

## Read-only RPC monitor

Run a one-shot, read-only health check against the configured PortalDot EVM RPC:

```bash
npm run monitor:rpc
```

The monitor requests only `eth_chainId` and `eth_blockNumber`, reports the check time, RPC origin, response latency, and block height as JSON, and exits non-zero on a chain-ID mismatch or RPC error. It sends no transactions, requires no private key, and is not a persistent background service. Use a scheduler or uptime platform only after reviewing its security and logging settings.

## Funding the EVM deployer address

Substrate SS58 accounts and EVM H160 addresses are different account forms. The deterministic fallback SS58 account for an H160 is derived by appending twelve `0xEE` bytes. A read-only inspection of PortalDot V3 runtime `specVersion=3002` decoded the actual `Revive.OriginalAccount` storage as H160 → `AccountId32`, with `Revive.AutoMap=true`; `Revive.AddressSuffix` is not present in this runtime. This does not reveal the mapping value for a specific wallet. See [funding and account mapping](docs/funding-and-account-mapping.md) for the observed runtime constants and the safe one-key query. The [Polkadot pallet-revive account guide](https://docs.polkadot.com/smart-contracts/for-eth-devs/accounts/) is general SDK context, not a substitute for the live mapping value.

To print the deterministic fallback SS58 address for an EVM account without entering a private key:

```bash
npm run address:substrate -- 0xYourEvmAddress
```

To decode a Substrate SS58 AccountId32 and calculate its expected H160 under current upstream `pallet-revive` rules, optionally compare it to a wallet-displayed EVM address:

```bash
npm run address:inspect -- 5YourSubstrateAddress 0xCandidateEvmAddress
```

This tool validates the SS58 checksum and reports the offline derivation; it does not query the PortalDot runtime or confirm a stateful mapping. The current upstream rule uses the last 20 bytes of `keccak256(AccountId32)` for ordinary Substrate accounts, but runtime versions may differ. A mismatch does not prove an address is wrong or unusable.

To compare one H160 with one registered SS58 account using PortalDot V3's actual `Revive.OriginalAccount` storage, install the matching CLI and run this locally:

```bash
npm install --global polkadot-cli@1.25.0
npm run verify:account-mapping -- 0xCandidateEvmAddress 5RegisteredSubstrateAddress --redact
```

The command reads the chain's runtime metadata, checks the reported `Revive.ChainId`, queries exactly one H160 key at the captured finalized block, and compares the returned raw `AccountId32` bytes with the supplied SS58 account. It uses a temporary Polkadot CLI home, no private key or mnemonic, and makes no extrinsic or transaction. Its output distinguishes `mapping_matches`, `mapping_points_to_another_account`, and `no_mapping_entry`. The recommended `--redact` mode prints the result and runtime block fingerprint without either wallet address or mapped AccountId32. The RPC still receives the one H160 key to perform the lookup; the flag prevents the address pair from being echoed to the terminal or a copied report. Run this locally rather than putting a personally identifying address pair in public CI logs or artifacts. A one-RPC result is still not independent network authentication.

Do not infer the reason for a balance difference without transaction evidence.

## Read-only deployment cost estimate

Before funding or broadcasting a deployment, estimate the actual compiled `PortalDotAgentGuard` creation bytecode against the configured testnet:

```bash
# Set DEPLOYMENT_ESTIMATE_FROM in the untracked .env. AUTHORITY_SIGNER_ADDRESS is optional for a preliminary estimate.
npm run estimate:deployment
```

The estimator verifies the configured chain ID and pinned Substrate genesis, builds constructor init code, calls `eth_estimateGas`, reads the latest block's `baseFeePerGas`, calls `eth_maxPriorityFeePerGas` and `eth_getBalance`, and prints estimated cost in EVM POT units, live balance, and a 20% safety-margin result. It requires the public EVM address of the account that will deploy (or derives it locally from `DEPLOYER_PRIVATE_KEY`); the key is never sent, and the estimator does not sign or broadcast a transaction. If `AUTHORITY_SIGNER_ADDRESS` is unset, it uses a clearly labelled placeholder solely for a preliminary cost probe; this is not a deployment configuration. If the node refuses estimation because the account is underfunded, treat the estimate as inconclusive and re-run after funding the account. The estimate may include PortalDot's code-storage deposit, so use this project's current compiled bytecode rather than a generic sample size.

## Local deployer identity check

Before any live RPC quote or deployment, compare the EVM address shown by the wallet with the address derived locally from the untracked `.env` `DEPLOYER_PRIVATE_KEY`:

```bash
npm run verify:deployer-address -- 0xWalletDisplayedEvmAddress --redact
```

The command derives the deployer address locally, prints no private key, and makes no RPC request or transaction. It compares the derived address with the supplied wallet address and, when configured, `DEPLOYMENT_ESTIMATE_FROM`; a configured authority signer must be a distinct non-zero address. A match is only a local key/address check: it does not verify PortalDot mapping, authenticate the RPC, estimate fees, or authorize deployment. Never paste a private key or seed phrase into chat.

## Contract deployment

Copy `.env.example` to the untracked `.env`, preserve the announced RPC settings, and set `DEPLOYER_PRIVATE_KEY` and `AUTHORITY_SIGNER_ADDRESS` only when ready to deploy. The deployer and authority signer must be separate keys: the deployer pays deployment gas, while the authority signer is the dedicated EVM key used by the bridge. The deployment script refuses a zero authority address or the same address for both roles.

```bash
npm run deploy:portaldot
```

The command runs preflight before deployment; direct invocation also checks chain ID and any configured genesis-hash pin. Immediately before broadcasting, the deploy script now requests the exact constructor `eth_estimateGas`, the latest block's `baseFeePerGas`, `eth_maxPriorityFeePerGas`, and deployer balance, computes a 20% safety margin, and refuses to broadcast if the budget is insufficient or any quote call fails. This is a guardrail, not a guarantee that the RPC is honest or fees cannot change. Its JSON result includes the configured RPC origin, chain ID, observed genesis hash, contract address, transaction hash, block number, and runtime-code hash. A pin is an extra wrong-network guardrail, not proof that a potentially malicious RPC is honest. Save evidence only after independently confirming network identity, transaction and deployed bytecode in trusted sources.

After verification, set `PORTALDOT_GUARD_ADDRESS` and the matching `PORTALDOT_GUARD_CODE_HASH` in `.env`. The code hash is checked before every bridge signature to reduce accidental/malicious contract-address substitution. It must be verified against the intended contract deployment; do not blindly copy values from an untrusted RPC response.

## Bridge signing CLI

The CLI accepts a JSON response from Verigate's POST /v1/actions/authorize endpoint. It independently verifies both Ed25519 signatures against the locally pinned PEM path in `VERIGATE_PUBLIC_KEY_FILE`, then asks the configured `/v1/verify` endpoint for a second check. Before creating the EIP-712 signature, it also checks the live chain ID and requires the Substrate WebSocket `chain_getBlockHash(0)` result to match the independently pinned `PORTALDOT_SUBSTRATE_GENESIS_HASH`, requires contract bytecode at `PORTALDOT_GUARD_ADDRESS`, compares the runtime-code Keccak hash against `PORTALDOT_GUARD_CODE_HASH`, and verifies the contract's `authoritySigner()` against `AUTHORITY_SIGNER_ADDRESS`. Missing/mismatched values fail closed. Do not blindly trust a public key or RPC endpoint supplied by the same untrusted source; independently verify the issuer-key fingerprint, RPC identity, and deployed code.

```bash
npm run bridge:sign -- ./authorization-response.json
```

The accepted action must have:
- decision exactly ALLOW;
- a valid Ed25519 decision receipt and execution authorization according to the trusted Verigate instance;
- action_type equal to portaldot.native_transfer;
- network equal to portaldot-v3 and asset equal to tPOTv3;
- a valid recipient address in target;
- amount_exact set to an integer string of PortalDot EVM base units;
- metadata.portaldot_v3 containing matching chain_id, recipient, and amount_base_units.

The amount is represented in raw EVM transfer base units to avoid guessing how PortalDot V3 maps Substrate token decimals to EVM value units. Confirm the live network denomination before presenting user-facing amounts. The bridge CLI signs a payload; it does not broadcast a transaction.

## Execute a signed transfer

A signed authorization JSON created by the bridge is not automatically submitted. The execution CLI validates its EIP-712 signer/domain and exact transfer fields, checks the deployed guard's bytecode hash and `authoritySigner()`, validates expiry and guard balance, then simulates the call and checks the relayer's gas budget with a 20% margin.

First sign the already-authorized Verigate response and run the executor in read-only simulation mode:

```bash
npm run bridge:sign -- ./authorization-response.json > ./signed-transfer.json
npm run execute:authorization -- ./signed-transfer.json
```

Dry-run mode does not broadcast a transaction. It still needs the verified network URL and chain ID, `PORTALDOT_GUARD_ADDRESS`, `PORTALDOT_GUARD_CODE_HASH`, `AUTHORITY_SIGNER_ADDRESS`, and either `DEPLOYMENT_ESTIMATE_FROM` (public relayer address) or a locally configured `DEPLOYER_PRIVATE_KEY` from which to derive the address. If both are set, they must match.

**The following command is the only executor path that submits a payment:**

```bash
npm run execute:authorization -- ./signed-transfer.json --broadcast
```

Broadcast mode additionally requires `DEPLOYER_PRIVATE_KEY` in the local, untracked `.env`; that key pays transaction fees and must be different from the authority signer. Immediately before submission the CLI refreshes the block timestamp, rechecks the guard deployment and balance, repeats the exact transfer simulation and gas estimation, and fetches a fresh `eth_gasPrice`. It recalculates the 20% relayer fee budget from those fresh values and refuses to send if the authorization is about to expire, the nonce was consumed, the simulation fails, or the budget is insufficient. The command executes only the exact recipient, amount, nonce, deadline and action ID in the signed payload. **Do not use `--broadcast` until the target network, deployed contract, signer, balance and fee estimate have been independently checked.** The repository's automated integration uses the broadcast path only against its temporary loopback EVM.

## Verigate integration boundary

The bridge must stop for WARN, BLOCK, a missing execution authorization, an invalid signature, expired authority, or any mismatch between the signed action and the transfer parameters. See docs/verigate-bridge.md and docs/security-model.md.

The bridge-signing CLI is an initial integration step, not a claim that a full agent workflow or production key service already exists. Its API signature checks rely on the configured Verigate instance; protect that endpoint and bridge key.

## Scope and limitations

- The first on-chain operation is a native-token payment only.
- The PortalDot V3 EVM endpoint and chain ID are documented from a community field guide attributed to the official PortalDot Discord `#dev-announcement` dated 2026-10-16; this does not authenticate the RPC operator. `PORTALDOT_SUBSTRATE_GENESIS_HASH` is the separate Substrate genesis hash, not an EVM genesis hash. Reconfirm it through a trusted PortalDot source before using funds or broadcasting. Preflight, estimation, deployment and bridge signing fail closed while the pin is missing. The EVM/Substrate address mapping and token precision are documented with their community-guide source; independently verify them before using testnet funds or deploying.
- No production deployment, independent audit, production key management, or production readiness is claimed. The testnet deployment and its limits are recorded in [deployment evidence](docs/deployment-evidence-2026-10-20.md).
- This is a separate PortalDot integration, not a copy of the Verigate repository.

## Source and credits

Verigate is the existing authority-control project: https://github.com/rudimentall1/verigate. This repository adds a separate PortalDot integration. Review upstream license and attribution requirements before reusing code.

## License

MIT. See LICENSE.
