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
    E --> F["Verify Ed25519 locally and via Verigate /v1/verify"]
    F --> G["Validate exact intent, recipient, amount, chain and expiry"]
    G --> H["Read-only RPC: chain, guard code hash and authoritySigner"]
    H --> I["Dedicated EVM signer creates EIP-712 authorization"]
    I --> J["Signed authorization JSON"]
    J --> K["Executor validates domain, signer and exact transfer"]
    K --> L["Read-only simulation, contract balance and relayer fee checks"]
    L --> M{"Explicit --broadcast?"}
    M -->|No| N["Report simulation only; no transaction"]
    M -->|Yes| O["PortalDotAgentGuard.executeTransfer"]
    O --> P["Check receipt and TransferExecuted event"]
```

The executor does not send a transaction by default. The explicit --broadcast path submits the signed transfer only after signature, network, deployed code hash, authority signer, expiry, contract balance, simulation and relayer fee budget checks pass. Automated CI exercises both dry-run and the broadcast path only against a temporary loopback Hardhat EVM, then confirms that the recipient balance delta equals the signed amount. This is local integration evidence, not a public PortalDot transaction or deployment.

## What is checked off-chain

- Decision must be exactly ALLOW; WARN and BLOCK are refused.
- Both Ed25519 artifacts are submitted to the configured Verigate /v1/verify endpoint after local verification against a pinned issuer key.
- Receipt intent and authorization action must match by canonical SHA-256 digest.
- Recipient must match the signed PortalDot mapping. Base-unit amounts in amount_exact and both metadata.portaldot_v3.amount_base_units fields must be canonical positive decimal strings; numeric amount fields are rejected instead of being coerced through JavaScript Number.
- Preflight, RPC monitoring and Hardhat network configuration reject RPC URLs with embedded username/password. Read-only JSON-RPC requests disable redirects. Preflight checks JSON-RPC version, response ID, provider errors and canonical hexadecimal quantity format.
- The bridge authorization must match the expected chain ID and have valid nonce, authorization ID, issue time and expiry.
- Before signing, the bridge verifies chain ID, deployed bytecode, the Keccak runtime-code hash pinned in PORTALDOT_GUARD_CODE_HASH, and on-chain authoritySigner().
- The executor revalidates EIP-712 domain, recovered authority signer, contract, canonical transfer values and deadline immediately before any simulation or broadcast.

## What the contract enforces

- EIP-712 domain binds the signature to chain ID and contract address.
- Signature binds recipient, amount, nonce, deadline and action ID.
- Expired signatures, reused nonces, zero recipients, zero amounts, self-transfers, insufficient balance and invalid signatures are rejected.
- A reentrancy guard protects the external value transfer.
- The contract has no generic arbitrary-call function.

## Trust boundary

The contract does not verify Verigate's Ed25519 signatures. The bridge verifies those through the configured Verigate instance, then uses a separate EVM key to produce an EIP-712 signature. The executor relays that exact signed payload. The EVM contract trusts the bridge signer. Protecting the Verigate API and bridge key is part of the security model; the relayer key should be separate from the authority signer.

## Deployment blocker

The repository records https://test-evm-rpc-v3.portaldot.dev and chain ID 420420777 as reported V3 EVM testnet settings from a community field guide. A chain ID or single RPC response is not network authentication. Verify the endpoint and deployed runtime code through independently trusted sources before a public transaction. No live PortalDot contract deployment is claimed.

## Validation evidence

The test workflow and PortalDot integration workflow cover the bridge, native-token guard, RPC preflight, read-only deployment estimator and new guarded executor. In the isolated harness, a disposable Verigate API issues ALLOW and BLOCK, the bridge signs only ALLOW, the executor first simulates without changing state, and the same signed authorization is then executed on the temporary loopback EVM. The test checks the guard event and exact recipient balance delta. No public PortalDot transaction is used by that integration flow.
