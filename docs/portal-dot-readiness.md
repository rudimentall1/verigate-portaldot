# PortalDot V3 network readiness probe

## Purpose

`npm run portal:readiness` produces a read-only operational snapshot for the publicly announced PortalDot endpoints. It is intended to help an operator compare the network's observable state before and after a runtime or infrastructure change, and to attach a machine-readable report to a support ticket.

The report checks:

- EVM testnet RPC: `eth_chainId`, `eth_blockNumber`, and the latest block; the chain ID must match `420420777`, and the block number returned by the two methods must agree.
- Substrate testnet WebSocket: genesis hash against the repository's recorded pin, finalized head and number, chain name, node version, runtime `specName` / `specVersion` / `transactionVersion`, and `system_health` peer/syncing fields.
- HTTP reachability of the announced V3 mainnet explorer, V3 testnet explorer, Node Console, and bridge.

No wallet, private key, credential, contract address or transaction hash is needed. The probe does not connect a wallet, sign, broadcast, deploy, or submit an extrinsic.

## Run

Use Node.js `22.13.0` or newer from the repository root:

```sh
npm ci
npm run --silent portal:readiness -- --json > readiness-report.json
```

The JSON report includes the check timestamp, per-endpoint status, latest EVM block/hash/time, Substrate finalized block and runtime identity, HTTP response status/content type, latency, and known limitations. For the announced V3.0 rollout at 23 October 2026 23:00 UTC, run one snapshot before and one after the upgrade, then compare them with `diff -u before.json after.json`. Timestamps and block heights are expected to change; chain/genesis identity, runtime version, finality progress and endpoint availability should be reviewed explicitly. The notice supplied to this project does not publish Mainnet EVM RPC/chain ID or Mainnet Substrate WSS, so these testnet checks cannot establish Mainnet EVM readiness.

Exit codes for automation:

| Code | Meaning |
|---|---|
| `0` | `PASS`: all critical identity checks and public HTTP checks returned without warning. |
| `1` | `DEGRADED`: endpoint responded with a client-side HTTP error, redirected to another hostname, or Substrate reported a health warning. |
| `2` | `FAIL`: EVM/Substrate check failed, EVM chain ID or Substrate genesis did not match, a public surface failed, or the report could not be generated. |

Unit tests run offline with `npm run test:network-readiness`; the tests use fixed fixtures and do not call PortalDot endpoints.

## Important boundaries

- The EVM and Substrate RPC checks are for the announced **testnet** only.
- The supplied Mainnet V3 announcement did not include a mainnet EVM RPC URL or EVM chain ID. The probe deliberately does not guess them from the mainnet explorer hostname and reports mainnet EVM identity as `not_configured`.
- A successful HTTP response proves only that a URL responded. It does not validate the explorer's indexed data, the service's internal dependencies, or the correctness of chain state.
- One endpoint per protocol is queried. The report is not independent network authentication and does not compare providers.
- The expected Substrate genesis hash is a project-recorded pin. A match helps detect accidental endpoint changes, but one RPC response is not proof that the RPC operator is trustworthy.
- A single snapshot does not prove block progression or continuous uptime. For an upgrade review, preserve a before report, an after report and the relevant PortalDot announcement/runtime evidence.

## Public URLs in the report

- Mainnet V3 explorer: https://scanner-live-v3.portaldot.dev/
- Testnet V3 explorer: https://scanner-testnet-v3.portaldot.dev/
- Node Console: https://node-console.portaldot.dev/
- Bridge: https://bridge.portaldot.dev/
