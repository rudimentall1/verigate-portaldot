# Architecture and trust boundaries

Updated: 14 October 2026

## Current flow

```mermaid
flowchart TD
    A["Agent or application proposes a payment"] --> B["Verigate policy evaluation"]
    B --> C{"Decision"}
    C -->|WARN or BLOCK| X["Bridge refuses to sign"]
    C -->|ALLOW| D["Signed decision receipt + execution authorization"]
    D --> E["PortalDot bridge CLI"]
    E --> F["Check intent/action binding, recipient, amount, chain ID, nonce and expiry"]
    F --> G["Configured Verigate /v1/verify checks both Ed25519 signatures"]
    G --> H["Dedicated EVM bridge key signs EIP-712 transfer authorization"]
    H --> I["Dry-run JSON signature output"]
    I -. "Not wired to a broadcaster; no transaction sent" .-> J["PortalDotAgentGuard contract"]
    J --> K["Verify EIP-712 signature, deadline, balance and unused nonce"]
    K --> L["Native-token transfer"]
```

The bridge CLI currently stops at the signed JSON output. The contract and its local Hardhat tests are in the repository, but the target PortalDot EVM testnet and a live contract deployment have not been independently verified. The dotted line is a future integration step, not a working path.

## What is checked off-chain

- Decision must be exactly `ALLOW`; `WARN` and `BLOCK` are refused.
- Both Ed25519 artifacts are submitted to the configured Verigate `/v1/verify` endpoint.
- Receipt intent and authorization action must match by canonical SHA-256 digest.
- Recipient and amount must match the PortalDot-specific mapping in the signed action.
- The authorization must match the expected chain ID and have a valid nonce, authorization ID, issue time and expiry.
- The bridge signer key must match the configured contract authority signer. The contract address must be explicitly configured.

## What the contract enforces

- EIP-712 domain binds the signature to the chain ID and contract address.
- Signature binds recipient, amount, nonce, deadline and action ID.
- Expired signatures, reused nonces, zero recipients, zero amounts, self-transfers, insufficient balance and invalid signatures are rejected.
- A reentrancy guard protects the external value transfer.
- The contract has no generic arbitrary-call function.

## Trust boundary

The contract does **not** verify Verigate's Ed25519 signatures. The bridge verifies those through the configured Verigate instance, then uses a separate EVM key to produce an EIP-712 signature. The EVM contract trusts that bridge signer. Protecting the Verigate API and bridge key is therefore part of the security model.

## Deployment blocker

The configured chain ID `420420777` and default RPC are project assumptions, not confirmed network metadata. The published PortalDot developer chain information currently available to this project documents a Substrate mainnet WebSocket endpoint, not the EVM testnet RPC used by this repository. Do not deploy or publish a live-deployment claim until the organizer or authoritative PortalDot documentation confirms the EVM RPC, chain ID, token denomination and wallet mapping.

## Validation evidence

GitHub Actions passed the local contract and bridge tests plus Solidity compilation, and the separate integration job passed against an isolated Verigate API for [commit ab0daa2](https://github.com/rudimentall1/verigate-portaldot/commit/ab0daa27356d45eb3484ff344807cbd56d869b92): [unit tests](https://github.com/rudimentall1/verigate-portaldot/actions/runs/38679531073) and [PortalDot CI with ALLOW/BLOCK integration](https://github.com/rudimentall1/verigate-portaldot/actions/runs/38679531026). The integration signs a dry-run authorization for a dummy contract domain, refuses BLOCK and broadcasts no transaction. These checks are not evidence of a live PortalDot deployment.