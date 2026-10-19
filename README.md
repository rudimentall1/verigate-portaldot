# Verigate PortalDot

A focused PortalDot V3 Hacker House project exploring how an AI agent's proposed payment can be gated by an explicit, signed execution authorization.

**Status (15 October 2026):** the repository has a native-payment guard, bridge-signing CLI, RPC preflight, local Hardhat tests, and a real-API integration harness. The latest successful [PortalDot CI](https://github.com/rudimentall1/verigate-portaldot/actions/runs/38681783295) and [unit-test run](https://github.com/rudimentall1/verigate-portaldot/actions/runs/38681783332) validate the pinned-key integration and contract tests; subsequent edits here are documentation-only. The integration job starts a disposable loopback Verigate API, locally verifies both Ed25519 artifacts against a pinned public key, checks them through the API as a second layer, signs a dry-run EIP-712 authorization only for ALLOW, refuses BLOCK, and uploads its test evidence. A forged signature is refused locally even when a test verifier responds `valid: true`. No transaction is broadcast. The bridge preserves source numeric spellings in signed JSON because Python distinguishes `1` from `1.0`, while standard JavaScript parsing collapses them. The PortalDot team announced the updated V3 testnet endpoint `https://test-evm-rpc-v3.portaldot.dev` and EVM chain ID `420420777` on 17 October 2026. `.env.example` now uses those announced values; run preflight to verify live connectivity and chain ID before any deployment. No live PortalDot deployment is claimed.

## What this MVP demonstrates

1. Verigate evaluates an agent's proposed action under its policies.
2. The off-chain bridge requires a signed ALLOW decision and a valid Ed25519 execution authorization.
3. A dedicated EVM bridge signer issues a short-lived EIP-712 authorization only when the signed action matches the exact recipient and amount encoded for PortalDot.
4. PortalDotAgentGuard accepts only a signature bound to this contract and chain, a recipient, native-token amount, nonce, deadline, and action identifier.
5. The contract can send only its own native-token balance. It has no generic arbitrary-call interface.

The contract verifies an EIP-712 bridge authorization. It does **not** verify Verigate's Ed25519 signature on-chain. That verification belongs in the off-chain bridge, and this trust boundary must remain explicit.

See [architecture and trust boundaries](docs/architecture.md) for the flow diagram and a clear distinction between implemented and not-yet-connected steps. The [Hacker House check-in checklist](docs/hacker-house-check-in.md) tracks deliverables and remaining blockers. The [three-minute demo script](docs/demo-script.md) covers the verified local flow and its limitations. The [check-in submission draft](docs/check-in-submission.md) is ready to adapt for DoraHacks.

## Quick start

Requires Node.js 20 or newer.

```bash
npm install
npm test
npm run compile
```

The tests use a local Hardhat chain. Passing local tests is not evidence that PortalDot RPC, faucet, or deployment is available.

## Isolated Verigate API integration check

The helper runs a second, temporary Verigate instance on loopback port 8001 with a disposable database, issuer keys and a narrow test policy. It creates a fresh test agent identity and capability, submits signed ALLOW and BLOCK actions through the real HTTP endpoints, verifies the returned Ed25519 artifacts, then runs the PortalDot bridge CLI against both responses. The ALLOW case signs only against a dummy contract address; the BLOCK case must be refused.

It does not use the running Verigate server on port 8000, read its .env, or modify its database. Temporary private keys and database files are deleted after the run. Output JSON files are retained in a separate operating-system temp folder. No chain transaction is sent.

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

The preflight uses the endpoint and chain ID from the PortalDot team announcement recorded in `.env.example`. It reads `eth_chainId` and `eth_blockNumber` and refuses deployment if the endpoint is unreachable or the reported chain ID differs from the configured value. Remote RPC endpoints must use HTTPS; plain HTTP is allowed only for loopback local development. It reads eth_chainId and eth_blockNumber and refuses deployment if the endpoint is unreachable or the reported chain ID differs from the configured value. Do not deploy or use a funded deployment key until preflight succeeds and token denomination and wallet mapping are understood. The deployment script repeats the configuration checks so it also fails closed when invoked directly.

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

The command runs network preflight before Hardhat deployment. Deployment is not verified yet. Save the actual address, transaction hash, block number, timestamp, and explorer link under evidence/ only after confirmation on the live expected chain.

After deployment, set PORTALDOT_GUARD_ADDRESS in .env.

## Bridge signing CLI

The CLI accepts a JSON response from Verigate's POST /v1/actions/authorize endpoint. Before contacting the API verifier, it independently verifies both Ed25519 signatures against the locally pinned PEM path in `VERIGATE_PUBLIC_KEY_FILE`. It then asks the configured `/v1/verify` endpoint for a second check and signs only the narrowly defined transfer mapping. Do not blindly trust a public key downloaded from the same endpoint: verify its fingerprint through an independent trusted channel.

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
