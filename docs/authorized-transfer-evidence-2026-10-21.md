# Verigate-authorized PortalDot V3 transfer evidence

**Status:** Confirmed by a read-only re-query of the configured PortalDot V3 EVM RPC on 21 October 2026. This is public testnet evidence, not production evidence or a security audit.

## Result

| Field | Verified value |
|---|---|
| Network-reported chain ID | 420420777 |
| RPC origin | https://test-evm-rpc-v3.portaldot.dev |
| Guard contract | 0x3f2f484484fbE6e224d058fDfDB6B5A14F09655b |
| Transaction | 0xbe3ade2ba3209cf0df3647cea50fb6608a77bb837213a25b8ec419fa9914cc14 |
| Receipt status | 1 (success) |
| Block | 130741 |
| Block hash | 0xd5890a5836d50bff7ee49dd6a3b4434d4ff9f9cab0fe814679d881fafe9e7d90 |
| Block timestamp | 2026-10-21T11:00:18Z |
| Transaction sender / relayer | 0x4c07B4f328FA738290Db96BCE2F9CBc4d020D2CB |
| Transaction target | 0x3f2f484484fbE6e224d058fDfDB6B5A14F09655b |
| Verigate intent ID | portaldot-live-863e1d5aec9042d38692df9ca407f613 |
| Authorization ID | 970c052682c3fef801cdcc631dd9e3abfd78be121bb9dac2143293866e61c190 |
| TransferExecuted action ID | 0xac0dabee1df3352f9d4ba7cb7420f337b55597443a4a1567006dc9f9275d0b97 |
| Event recipient | 0x4c07B4f328FA738290Db96BCE2F9CBc4d020D2CB |
| Event amount | 1 base unit = 0.000000000000000001 EVM POT (18 decimals) |
| Event nonce | 68320477847831498543980743852656061612705358230770696640031442177773302563216 |
| Gas used | 107785833941356 |
| Effective gas price | 36055 wei |
| Fee product (gasUsed × gasPrice) | 3886218242755590580 wei = 3.88621824275559058 EVM POT |
| Receipt logs | One; includes exactly one TransferExecuted from the guard |

The executor reported pre-broadcast re-simulation, refreshed gas quote, and fee-budget checks passed. The read-only verification script then fetched the transaction, receipt and receipt block again and decoded TransferExecuted from the configured guard. It confirmed chain ID, receipt status, block hash, transaction target, action ID, recipient, amount and nonce.

**Scope of proof:** This confirms the Verigate-authorized call path reached the deployed guard and emitted the expected event on PortalDot V3 testnet. The authorized value was deliberately minimal: one EVM base unit, not one whole POT and not one native Substrate tPOT. A second transfer with a meaningful non-dust amount and a verified recipient balance delta is still needed for a stronger demo.

## Reproduce the read-only verification

On the configured project machine, with local .env present, run:

    npm run verify:authorized-transfer -- 0xbe3ade2ba3209cf0df3647cea50fb6608a77bb837213a25b8ec419fa9914cc14

The structured result is preserved in [authorized-transfer-2026-10-21.json](../evidence/authorized-transfer-2026-10-21.json). The verifier is read-only: it does not sign, broadcast, or retry any transaction.


## Subsequent RPC history lookup

A later read-only query of the same endpoint returned null from eth_getTransactionByHash, eth_getTransactionReceipt, and eth_getBlockByNumber for this historical transaction/block, while eth_getLogs still returned the matching TransferExecuted log at block 130741. The latest block was already past 131000. The raw result and decoded event are captured in [authorized-transfer-rpc-lookup-2026-10-21.json](../evidence/authorized-transfer-rpc-lookup-2026-10-21.json).

The verifier intentionally fails closed when it cannot obtain both transaction and receipt. This later lookup limitation does not establish that the transfer failed, and it is not a reason to resubmit it. It does mean the configured RPC alone no longer provides a reproducible full-receipt check at the time of this later query. Before the next broadcast, arrange an explorer or RPC endpoint that can return transaction receipts consistently, then verify new receipts promptly after inclusion.

## Network identity caveat

PORTALDOT_SUBSTRATE_GENESIS_HASH is configured in the local environment and is checked during the Substrate preflight / bridge signing flow. The executor's output now reports this separately from the optional EVM genesis pin, PORTALDOT_GENESIS_HASH.

The EVM genesis pin was not configured for this transaction. A read-only request for EVM block 0 through the configured RPC failed with an UnknownBlock / State already discarded style error, so this evidence does not claim that an EVM genesis hash was verified. Do not copy the Substrate genesis hash into the EVM pin variable: they identify different layers. The configured RPC returned the transaction, receipt and block shown above, but responses from that same endpoint do not independently authenticate its operator.

No private key, mnemonic, .env, or signed authorization payload is included in this evidence. The signed payload remains local and is ignored by Git.
