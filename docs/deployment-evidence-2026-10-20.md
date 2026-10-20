# PortalDot V3 live testnet deployment evidence

**Status:** `PortalDotAgentGuard` deployed and independently re-read from the configured PortalDot V3 EVM RPC on 20 October 2026. This is testnet evidence, not a production deployment or an independent audit.

## Transaction and contract

| Field | Verified value |
|---|---|
| Network reported by endpoint | PortalDot V3 EVM Testnet |
| EVM chain ID | `420420777` |
| Substrate genesis hash | `0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd` |
| Contract | `PortalDotAgentGuard` |
| Contract address | `0x3f2f484484fbE6e224d058fDfDB6B5A14F09655b` |
| Deployer H160 | `0x4c07B4f328FA738290Db96BCE2F9CBc4d020D2CB` |
| Configured authority signer | `0x48F9B07d37b5AF744BA8195c4d6740145b593ea6` |
| Deployment transaction | `0xb1cf9cca75bb029b0a723f13c398479d2c18704c1138c02c6d92a02c1fcdce3c` |
| Receipt status | `0x1` (success) |
| Receipt block | `116872` |
| Receipt block hash | `0x09c8a98bba7f0a6886105fb5ae74707f8508fef796258fc3e528797bac75ab03` |
| Runtime bytecode length | `2,153` bytes |
| Runtime bytecode Keccak-256 | `0xb3d71ff82b4b654c7bafe855ce13b0dc277627a046e3190f6f6e0ee5eb7f7671` |
| On-chain `authoritySigner()` readback | Matches configured authority signer |

The receipt was fetched again after deployment; the receipt block hash matched `eth_getBlockByNumber` for that block. Runtime code was fetched from the deployed address and its Keccak-256 matched the deployment script's output. `authoritySigner()` was read back from the deployed contract and matched the configured signer.

## Cost observation

| Field | Observed value |
|---|---:|
| `eth_estimateGas` | `4,932,322,193,116,807` gas units (deployment preflight) |
| Receipt `gasUsed` | `4,856,432,276,155,584` gas units |
| Receipt `effectiveGasPrice` | `37,330` wei |
| `gasUsed × effectiveGasPrice` | `181.29061686888795072` EVM POT |
| Deployer balance after deployment, at read time | `270.60938313111204928` EVM POT |

The receipt cost is the observed gas-unit product reported by this RPC. PortalDot's Revive model may include storage deposits in the gas estimate; the exact internal fee/deposit breakdown was not independently audited. Do not use this single observation as a future price guarantee. The preflight's 20% margin was sufficient for this transaction.

## Limitations

- The EVM RPC and Substrate RPC reported the expected chain ID and pinned genesis hash. This is consistency evidence, not cryptographic authentication of either endpoint operator.
- The `Revive.OriginalAccount` lookup for the deployer H160 and the previously supplied SS58 address returned `no_mapping_entry`. This deployment used the funded EVM H160 and its matching local private key; this record does **not** claim that the H160-to-SS58 mapping was verified.
- The 156 local tests passed after deployment. They are local tests and do not replace a full audit or an on-chain functional test of every bridge path.
- The transaction is on the PortalDot V3 testnet only. No production deployment or production readiness is claimed.

## Independent live-state re-check

Read-only re-check performed on 20 October 2026 at 15:57 UTC using the project's `npm run verify:deployment` command:

- Observed EVM chain ID: `420420777`; latest block observed: `119348`.
- Contract bytecode length: `2,153` bytes.
- Observed runtime code hash: `0xb3d71ff82b4b654c7bafe855ce13b0dc277627a046e3190f6f6e0ee5eb7f7671`, matching the deployment record.
- Live `authoritySigner()`: `0x48F9B07d37b5AF744BA8195c4d6740145b593ea6`, matching the configured signer.
- Guard balance at that check: zero EVM wei.
- The RPC returned `null` for both `eth_getTransactionByHash` and `eth_getTransactionReceipt` on the historical deployment transaction. A separate query for old block state returned an `UnknownBlock / State already discarded` error.

This is a limitation of the historical data currently available from the queried RPC, not proof that deployment failed. The historical successful receipt, block hash and fee observations above were recorded at deployment time. The current live read confirms bytecode and signer configuration but does not replace historical receipt evidence. The new read-only verifier intentionally keeps these checks separate and exits successfully only when current chain, code and signer agree.

The guard currently has no funds. A public end-to-end transfer must not be claimed unless funding and execution each have their own successful PortalDot receipt and the guard emits `TransferExecuted`.
