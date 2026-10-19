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

## Network-configuration cross-check

The [PortalDot V3 network guide](portaldot-v3-network.md) records the EVM RPC, chain ID, Substrate endpoint, native precision, address mapping and cost notes. It links to a live-testnet field guide which attributes the EVM parameters to Portaldot Discord `#dev-announcement` on 16 October 2026. The public [PortalDot developer Chain Info page](https://portaldot-dev.readthedocs.io/en/latest/chain-info.html) describes Substrate mainnet separately; it is not the source for these V3 EVM testnet settings.

The RPC health check establishes read-only endpoint responsiveness at a given time. It does not prove that a contract is deployed, that the deployer balance covers PortalDot's code storage deposit, or that one RPC cannot lie. The genesis hash is an optional extra guard when obtained from a separate trusted source, not a required setting from the cited announcement. Before sending a deployment transaction, estimate the cost using this repository's actual bytecode and verify the deployer's EVM-reported balance.

## Public-source cross-check (19 October 2026)

The public [Portaldot Hacker House listing distributed by DoraHacks](https://www.eventbrite.com/e/portaldot-hacker-house-2026-tickets-2002321816454) describes PortalDot V3.0 as EVM-compatible and mentions WASM/EVM execution and ERC-20/ERC-721 support. This supports the general project scope, but it does **not** publish the exact EVM RPC URL, chain ID, genesis block hash, EVM gas-token denomination, tPOT mapping, or an independent explorer/checkpoint for this endpoint.

The [PortalDot developer Chain Info page](https://portaldot-dev.readthedocs.io/en/latest/chain-info.html) lists `wss://mainnet.portaldot.io`, SS58 format 42, and native POT with 14 decimals. Those are Substrate mainnet parameters and must not be silently reused as EVM testnet settings.

### Decision gate before test-fund use

Obtain confirmation from the [official PortalDot Discord](https://discord.gg/portaldot) or another current, independently verifiable PortalDot source for all of the following:

- Exact EVM RPC URL and decimal chain ID.
- A trusted explorer URL or expected genesis/checkpoint hash to validate network identity independently of that RPC.
- Native gas-token symbol and decimals for EVM value units; whether this differs from Substrate POT's 14 decimals.
- How EVM addresses/accounts map to PortalDot accounts, and how test gas/tokens are funded.

Until then, this repo's status is: public RPC responsive and CI checks green, but EVM network identity and spending configuration are **not independently authenticated**. Do not deploy or send test funds solely on the basis of a matching chain ID or a green health check.

## Additional software guardrail added on the preview branch

The preflight and deployment path now require `PORTALDOT_GENESIS_HASH`: an independently confirmed 32-byte block-0 hash. Preflight reads `eth_getBlockByNumber("0x0", false)` and refuses to continue if that response is missing, malformed, or does not match the pin. Direct Hardhat deployment checks the same pin, and the bridge refuses to sign if the configured RPC's genesis response does not match.

This is a fail-closed configuration guard against missing pins and ordinary wrong-network misconfiguration, **not cryptographic proof that a remote RPC is honest**: a malicious RPC can lie about multiple JSON-RPC responses. Do not fill in the pin by blindly copying the same untrusted endpoint's answer. Obtain a trusted value from PortalDot or a separately trusted explorer/checkpoint, then independently compare it. Until that value is confirmed and configured, deployment and bridge signing are expected to stop.

