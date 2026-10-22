# PortalDotAgentGuardV2 deployment runbook

Status: the deployment command reported a successful V2 deployment and on-chain readback on 2026-10-22. Address, transaction and runtime code hash are recorded in `docs/evidence/portaldot-v2-deployment-2026-10-22.json`. An earlier read-only query to the configured RPC confirmed the deployment receipt and all 15 code/configuration readback checks. A later query no longer returned that historical deployment transaction and receipt. This RPC history limitation does not establish deployment failure and is not a reason to redeploy. The updated `npm run verify:deployment:v2` now checks current runtime bytecode and policy readbacks even when the historical receipt is unavailable, and reports those two verification levels separately. The V2 guard was funded with 0.11 POT in block 148577; `npm run verify:funding:v2` re-queries the recent funding transaction. The live Verigate ALLOW → V2 bridge-signing → EVM execution path completed on 2026-10-22 for a 0.1 POT transfer to the allowlisted recipient. The read-only follow-up verifier reported a successful receipt (`status=1`), block `149241`, and exactly one `TransferExecuted` event from the configured V2 guard with the expected recipient and amount. Evidence is recorded in `docs/evidence/portaldot-v2-live-transfer-2026-10-22.json`. The actual reported transaction fee was 7.82782148139542551 POT; the pre-broadcast estimate was 11.851857777667611907 POT. The verifier used the configured RPC, so this is not independent authentication of the RPC operator. Recipient balance delta was not measured. This is testnet execution evidence only.

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
- `PORTALDOT_V2_GUARD_ADDRESS=0x87C494a5e4B0A8E055F283767579667E10E046C6`
- `PORTALDOT_V2_GUARD_CODE_HASH=0x010a565cad83a33442d0f23f6fcb6f605a76082a5b58434813bedf84c54f0859`
- `PORTALDOT_V2_DEPLOYMENT_TX_HASH=0x331c1fc027da51af26ed5ee92ef22a8250fe4efdf0d84526f5fe2203f5d3494b`
- For the V2 bridge flow, set `PORTALDOT_GUARD_PROFILE=v2`. The bridge selects `PortalDotAgentGuardV2` / EIP-712 version `2` and uses the V2-specific address and code-hash variables. V1 remains the default when the profile is unset or `v1`.

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

## Funding and current verification

The recorded funding transaction is `0x3670b42ad718232b572ba06542ffaebd713db6852a215c8acffc471f0eab5019` in block `148577`, with `0.11 POT` sent from the deployer to the V2 guard. The transaction/fee/current-balance values are recorded in `docs/evidence/portaldot-v2-deployment-2026-10-22.json` as reported server output. Re-query it before using the record as independently verified funding evidence:

```sh
npm run verify:funding:v2
```

The V2 profile must be configured in the untracked local `.env` before signing or executing a V2 transfer. Do not change the V1 profile until ready to run the V2 flow, and keep the V1 address and hash intact.

## Live Verigate-to-V2 simulation helper

On the configured Gensyn2 host, `python3 scripts/prepare-live-v2-e2e.py` prepares a separate recipient-scoped Verigate policy and capability for the V2 allowlisted address, starts a loopback-only verifier on port 8002 using the same issuer key/database, requests a fresh agent-signed ALLOW, runs the bridge signer and simulates the EVM call. The existing verifier on port 8001 and its original policy are left untouched. It refuses to bypass governed-policy mode, validates the issuer-key pin, and does not print private keys or signatures.

The helper's normal invocation intentionally stops before broadcast. It writes private local artifacts under `/opt/verigate-portaldot-issuer/live-e2e/` with restrictive file permissions and updates only the local project's `VERIGATE_BASE_URL` after Verigate returns ALLOW. The successful live V2 transaction was broadcast only after a fresh ALLOW/signature, pre-broadcast re-simulation, a refreshed gas quote, and a fee-budget check, then checked by a separate read-only receipt verifier. Any future transfer requires a fresh authorization and explicit operator approval; do not replay old signed artifacts. This is a host-specific test harness, not a production deployment workflow.


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
