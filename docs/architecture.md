# Architecture and trust boundaries

Updated: 19 October 2026

## Current flow

```mermaid
flowchart TD
    A["Agent or application proposes a payment"] --> B["Verigate policy evaluation"]
    B --> C{"Decision"}
    C -->|WARN or BLOCK| X["Bridge refuses to sign"]
    C -->|ALLOW| D["Signed decision receipt + execution authorization"]
    D --> E["PortalDot bridge CLI"]
    E --> F["Check intent/action binding, recipient, amount, chain ID, nonce and expiry"]
    F --> G["Verify Ed25519 locally and via Verigate /v1/verify"]
    G --> H["Read-only RPC: chain ID, guard code hash and authoritySigner"]
    H --> H2["Dedicated EVM bridge key signs EIP-712 authorization"]
    H2 --> I["Dry-run JSON signature output"]
    I -. "Not wired to a broadcaster; no transaction sent" .-> J["PortalDotAgentGuard contract"]
    J --> K["Verify EIP-712 signature, deadline, balance and unused nonce"]
    K --> L["Native-token transfer"]
```

The bridge CLI still stops at signed JSON output; it does not submit live transactions. CI now deploys the actual guard source to a temporary loopback Hardhat EVM and verifies the bridge's pre-sign checks there. The public PortalDot EVM endpoint and any live contract deployment have not been independently verified; the dotted line is not a public-network path.

## What is checked off-chain

- Decision must be exactly `ALLOW`; `WARN` and `BLOCK` are refused.
- Both Ed25519 artifacts are submitted to the configured Verigate `/v1/verify` endpoint.
- Receipt intent and authorization action must match by canonical SHA-256 digest.
- Recipient must match the signed PortalDot mapping. Base-unit amounts in `amount_exact` and both `metadata.portaldot_v3.amount_base_units` fields must be canonical positive decimal strings; numeric amount fields are rejected instead of being coerced through JavaScript `Number`, which can lose precision above `Number.MAX_SAFE_INTEGER`.
- Preflight, RPC monitoring, and Hardhat network configuration reject RPC URLs with embedded username/password. Read-only JSON-RPC requests disable redirects, so a configured endpoint cannot silently redirect to another destination. Preflight also checks the JSON-RPC version, matching numeric response ID, provider error field, and canonical hexadecimal quantity format before comparing chain ID or block number.
- The authorization must match the expected chain ID and have a valid nonce, authorization ID, issue time and expiry.
- The bridge signer key must match the configured contract authority signer.
- Before signing, the bridge uses read-only RPC calls to verify chain ID, deployed bytecode, the Keccak runtime-code hash pinned in `PORTALDOT_GUARD_CODE_HASH`, and on-chain `authoritySigner()`.

## What the contract enforces

- EIP-712 domain binds the signature to the chain ID and contract address.
- Signature binds recipient, amount, nonce, deadline and action ID.
- Expired signatures, reused nonces, zero recipients, zero amounts, self-transfers, insufficient balance and invalid signatures are rejected.
- A reentrancy guard protects the external value transfer.
- The contract has no generic arbitrary-call function.

## Trust boundary

The contract does **not** verify Verigate's Ed25519 signatures. The bridge verifies those through the configured Verigate instance, then uses a separate EVM key to produce an EIP-712 signature. The EVM contract trusts that bridge signer. Protecting the Verigate API and bridge key is therefore part of the security model.

## Deployment blocker

The repository records `https://test-evm-rpc-v3.portaldot.dev` and chain ID `420420777` as reported V3 EVM testnet settings from 17 October 2026. The canonical announcement URL is not recorded here, and I could not independently reconfirm these exact values in the public developer documentation during this review. The published [PortalDot developer chain info](https://portaldot-dev.readthedocs.io/en/latest/chain-info.html) currently lists the mainnet Substrate WebSocket `wss://mainnet.portaldot.io` and POT precision; that does not establish that this reported EVM endpoint is authentic or confirm the testnet's token denomination/address mapping. Ask PortalDot to confirm the exact EVM RPC, chain ID, network token and wallet mapping through an independently trusted channel before deploying or using test funds. A matching chain ID is not network authentication.

## Validation evidence

The migrated branch passed [101 tests and Solidity compilation](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39197882529) and [PortalDot CI, including the isolated integration, deploy-network smoke, and credentialed-RPC rejection checks](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39197882814) on code commit `5ea418769816206f9f75eafce6a914f6ab352a11`. Regression tests cover numeric transfer amounts/base-unit mappings, RPC URL credentials, redirect disabling, malformed JSON-RPC envelopes, mismatched response IDs, provider errors, and non-canonical quantities. Integration uses a temporary Verigate API and loopback Hardhat EVM with disposable issuer, deployer and bridge keys. It exercises ALLOW/BLOCK through real HTTP routes, deploys the actual guard source to the simulator, checks runtime-code hash and authority before signing ALLOW, and refuses BLOCK. Deployment/funding transactions stay on the local simulator; no public PortalDot RPC is contacted. This is not live deployment evidence.
