# PortalDot V3 testnet operations

## Current verified deployment

See [deployment evidence](deployment-evidence-2026-10-20.md) for the contract address, transaction hash, receipt verification, runtime code hash, signer readback and measured fee.

- Network: PortalDot V3 EVM testnet
- Chain ID: `420420777`
- Contract: `0x3f2f484484fbE6e224d058fDfDB6B5A14F09655b`
- Deployment transaction: `0xb1cf9cca75bb029b0a723f13c398479d2c18704c1138c02c6d92a02c1fcdce3c`
- Deployer and authority signer are separate public EVM addresses.

## Read-only checks

On the current `main` branch, use Node.js 20+ and install dependencies:

```bash
npm ci
npm test
npm run preflight
npm run monitor:rpc
```

These commands do not deploy or transfer tokens. The tests use a local Hardhat chain. Preflight and the RPC monitor check connectivity/configuration; they do not prove that a payment will succeed.

## Transfer workflow and branch boundary

The deployed contract can transfer only its own native-token balance after validating an authorized EIP-712 payload. Do not treat this as a general-purpose wallet transfer.

The current `main` branch has the bridge-signing CLI (`npm run bridge:sign -- ./authorization-response.json`) but does **not** yet contain the post-deployment executor command that simulates and broadcasts an authorized transfer. That executor exists in the deployment workspace branch `chore/hardhat3-migration-preview`; it must be reviewed and published/merged before teammates can reproduce the full transfer workflow from `main`.

Do not improvise a direct contract call or run a deployment command as a transfer test. Before broadcasting, the team must review the exact network, deployed contract, action ID, recipient, amount, expiry and relayer fee budget. Run the executor in simulation mode first and verify the result. Only explicitly approved, minimal test transfers should be broadcast.

## Secret handling

Never commit `.env`, private keys, mnemonics, wallet exports, signed authorization payloads or other credentials. Keep local secret files untracked with restrictive permissions (for example, `chmod 600 .env`). Public addresses, transaction hashes and code hashes are intentionally included in the evidence document.

## Limitations

- Testnet deployment is not production readiness or an independent audit.
- 156 automated tests passed in the deployment workspace; local tests do not prove every live bridge path.
- Runtime lookup did not confirm the H160-to-SS58 mapping for the deployer. That mapping remains unverified.
