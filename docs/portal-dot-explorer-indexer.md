# PortalDot Explorer indexer

This service adds a durable EVM data index for the PortalDot V3 testnet to the existing Verigate PortalDot repository. It does not use Pindex source code or its API.

## What it runs

- A read-only HTTP API.
- An SQLite indexer for EVM blocks, transactions and contract logs.
- A retry queue for block/log ranges the RPC temporarily cannot serve.
- A small static route serving the Explorer at / or /explorer/ and the current Verigate dashboard at /dashboard/.
- Known V1 deployment and TransferExecuted records with a clear historical-evidence label. These are not inserted into the live transaction tables unless the RPC actually returns the records.

## Start locally

Use Node.js 22.13 or later.

    npm ci
    npm run explorer:service

Defaults:
- EVM RPC: https://test-evm-rpc-v3.portaldot.dev
- Expected chain ID: 420420777
- SQLite path: ./data/portal-dot-explorer.sqlite
- Backfill start: 30,000 blocks behind the first observed head, unless EXPLORER_START_BLOCK is set.
- Confirmation lag: 6 blocks.
- Batch size: 20 blocks.
- Poll interval: 6 seconds after the indexer catches up.

To target the two previously recorded Verigate transactions, set EXPLORER_START_BLOCK=110000. This is a practical starting point for those records, not proof of complete chain history. A block that the RPC cannot return is recorded as a gap and retried. An unresolved gap remains unresolved; the service never fabricates historical data.

## API routes

- GET /health
- GET /api/status
- GET /api/search?q=<tx-hash|block-number|block-hash|evm-address>
- GET /api/tx/<transaction-hash>
- GET /api/block/<block-number-or-hash>
- GET /api/address/<evm-address>
- GET /api/blocks?limit=30
- GET /api/transactions?limit=30
- GET /api/logs?fromBlock=110000&toBlock=110100&address=0x...&topic0=0x...&limit=100
- GET /api/known-evidence

The API accepts read-only GET requests and CORS is restricted to EXPLORER_ALLOWED_ORIGINS plus same-origin requests. It does not have a transaction-submission route.

## Persistent deployment

The root render.yaml describes a Render web service backed by a 2 GB persistent disk. In Render, create a Blueprint from this repository and review the service plan before applying it. Render persistent disks require a paid service plan; without persistent storage, an SQLite index would be lost on restart/redeploy. The service name suggests the default host name, but the actual assigned URL must be read from the Render dashboard.

Once deployed, verify /health, /api/status, and the returned indexer.startedFrom, indexer.indexedThrough, indexer.gaps, blocksStored, transactionsStored, and logsStored fields before presenting the service as live. Set the actual service URL as the API endpoint in the GitHub Pages Explorer if you want that page to query the persistent index.

## Data limits

- This first indexer stores EVM block data, transactions and EVM logs. It does not yet index every Substrate pallet event, native-account balances, token holders, NFTs, or ABI-decoded contract event names.
- The historical transaction/receipt RPC may return null even for a transaction recorded by the project earlier. The SQLite indexer only preserves blocks it can actually read.
- The indexer uses a six-block confirmation lag by default. This reduces reorg risk but is not a claim of finalized Substrate history.
- RPC retention, rate limits, and outages are recorded as gaps; gap status must be inspected before claiming complete coverage.

## Tests

    npm run test:explorer

The tests use an in-memory SQLite database and do not send network transactions.
