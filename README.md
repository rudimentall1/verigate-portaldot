# Verigate PortalDot

A focused PortalDot V3 Hacker House project exploring how an AI agent's proposed payment can be gated by an explicit, signed execution authorization.

**Status:** initial implementation scaffold. Local contract tests and live PortalDot deployment have not yet been run from this repository. The public V3 RPC has been reported unavailable by the event team; deployment must wait for a successful network preflight.

## What this MVP is intended to show

1. A Verigate policy decision can be used as the off-chain authority to approve or deny a payment intent.
2. A dedicated EVM bridge signer can issue a short-lived EIP-712 authorization only after verifying the corresponding Verigate execution authorization.
3. `PortalDotAgentGuard` accepts only a signature bound to this contract and chain, a fixed recipient, an exact native-token amount, a nonce, a deadline, and an action identifier.
4. The contract transfers only its own native balance. It has no generic arbitrary-call interface.

The contract verifies the EIP-712 bridge authorization. It does **not** verify Verigate's Ed25519 signature on-chain. That verification belongs in the off-chain bridge, and this trust boundary must remain explicit.

## Quick start

Requires Node.js 20 or newer.

```bash
npm install
npm test
npm run compile
```

The test suite uses a local Hardhat chain. Passing local tests is not evidence that PortalDot RPC, faucet, or deployment is available.

## PortalDot V3 preflight

Copy `.env.example` to `.env` and set values only when needed. Never commit private keys or funded-wallet files.

```bash
npm run preflight
```

The preflight reads `eth_chainId` and `eth_blockNumber`, and fails closed when the RPC is unavailable or returns a chain ID other than `420420777`.

## Deploy

Deployment is deliberately blocked unless RPC preflight succeeds and a deployer key is configured. Set `AUTHORITY_SIGNER_ADDRESS` to the dedicated bridge signer's EVM address. Do not use a personal wallet as a long-lived authority key.

```bash
npm run deploy:portaldot
```

Deployment has not been verified yet. Record the actual contract address, transaction hash, block number, RPC result, and date under `evidence/` after a successful deployment. Do not write placeholder hashes as evidence.

## Verigate integration boundary

The bridge must:
- submit the proposed action to Verigate;
- require an explicit `ALLOW` result;
- verify the returned Ed25519 execution authorization against Verigate's trusted public key and supported verification endpoint;
- compare the authorization's exact normalized action with the intended recipient and amount;
- enforce a short TTL and prevent duplicate bridge processing;
- only then sign the EIP-712 message with the dedicated EVM bridge key.

The bridge integration is not claimed complete in this first scaffold. See [the security model](docs/security-model.md).

## Scope and limitations

- The first on-chain action is a native-token payment only.
- tPOT is the PortalDot V3 testnet gas token. The actual RPC and the relevant wallet mapping must be confirmed before any deployment.
- No live deployment, independent audit, production key management, or production readiness is claimed.
- This repository is a new PortalDot-specific integration, not a copy of Verigate.

## Source and credits

Verigate is the existing authority-control project: <https://github.com/rudimentall1/verigate>. Its code and concepts remain in the original repository; this repository adds a separate PortalDot integration. Review upstream license and attribution requirements before reusing code.

## License

MIT. See [LICENSE](LICENSE).
