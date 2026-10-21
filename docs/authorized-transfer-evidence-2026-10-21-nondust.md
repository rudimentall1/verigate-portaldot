# Non-dust Verigate-authorized PortalDot V3 transfer

**Status:** the executor reported `transfer_executed` on 21 October 2026, including `TransferExecuted` confirmation and a successful post-transfer guard-balance read. This records the executor output; an independent receipt re-query is not attached here.

## Result

| Field | Value |
|---|---|
| Reported network chain ID | `420420777` |
| RPC origin | `https://test-evm-rpc-v3.portaldot.dev` |
| Guard contract | `0x3f2f484484fbE6e224d058fDfDB6B5A14F09655b` |
| Transaction | `0x21acff99d30652161f7e4ba6e1d76e6b6b67e8b9e02b09edd64d8bd7f2d5dd9c` |
| Block | `132475` |
| Verigate intent ID | `portaldot-live-7c3744c34a694e20b36eb0c2cf063b50` |
| Authorization ID | `0a9960bf04896ac727cabd5cb4b54c7c636ba6852f9a15518e3b23d743f41f6b` |
| Action ID | `0x18e1fdaa167208a805dc022b8f66a7839ced261e76805cbf4cf4bc2052f8ab54` |
| Recipient | `0x4c07B4f328FA738290Db96BCE2F9CBc4d020D2CB` |
| Amount | `100000000000000000` EVM base units = `0.1` EVM POT |
| Executor status | `transfer_executed` |
| `TransferExecuted` | Confirmed by executor |
| Guard balance before | `999999999999999999` wei |
| Guard balance after | `899999999999999999` wei |
| Guard balance decrease | `100000000000000000` wei = `0.1` EVM POT |
| Gas used | `108251197667575` |
| Effective gas price | `35900` wei |
| Fee computed from those fields | `3886217996265942500` wei = `3.8862179962659425` EVM POT |

The executor output reported that the pre-broadcast re-simulation, refreshed gas quote, and relayer fee-budget checks passed. It also reported a successful read of the guard's post-transfer balance. The exact decrease in the guard's balance matches the authorized amount of 0.1 EVM POT.

## Scope and remaining evidence

This is a non-dust public testnet transfer, beyond the prior one-base-unit call. The values above were captured from the executor output supplied during the run; the transaction receipt, block hash, and event have **not** been independently re-fetched from a second RPC in this record. The executor's output reported `TransferExecuted` confirmed.

The reported recipient address is also the relayer address. The guard-balance decrease is confirmed by the executor, but a separate post-transaction recipient balance snapshot is not included here. The EVM genesis pin was not configured; the Substrate genesis pin was configured. Do not treat the configured RPC's response alone as independent authentication of the network or as a security audit.

No private key, mnemonic, `.env`, or signed authorization payload is included.

Machine-readable executor output: [`evidence/authorized-transfer-0p1-2026-10-21.json`](../evidence/authorized-transfer-0p1-2026-10-21.json).
