# Cross-provider receipt verification

The receipt-quorum CLI checks one EVM transaction against two configured JSON-RPC endpoints. It is read-only: it does not sign, submit, or replay transactions.

## Run

Set the existing network and guard configuration in the environment:

- `PORTALDOT_RPC_URL`: primary PortalDot V3 EVM RPC.
- `PORTALDOT_RPC_URL_SECONDARY`: secondary RPC operated independently from the primary.
- `PORTALDOT_CHAIN_ID=420420777`.
- `PORTALDOT_GUARD_PROFILE=v2` (or `v1`).
- For V2, set `PORTALDOT_V2_GUARD_ADDRESS` and `PORTALDOT_V2_GUARD_CODE_HASH`.
- For V1, set `PORTALDOT_GUARD_ADDRESS` and `PORTALDOT_GUARD_CODE_HASH`.

Then run:

```sh
npm run verify:receipt:quorum -- 0xYOUR_TRANSACTION_HASH
```

The CLI verifies each endpoint's reported chain ID and runtime code hash, transaction/receipt hash agreement, successful receipt status, block consistency, target guard, and exactly one `TransferExecuted` event. It compares the transaction hash, chain ID, block identity, guard target, action ID, recipient, amount in base units, and nonce across the two responses.

## Interpret results

- `CONFIRMED_BY_TWO_RPC_ENDPOINTS`: both configured endpoints returned matching evidence and passed the configured chain/code-hash checks.
- `CONFLICT`: endpoints returned inconsistent transaction or event evidence. Investigate; do not treat the receipt as confirmed.
- `Cross-provider receipt verification unavailable`: one or both endpoints failed to provide complete evidence, configuration is missing, or a chain/code-hash check failed. This is an unknown/unavailable result, not proof that the transaction failed.

## Trust boundary

Different URL origins do not prove independent operators, infrastructure, or data sources. Verify the provider operators and infrastructure independently before describing the result as independent corroboration. The CLI does not independently establish finality, audit the RPC provider, or prove that Verigate's off-chain Ed25519 policy receipt was validated on-chain. The guard enforces the EIP-712 authority signature and transfer constraints for transfers from its own balance; this verifier only checks published EVM receipt evidence.

The command does not broadcast transactions. Its output is a point-in-time report; rerun it when fresh evidence is required.
