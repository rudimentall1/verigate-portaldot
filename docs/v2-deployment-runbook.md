# PortalDotAgentGuardV2 deployment runbook

Status: source, tests and a guarded deployment script are on the working branch. This is not deployment evidence. Do not publish a V2 address or claim V2 is live until a real PortalDot receipt is confirmed and the readback values below are saved.

## Safety model

- V1 remains deployed at `0x3f2f484484fbE6e224d058fDfDB6B5A14F09655b`; do not overwrite or relabel it.
- V2 adds an admin-controlled recipient allowlist, maximum transfer amount, and rolling spending window.
- `admin`, `authoritySigner`, and the deployer must be three different EVM addresses.
- The admin can change policy and allowlisted recipients. The authority signer can authorize a transfer but cannot change policy.
- Verigate Ed25519 is still verified off-chain by the bridge. V2 verifies only the bridge's EIP-712 signature.
- Testnet only. No audit or production claim.

## Configure an untracked .env

Keep the existing verified PortalDot RPC and Substrate genesis pin. Do not paste secrets into chat, commit them, or put them in a public artifact.

Required values:
- `PORTALDOT_RPC_URL=https://test-evm-rpc-v3.portaldot.dev`
- `PORTALDOT_CHAIN_ID=420420777`
- `PORTALDOT_SUBSTRATE_RPC_URL=wss://test-node-v3.portaldot.dev`
- `PORTALDOT_SUBSTRATE_GENESIS_HASH`: the full, independently checked pin already used by the deployment workspace
- `DEPLOYER_PRIVATE_KEY`: dedicated testnet deployer key
- `ADMIN_ADDRESS`: separate policy-admin address
- `AUTHORITY_SIGNER_ADDRESS`: dedicated EIP-712 bridge signer address
- `V2_INITIAL_RECIPIENT`: a separate demo recipient, not the deployer or relayer
- `V2_MAX_PER_TRANSFER_WEI`: positive integer in EVM base units
- `V2_WINDOW_LIMIT_WEI`: integer greater than or equal to max per transfer
- `V2_WINDOW_SECONDS`: positive integer seconds

Do not reuse the V1 contract's deployed address as a V2 address. The deployer script checks chain ID, Substrate genesis pin, address separation, policy consistency and an estimated deployment budget before broadcast.

## Local verification

```sh
npm test
npm run compile
```

The deployment workspace previously recorded 156 passing local Hardhat tests. Re-run these commands on this branch and save the actual exit codes before making a fresh test claim. A successful `hardhat build` that reports `No contracts to compile` is not evidence of a fresh Solidity compilation.

## Deploy V2

Only run this when the .env is configured and the testnet deployer has enough test funds. Deployment sends an on-chain transaction and may consume a substantial fee.

```sh
npm run deploy:v2:portaldot
```

The script refuses to broadcast if the chain/genesis checks or budget check fail. On success, preserve its JSON output securely in a new evidence record: deployment transaction hash, block, contract address, runtime bytecode hash, admin, authority signer, maxPerTransfer, windowLimit, windowSeconds and initialRecipientAllowed. Do not invent values if the RPC omits them.

## Required live checks before calling V2 deployed

1. Independently query `eth_getTransactionReceipt` for the new deployment hash and confirm status `0x1` on chain ID 420420777.
2. Query `eth_getCode` at the new address and confirm non-empty runtime code.
3. Read back `admin()`, `authoritySigner()`, `maxPerTransfer()`, `windowLimit()`, `windowSeconds()`, and `allowedRecipients(initialRecipient)`.
4. Execute a signed test transfer to the allowlisted recipient, which must be a different address from the relayer/sender.
5. Confirm receipt status, matching `TransferExecuted` event, nonce consumption, and recipient balance delta. Record actual fee and amount side by side.
6. Verify that a transfer above the per-transfer cap and a transfer that exceeds the window cap revert; confirm the reverted nonce remains unused.
7. Only after the above succeeds should the dashboard be opened with `?guard=0x<deployed-v2-address>`. The dashboard is read-only and cannot deploy, authorize, sign, or execute.
8. Confirm H160-to-SS58 mapping separately using a real runtime mapping entry. Do not infer it from an address conversion or a successful EVM transaction.

If live RPC history is unavailable, report the limitation and preserve transaction evidence captured at the time. Never label a historical saved receipt as a current live lookup.
