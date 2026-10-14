# Verigate PortalDot

A focused PortalDot V3 Hacker House project exploring how an AI agent's proposed payment can be gated by an explicit, signed execution authorization.

**Status (14 October 2026):** the repository has a native-payment guard, bridge-signing CLI, RPC preflight, local Hardhat tests, and an isolated Verigate API integration helper. GitHub Actions passed `npm test` and `npm run compile` for [commit 4e473c7](https://github.com/rudimentall1/verigate-portaldot/commit/4e473c76d8cda1d4ffe07e16cb58b9f68cbc5597). Recent contract tests cover the five-minute authorization boundary, replay protection, malformed and malleable signatures, reentrancy, and rollback when a recipient rejects payment. The isolated integration helper previously passed locally: signed ALLOW artifacts were verified, BLOCK was refused, and no transaction was broadcast. No live PortalDot deployment is claimed. The V3 EVM RPC endpoint and chain ID still need independent confirmation before deployment.

## What this MVP demonstrates

1. Verigate evaluates an agent's proposed action under its policies.
2. The off-chain bridge requires a signed ALLOW decision and a valid Ed25519 execution authorization.
3. A dedicated EVM bridge signer issues a short-lived EIP-712 authorization only when the signed action matches the exact recipient and amount encoded for PortalDot.
4. PortalDotAgentGuard accepts only a signature bound to this contract and chain, a recipient, native-token amount, nonce, deadline, and action identifier.
5. The contract can send only its own native-token balance. It has no generic arbitrary-call interface.

The contract verifies an EIP-712 bridge authorization. It does **not** verify Verigate's Ed25519 signature on-chain. That verification belongs in the off-chain bridge, and this trust boundary must remain explicit.

See [architecture and trust boundaries](docs/architecture.md) for the flow diagram and a clear distinction between implemented and not-yet-connected steps. The [Hacker House check-in checklist](docs/hacker-house-check-in.md) tracks deliverables and remaining blockers.

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

Run from this repository in PowerShell, using the Python environment from your local Verigate checkout:

```powershell
$verigateRoot = "$env:USERPROFILE\Desktop\Work\verigate\verigate"
& "$verigateRoot\.venv\Scripts\python.exe" ".\scripts\verigate_local_demo.py" --verigate-root $verigateRoot
```

If port 8001 is occupied, add `--port 8011`. The script prints the paths to the ALLOW response, BLOCK response, dry-run signature and summary. These are local test artifacts, not PortalDot deployment evidence.

## PortalDot V3 preflight

Copy .env.example to .env. Keep private keys out of Git.

```bash
npm run preflight
```

The preflight requires PORTALDOT_RPC_URL and PORTALDOT_CHAIN_ID to be explicitly configured. Both are blank in .env.example because the repository's previous RPC endpoint and chain ID have not been independently confirmed. It reads eth_chainId and eth_blockNumber and refuses deployment if the endpoint is unreachable or the reported chain ID differs from the configured value. Do not fill these values from guesses or use a deployment key until the official EVM network details are confirmed. The deployment script repeats the configuration checks so it also fails closed when invoked directly.

## Contract deployment

Only after the official EVM RPC and chain ID are confirmed, set PORTALDOT_RPC_URL, PORTALDOT_CHAIN_ID, DEPLOYER_PRIVATE_KEY, and AUTHORITY_SIGNER_ADDRESS in the untracked .env file. The deployer and authority signer must be separate keys: the deployer pays deployment gas, while the authority signer is the dedicated EVM key used by the bridge. The deployment script refuses a zero authority address or the same address for both roles.

```bash
npm run deploy:portaldot
```

The command runs network preflight before Hardhat deployment. Deployment is not verified yet. Save the actual address, transaction hash, block number, timestamp, and explorer link under evidence/ only after confirmation on the live expected chain.

After deployment, set PORTALDOT_GUARD_ADDRESS in .env.

## Bridge signing CLI

The CLI accepts a JSON response from Verigate's POST /v1/actions/authorize endpoint. It verifies the decision receipt and execution authorization through the configured Verigate POST /v1/verify endpoint, then signs only the narrowly defined transfer mapping.

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
- The EVM testnet RPC, chain ID, token denomination, and wallet mapping are not yet confirmed from an authoritative PortalDot source. The published [PortalDot developer chain info](https://portaldot-dev.readthedocs.io/en/latest/chain-info.html) documents a Substrate WebSocket endpoint for mainnet, not the EVM testnet configured here. Do not deploy until the target network is independently identified.
- No live deployment, independent audit, production key management, or production readiness is claimed.
- This is a separate PortalDot integration, not a copy of the Verigate repository.

## Source and credits

Verigate is the existing authority-control project: https://github.com/rudimentall1/verigate. This repository adds a separate PortalDot integration. Review upstream license and attribution requirements before reusing code.

## License

MIT. See LICENSE.
