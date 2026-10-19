# PortalDot V3 EVM RPC health evidence

## Read-only smoke check

- Checked at (UTC): 2026-10-19T04:26:05.145Z
- Workflow: [PortalDot RPC health run 39199424771](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39199424771)
- Tested revision: `17bc87bcece44fdad15ec7dcf0dd654bfa313773`
- RPC origin: `https://test-evm-rpc-v3.portaldot.dev`
- Expected EVM chain ID: `420420777`
- Observed EVM chain ID: `420420777`
- Observed block number: `98129`
- Combined request latency: `678 ms`
- Result: `status=ok`

The workflow called only `eth_chainId` and `eth_blockNumber`. It did not sign, submit, or broadcast a transaction and did not use a private key.

## What this evidence establishes

At the timestamp above, the endpoint responded to read-only JSON-RPC requests and reported the configured chain ID. The health check's response validation passed.

## What it does not establish

- A matching chain ID does not authenticate the operator or prove the endpoint is the intended PortalDot testnet.
- A single block-height observation does not prove continuing liveness or finality.
- This is not evidence of an EVM account balance, gas availability, token denomination, deployed contract, or successful transaction.
- It is not a smart-contract security audit.

Before deploying or using test funds, independently confirm the endpoint and chain configuration with PortalDot's current official event/dev documentation or organizer channel. Then verify any deployed contract address, transaction, runtime bytecode hash, and bridge authority signer through a separately trusted source.
