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

## Follow-up read-only smoke check

- Checked at (UTC): 2026-10-19T04:44:29.032Z
- Workflow: [PortalDot RPC health run 39200969354](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39200969354)
- Tested revision: `77cb6a8fd23905a95fc3c69094a918414787754b`
- RPC origin: `https://test-evm-rpc-v3.portaldot.dev`
- Expected and observed EVM chain ID: `420420777`
- Observed block number: `98309`
- Combined request latency: `689 ms`
- Result: `status=ok`

This second observation is consistent with the endpoint advancing from block `98129` at 04:26:05 UTC to `98309` at 04:44:29 UTC. It is still only two snapshots, not a continuous liveness or finality check.

## Independent configuration confirmation remains outstanding

The [published PortalDot developer Chain Info page](https://portaldot-dev.readthedocs.io/en/latest/chain-info.html) documents the Substrate mainnet websocket endpoint, SS58 format, and POT decimals; it does not document this EVM endpoint or chain ID. Until PortalDot confirms the EVM endpoint, chain ID, native gas token, and test-token denomination through a current official source or organizer channel, treat this endpoint as operationally responsive but not independently authenticated. Do not deploy or send funds based only on these RPC checks.
