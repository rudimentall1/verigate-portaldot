# Verigate bridge integration

The bridge signer is the security boundary between Verigate's Ed25519 execution authorization and the PortalDot contract's EIP-712 authorization. The initial CLI is in adapter/verigate-bridge.js.

## Required sequence

1. Read a response captured from Verigate's POST /v1/actions/authorize endpoint.
2. Require a decision receipt whose decision is exactly ALLOW, plus a separate execution authorization.
3. Ask the configured Verigate instance's POST /v1/verify endpoint to validate both Ed25519 signatures.
4. Check that the receipt and execution authorization refer to the same intent and agent.
5. Check that the signed action maps exactly to a PortalDot native transfer: recipient, raw base-unit amount, chain ID, asset and network.
6. Limit the on-chain signature deadline to the earlier of the Verigate authorization expiry and 120 seconds from bridge signing.
7. Sign EIP-712 data using the dedicated bridge key; never broadcast automatically from this CLI.

## Required signed intent convention

- action_type: portaldot.native_transfer
- target: destination EVM address
- network: portaldot-v3
- asset: tPOTv3
- amount_exact: positive integer string containing EVM transfer base units
- metadata.portaldot_v3.chain_id: 420420777
- metadata.portaldot_v3.recipient: same destination EVM address
- metadata.portaldot_v3.amount_base_units: same integer string as amount_exact

The policy therefore sees the same exact base-unit integer that the EVM contract will transfer. Configure policies in those units for this prototype; do not imply these are human-readable POT units.

## Signature separation

Verigate signs its off-chain authorization artifacts with Ed25519. Solidity's ecrecover verifies secp256k1 signatures, not Ed25519. The separate EVM key therefore represents a bridge trust boundary, not direct on-chain verification of Verigate's Ed25519 signature.

## Key separation

The deployer key pays deployment gas. The bridge signer key is configured as the immutable signer in PortalDotAgentGuard. Keep them separate, use a throwaway/test-only bridge key, and keep the guarded balance small.

## Remaining work

- Run the current CLI against a real response from the configured Verigate instance.
- Test authorization expiry, action mismatch, invalid signatures and denied decisions end to end.
- Consider locally verifying Ed25519 against a pinned trusted public key instead of relying only on the issuer API's verify endpoint.
- Never record a transaction hash or deployed address until it is confirmed on the live expected chain.
