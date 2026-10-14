# Verigate bridge integration

This document defines the intended integration contract. It is not yet a completed adapter implementation.

## Required inputs and checks

The bridge receives a proposed payment plus the Verigate authorization response. Before it signs EIP-712 data, it must:

1. call the supported Verigate action-authorization endpoint for the intent;
2. stop unless the returned decision is exactly ALLOW;
3. validate the Ed25519 execution authorization using Verigate's supported verification endpoint and trusted public key;
4. compare the normalized authorized action against the recipient and amount supplied to the EVM signer;
5. enforce an expiry of no more than five minutes and ensure the authorization/action identifier has not previously been submitted;
6. produce an EIP-712 authorization with the contract's exact name, version, chain ID, verifying contract and typed fields.

Do not assume that an API field name, receipt shape or action normalization matches this document without reading the source/API schema and a real response. Pin tests to a captured, non-sensitive fixture from the running Verigate API.

## Signature separation

Verigate currently uses Ed25519 for its off-chain authorization artifacts. Solidity's native ecrecover verifies secp256k1 signatures, not Ed25519. The separate EVM key therefore represents a bridge trust boundary, not a direct on-chain verification of Verigate's Ed25519 signature.

## Next implementation step

Inspect the current ActionAuthorizationRequest, AuthorizationResponse, execution authorization verification function and POST /v1/verify request schema in the Verigate source. Then implement the smallest adapter that consumes a real ALLOW response, rejects BLOCK/tampered data, validates the Ed25519 proof, and only then signs this contract's typed payload.
