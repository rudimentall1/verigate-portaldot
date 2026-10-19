# Verigate PortalDot

A focused PortalDot V3 Hacker House project exploring how an AI agent's proposed payment can be gated by an explicit, signed execution authorization.

**Status (19 October 2026):** the repository has a native-payment guard, an Ed25519-verifying bridge signer, preflight and RPC monitoring, Hardhat 3 local tests, and a real-API integration harness. The current migrated branch adds an independent `VERIGATE_PUBLIC_KEY_SHA256` pin for the Ed25519 issuer key and regression tests for missing or mismatched fingerprints. The test suite and PortalDot CI must pass on the updated head before this change is considered verified. Before issuing an EIP-712 signature, the bridge now verifies the configured chain ID, checks that the guard address has runtime bytecode, compares its Keccak runtime-code hash to `PORTALDOT_GUARD_CODE_HASH`, and checks that on-chain `authoritySigner()` matches the configured authority. These checks reduce configuration errors but do not make an untrusted RPC endpoint trustworthy; independently verify the endpoint and contract bytecode. No live PortalDot deployment is claimed.

## What this MVP demonstrates

1. Verigate evaluates an agent's proposed action under its policies.
2. The off-chain bridge requires a signed ALLOW decision and a valid Ed25519 execution authorization.
3. A dedicated EVM bridge signer issues a short-lived EIP-712 authorization only when the signed action matches the exact recipient and amount encoded for PortalDot.
4. PortalDotAgentGuard accepts only a signature bound to this contract and chain, a recipient, native-token amount, nonce, deadline, and action identifier.
5. The contract can send only its own native-token balance. It has no generic arbitrary-call interface.

The contract verifies an EIP-712 bridge authorization. It does **not** verify Verigate's Ed25519 signature on-chain. That verification belongs in the off-chain bridge, and this trust boundary must remain explicit.

See [architecture and trust boundaries](docs/architecture.md) for the flow diagram and a clear distinction between implemented and not-yet-connected steps. The [Hacker House check-in checklist](docs/hacker-house-check-in.md) tracks deliverables and remaining blockers. The [three-minute demo script](docs/demo-script.md) covers the verified local flow and its limitations. The [check-in submission draft](docs/check-in-submission.md) is ready to adapt for DoraHacks.

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

Run from this repository in PowerShell, using the Python environment from your own Verigate checkout:

```powershell
$verigateRoot = Read-Host "Path to your Verigate checkout"
$python = Join-Path $verigateRoot ".venv\Scripts\python.exe"
& $python ".\scripts\verigate_local_demo.py" --verigate-root $verigateRoot
```

If port 8001 is occupied, add `--port 8011`. The script prints the paths to the ALLOW response, BLOCK response, dry-run signature and summary. These are local test artifacts, not PortalDot deployment evidence.

## PortalDot V3 preflight

Copy .env.example to .env. Keep private keys out of Git.

```bash
npm run preflight
```

The preflight uses the endpoint and chain ID recorded in `.env.example`. It reads `eth_chainId` and `eth_blockNumber` and refuses deployment if the endpoint is unreachable or the reported chain ID differs from the configured value. Remote RPC endpoints must use HTTPS; plain HTTP is allowed only for loopback local development. **A matching chain ID alone does not authenticate an RPC endpoint.** Before using a funded key, independently confirm the RPC endpoint, inspect the expected chain in a trusted explorer, and understand the native-token denomination and EVM/Substrate address mapping. The deployment script repeats its configuration checks when invoked directly.

## Read-only RPC monitor

Run a one-shot, read-only health check against the configured PortalDot EVM RPC:

```bash
npm run monitor:rpc
```

The monitor requests only `eth_chainId` and `eth_blockNumber`, reports the check time, RPC origin, response latency, and block height as JSON, and exits non-zero on a chain-ID mismatch or RPC error. It sends no transactions, requires no private key, and is not a persistent background service. Use a scheduler or uptime platform only after reviewing its security and logging settings.

## Contract deployment

Copy `.env.example` to the untracked `.env`, preserve the announced RPC settings, and set `DEPLOYER_PRIVATE_KEY` and `AUTHORITY_SIGNER_ADDRESS` only when ready to deploy. The deployer and authority signer must be separate keys: the deployer pays deployment gas, while the authority signer is the dedicated EVM key used by the bridge. The deployment script refuses a zero authority address or the same address for both roles.

```bash
npm run deploy:portaldot
```

The command runs network preflight before Hardhat deployment. Its JSON result includes the configured RPC origin, chain ID, contract address, transaction hash, block number, and runtime-code hash. The script labels the endpoint as a configured EVM RPC rather than claiming that the chain ID proves PortalDot identity. Save evidence only after independently confirming the transaction and deployed bytecode in a trusted explorer.

After verification, set `PORTALDOT_GUARD_ADDRESS` and the matching `PORTALDOT_GUARD_CODE_HASH` in `.env`. The code hash is checked before every bridge signature to reduce accidental/malicious contract-address substitution. It must be verified against the intended contract deployment; do not blindly copy values from an untrusted RPC response.

## Bridge signing CLI

The CLI accepts a JSON response from Verigate's POST /v1/actions/authorize endpoint. It independently verifies both Ed25519 signatures against the locally pinned PEM path in `VERIGATE_PUBLIC_KEY_FILE`, then asks the configured `/v1/verify` endpoint for a second check. Before creating the EIP-712 signature, it also connects to `PORTALDOT_RPC_URL` using read-only calls, checks the live chain ID, requires contract bytecode at `PORTALDOT_GUARD_ADDRESS`, compares the runtime-code Keccak hash against `PORTALDOT_GUARD_CODE_HASH`, and verifies the contract's `authoritySigner()` against `AUTHORITY_SIGNER_ADDRESS`. Missing/mismatched values fail closed. Do not blindly trust a public key or RPC endpoint supplied by the same untrusted source; independently verify the issuer-key fingerprint, RPC identity, and deployed code.

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

## Verigate integration boundary

The bridge must stop for WARN, BLOCK, a missing execution authorization, an invalid signature, expired authority, or any mismatch between the signed action and the transfer parameters. See docs/verigate-bridge.md and docs/security-model.md.

The bridge-signing CLI is an initial integration step, not a claim that a full agent workflow or production key service already exists. Its API signature checks rely on the configured Verigate instance; protect that endpoint and bridge key.

## Scope and limitations

- The first on-chain operation is a native-token payment only.
- The PortalDot team announced the V3 EVM RPC and chain ID on 17 October 2026. Live preflight is still required, and token denomination plus native/EVM wallet mapping should be confirmed before using testnet funds.
- No live deployment, independent audit, production key management, or production readiness is claimed.
- This is a separate PortalDot integration, not a copy of the Verigate repository.

## Source and credits

Verigate is the existing authority-control project: https://github.com/rudimentall1/verigate. This repository adds a separate PortalDot integration. Review upstream license and attribution requirements before reusing code.

## License

MIT. See LICENSE.
