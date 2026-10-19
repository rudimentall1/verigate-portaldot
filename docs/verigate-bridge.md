# Verigate bridge integration

The bridge signer is the security boundary between Verigate's Ed25519 execution authorization and the PortalDot contract's EIP-712 authorization. The initial CLI is in adapter/verigate-bridge.js.

## Required sequence

1. Read a response captured from Verigate's POST /v1/actions/authorize endpoint.
2. Require a decision receipt whose decision is exactly ALLOW, plus a separate execution authorization.
3. Independently verify both Ed25519 signatures locally against the pinned issuer key configured by `VERIGATE_PUBLIC_KEY_FILE`.
4. Ask the configured Verigate instance's POST /v1/verify endpoint for a second validation; the server response is not the sole source of signature truth.
5. Check that the receipt and execution authorization refer to the same intent and agent.
6. Check that the signed action maps exactly to a PortalDot native transfer: recipient, raw base-unit amount, chain ID, asset and network.
7. Use read-only RPC calls to verify the configured chain ID, non-empty guard bytecode, pinned `PORTALDOT_GUARD_CODE_HASH`, and on-chain `authoritySigner()` against `AUTHORITY_SIGNER_ADDRESS`.
8. Limit the on-chain signature deadline to the earlier of the Verigate authorization expiry and 120 seconds from bridge signing.
9. Sign EIP-712 data using the dedicated bridge key; never broadcast automatically from this CLI.

## Required signed intent convention

- action_type: portaldot.native_transfer
- target: destination EVM address
- network: portaldot-v3
- asset: tPOTv3
- amount_exact: positive integer string containing EVM transfer base units
- metadata.portaldot_v3.chain_id: the explicitly configured positive EVM chain ID. The value `420420777` is used only by local test fixtures and is not confirmed live-network metadata.
- metadata.portaldot_v3.recipient: same destination EVM address
- metadata.portaldot_v3.amount_base_units: same integer string as amount_exact

The policy therefore sees the same exact base-unit integer that the EVM contract will transfer. Configure policies in those units for this prototype; do not imply these are human-readable POT units.

## Signature separation

Verigate signs its off-chain authorization artifacts with Ed25519. Solidity's ecrecover verifies secp256k1 signatures, not Ed25519. The separate EVM key therefore represents a bridge trust boundary, not direct on-chain verification of Verigate's Ed25519 signature.

## Pinned issuer key

Set `VERIGATE_PUBLIC_KEY_FILE` to a local PEM containing the trusted Verigate Ed25519 public key. Verify the key fingerprint through an independent trusted channel before pinning it. Fetching `/v1/public-key` over the same endpoint alone does not protect against a compromised issuer endpoint or key-substitution attack. The bridge verifies signatures locally first, then calls `/v1/verify` as a secondary check. A missing key, wrong key type or invalid signature stops signing.

## Key separation

The deployer key pays deployment gas. The bridge signer key is configured as the immutable signer in PortalDotAgentGuard. Keep them separate, use a throwaway/test-only bridge key, and keep the guarded balance small.

## Cross-language canonical JSON

Verigate signs compact, sorted-key JSON with Python's `json.dumps(..., ensure_ascii=False)`. Python preserves the distinction between integer `1` and float `1.0`; standard JavaScript `JSON.parse` followed by `JSON.stringify` does not. The CLI therefore retains the original numeric tokens from the Verigate JSON artifact when building canonical hashes and when asking `/v1/verify` to verify the payload. Do not parse and re-serialize the signed artifact through a JavaScript client before saving it. A changed numeric representation fails closed rather than being accepted as the original signature.

## Remaining work

- Run the current CLI against a real response from the configured Verigate instance.
- Test authorization expiry, action mismatch, invalid signatures and denied decisions end to end.
- Obtain the issuer public key through a trusted channel, verify its fingerprint, and keep the pinned PEM under controlled deployment configuration. Never commit private keys.
- Never record a transaction hash or deployed address until it is confirmed on the live expected chain.


## Local end-to-end harness

Run `scripts/verigate_local_demo.py` with the Python interpreter from the Verigate checkout. The harness creates an isolated temporary Verigate API instance, seeds a test-only identity and capability, submits ALLOW and BLOCK requests through the actual HTTP routes, and verifies Ed25519 artifacts. It also starts an isolated loopback Hardhat EVM, deploys the actual PortalDotAgentGuard source using disposable deployer and bridge keys, pins that local deployment's runtime-code hash, and runs the bridge against the actual guard address. ALLOW signs only after chain, code-hash and authority checks pass; BLOCK is refused.

The harness never uses the normal Verigate database or issuer keys. Temporary private keys, node state and database files are deleted after the run. CI runs it on pushes and pull requests. Its test deployment and funding transactions remain on the loopback simulator; it does not contact public PortalDot RPC or prove a live testnet deployment.
