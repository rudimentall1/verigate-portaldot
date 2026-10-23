# Non-dust Verigate-authorized PortalDot V3 transfer

**Status at capture time (21 Oct 2026):** independently re-queried successfully from the configured PortalDot V3 EVM RPC. The transaction and receipt were found, receipt status was successful, the receipt block hash matched the fetched block, and the receipt contained the expected `TransferExecuted` event. The guard balance delta was recorded by the executor.

**Later historical lookup status (23 Oct 2026):** a subsequent lookup through that same configured RPC no longer returned this historical transaction/receipt. The saved record below documents what was verified at capture time; it must not be presented as a fresh successful receipt lookup today. No second EVM RPC provider was used.

## Result

| Field | Value |
|---|---|
| Network chain ID | `420420777` |
| RPC origin | `https://test-evm-rpc-v3.portaldot.dev` |
| Guard contract | `0x3f2f484484fbE6e224d058fDfDB6B5A14F09655b` |
| Transaction | `0x21acff99d30652161f7e4ba6e1d76e6b6b67e8b9e02b09edd64d8bd7f2d5dd9c` |
| Block | `132475` |
| Block hash | `0xb69fed56636e93b5fb78dbbbcf98ace0ec450d3ed228f7530717099725799c09` |
| Receipt status | `1` (success) |
| Transactions in block | `1` |
| Verigate intent ID | `portaldot-live-7c3744c34a694e20b36eb0c2cf063b50` |
| Authorization ID | `0a9960bf04896ac727cabd5cb4b54c7c636ba6852f9a15518e3b23d743f41f6b` |
| Action ID | `0x18e1fdaa167208a805dc022b8f66a7839ced261e76805cbf4cf4bc2052f8ab54` |
| Recipient | `0x4c07B4f328FA738290Db96BCE2F9CBc4d020D2CB` |
| Amount | `100000000000000000` base units = `0.1` EVM POT |
| Expected event | Found in receipt; action ID, recipient, and amount all match |
| Guard balance before | `999999999999999999` wei |
| Guard balance after | `899999999999999999` wei |
| Guard balance decrease | `100000000000000000` wei = `0.1` EVM POT |
| Gas used | `108251197667575` |
| Effective gas price | `35900` wei |
| Actual transaction fee | `3886217996265942500` wei = `3.8862179962659425` EVM POT |

## Recipient/relayer balance reconciliation

The recipient and transaction sender/relayer are the same address. Its balance was `265.710553264596381671` POT at block `132474` and `261.924335268330439171` POT at block `132475`. The observed net delta is `-3.7862179962659425` POT, exactly equal to the `0.1 POT` received from the guard minus the `3.8862179962659425 POT` gas fee. The block contained one transaction, and the latest balance matched the post-transaction block balance.

## Scope and caveats

This verifies the successful transfer against the configured PortalDot V3 RPC using a read-only re-query; it is not a second-provider cross-check or a security audit. The EVM genesis hash pin was not configured, while the Substrate genesis hash pin was configured. The guard-balance before/after figures are from the executor output; the independent query separately confirms the receipt event and the sender/recipient balance reconciliation.

No private key, mnemonic, `.env`, or signed authorization payload is included.

Machine-readable evidence: [`evidence/authorized-transfer-0p1-2026-10-21.json`](../evidence/authorized-transfer-0p1-2026-10-21.json).
