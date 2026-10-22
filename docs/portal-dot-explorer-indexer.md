# PortalDot Explorer indexer

The Explorer service is part of rudimentall1/verigate-portaldot. It does not use Pindex source code or its API.

## Architecture

One long-running Node.js service serves a read-only HTTP API and the Explorer static pages. It maintains one SQLite database on a persistent disk.

- EVM indexer: blocks, transactions and EVM logs from https://test-evm-rpc-v3.portaldot.dev.
- Substrate indexer: finalized blocks, extrinsics, runtime events, and SS58-like addresses extracted from decoded event payloads via wss://test-node-v3.portaldot.dev.
- Both indexers persist independent cursors and record gaps. EVM retry jobs do not consume Substrate gaps, and vice versa.
- A six-block EVM confirmation lag is used. The Substrate event indexer reads only the finalized head.
- A separate bounded state-snapshot worker captures current native balances, standard assets/account balances, and standard nfts/uniques ownership at a finalized Substrate height every 15 minutes by default. It keeps the last three complete snapshots and retains failed run records. Snapshot failures do not replace the last complete snapshot.
- Historical Verigate deployment and TransferExecuted records are shown separately as project evidence. They are not fabricated into database rows when a historical RPC lookup returns null.

## Start locally

Use Node.js 22.13 or later.

    npm ci
    npm run explorer:service

Defaults:
- EVM RPC: https://test-evm-rpc-v3.portaldot.dev
- EVM chain ID: 420420777
- Substrate WebSocket: wss://test-node-v3.portaldot.dev
- SQLite path: ./data/portal-dot-explorer.sqlite
- EVM backfill start: 30,000 blocks behind the first observed head unless EXPLORER_START_BLOCK is set.
- Substrate backfill start: 30,000 finalized blocks behind the initial finalized head unless SUBSTRATE_START_BLOCK is set.
- Substrate batch size: 10 blocks; EVM batch size: 20 blocks.
- EVM confirmation lag: six blocks.
- Poll interval: six seconds when caught up.
- State snapshot interval: 15 minutes; page size 500; maximum 100,000 combined account/asset/NFT rows. These can be adjusted with SUBSTRATE_SNAPSHOT_INTERVAL_MS, SUBSTRATE_SNAPSHOT_PAGE_SIZE and SUBSTRATE_SNAPSHOT_MAX_ROWS.

The Render Blueprint sets both indexers to start at block 110000 so the service attempts to cover the recorded Verigate deployment/transfer heights. That does not prove those historical ranges are readable. Runtime state-history retention varies, and inaccessible blocks/events are stored as gaps. The blueprint pins `PORTALDOT_SUBSTRATE_GENESIS_HASH` to the PortalDot V3 testnet genesis hash confirmed by the PortalDot team on 19 October 2026. The Substrate indexer refuses to index if the endpoint reports a different genesis hash. This guards against accidental endpoint misconfiguration; it does not cryptographically authenticate the RPC operator.

## API routes

### EVM

- GET /health
- GET /api/status
- GET /api/search?q=<tx-hash|block-number|block-hash|evm-address|ss58-address>
- GET /api/tx/<transaction-hash>
- GET /api/block/<block-number-or-hash>
- GET /api/address/<evm-address>
- GET /api/blocks?limit=30
- GET /api/transactions?limit=30
- GET /api/logs?fromBlock=110000&toBlock=110100&address=0x...&topic0=0x...&limit=100
- GET /api/known-evidence
- GET /api/contracts
- POST /api/contracts with JSON { "address": "0x…", "abi": [ … ], "name": "optional" }
- GET /api/contracts/<slug>
- GET /api/contracts/<slug>/events?name=Transfer&from_block=110000&to_block=120000&limit=50&order=asc
- POST /api/contracts/<slug>/resync (Authorization: Bearer <manage_token>)
- DELETE /api/contracts/<slug> (Authorization: Bearer <manage_token>)

Contract registration accepts a Solidity JSON ABI array or a Hardhat/Foundry artifact with an abi array. The API validates the ABI, requires at least one event, limits each ABI to 256 KiB/1000 entries, caps the global registry at 200 contracts, and rejects duplicate addresses. Successful registration returns a random manage token exactly once; only its SHA-256 hash is stored. Save it if resync/delete access is needed. The token is never returned by public contract listing/detail endpoints. ABI metadata is public, so do not include secrets in a contract name or ABI.

Registered contract logs already present in the EVM index are decoded at registration. Future logs are decoded after each successful EVM batch. Resync re-decodes logs in SQLite only; it does not backfill RPC history gaps. Event query responses are capped and limited to ranges of 10,000 blocks per request. ABI management is the only mutable API feature; it changes the indexer's local registry and decoded projection, never the blockchain.

### Substrate

- GET /api/substrate/status
- GET /api/substrate/blocks?limit=30
- GET /api/substrate/block/<height-or-hash>
- GET /api/substrate/extrinsics?limit=30&section=balances&method=transferKeepAlive&signer=5...
- GET /api/substrate/extrinsic/<extrinsic-hash>
- GET /api/substrate/events?fromBlock=110000&toBlock=110100&section=balances&method=Transfer&address=5...&limit=50
- GET /api/substrate/address/<ss58-address>
- GET /api/substrate/mapping?q=<evm-address-or-ss58-address>
- GET /api/substrate/state-snapshot
- GET /api/substrate/balances?limit=20
- GET /api/substrate/assets?limit=50
- GET /api/substrate/assets/<asset-id>/holders?limit=50
- GET /api/substrate/nfts?owner=5...&collectionId=4&pallet=nfts&limit=50

The mapping endpoint calls the connected runtime's `reviveApi.accountId` (EVM H160 to native AccountId32) or `reviveApi.address` (native AccountId32 to H160) when the runtime exposes them. A result is labelled confirmed only when the current runtime returns a value. Missing/unsupported mappings remain explicit; no offline-derived address is substituted.

The state snapshot captures `System.Account` entries and, when the runtime metadata exposes them, asset metadata/account entries and `nfts.account` / `uniques.account` entries. A snapshot is published only after the bounded scan completes and database transaction commits. If the runtime doesn't expose a storage item or the node can't serve its entries, snapshot status shows a failure while the last successful snapshot remains available. Native account data queried directly is live; historical balance/asset/NFT display uses the timestamped finalized-state snapshot.

The API accepts read-only GET requests and uses CORS allowlisting from EXPLORER_ALLOWED_ORIGINS. No transaction-submission route is implemented.

## Current preview deployment (2026-10-22)

A temporary free Render service has been created at https://verigate-portaldot-explorer.onrender.com and Render reports its deployment as live. The Explorer UI defaults to this API URL, so manual API URL entry is not required.

This is a preview, not the durable indexer deployment described below: its SQLite path is `/tmp/portal-dot-explorer.sqlite`, and the free service may sleep or restart. Local indexed history can therefore disappear and rebuild. The service has not yet been externally verified through successful HTTP responses for all EVM and Substrate endpoints. Do not present the preview as persistent or as verified complete chain coverage.

## Persistent deployment

render.yaml describes the web service, environment variables, and a 2 GB persistent disk at /var/data. Render persistent disks require a paid service plan. The Blueprint file only describes a deployment; it does not create or deploy the service by itself.

In Render, create a Blueprint from this repository, review the plan, apply it, and use the actual assigned public service URL from the dashboard. Then verify:

    GET /health
    GET /api/status
    GET /api/substrate/status
    GET /api/blocks?limit=5
    GET /api/substrate/blocks?limit=5
    GET /api/substrate/events?limit=5
    GET /api/substrate/state-snapshot
    GET /api/substrate/balances?limit=5
    GET /api/substrate/assets?limit=5
    GET /api/substrate/nfts?limit=5

Set the assigned HTTPS service URL in the Explorer's “Indexer API URL” field on GitHub Pages. Do not claim the persistent index is live until both indexer statuses have been checked against the deployed service.

## Data limits

- Substrate account lookup returns live system.account data and historical events/extrinsics found by this indexer. It is not an all-history guarantee.
- The first Substrate implementation records runtime events and string-like SS58 accounts found in decoded event payloads. It does not yet provide a universal account reference decoder for every runtime type.
- Native holder, asset-holder, and NFT-owner views are derived from the latest complete periodic storage snapshot, not reconstructed historical ownership/balances. They show the snapshot block/time and are not real-time between snapshot runs. A failed snapshot doesn't overwrite the previous complete snapshot.
- The state snapshot uses standard `assets.asset/account` and `nfts.account` / `uniques.account` storage when available. Non-standard runtime storage or unavailable state-history may cause a snapshot to fail; inspect /api/substrate/state-snapshot before claiming coverage.
- Solidity ABI decoding is supported for registered EVM contracts, limited to the EVM logs actually captured by the indexer. It does not fill unavailable history or decode Substrate runtime events using contract ABIs.
- EVM native token balance units and Substrate native-account data are distinct sources and are not automatically converted/mapped into one another.
- The saved V1 deployment transaction and TransferExecuted record are project-supplied historical evidence; the indexer only stores the real blocks/events that the RPC actually serves.
- A gap means a specific block or event range was unavailable at a query attempt. Read the gap list before claiming complete coverage.

## Tests

    npm run test:explorer

Tests use an in-memory SQLite database and do not broadcast network transactions.
