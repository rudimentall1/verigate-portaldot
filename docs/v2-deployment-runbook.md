# PortalDotAgentGuardV2 deployment runbook

Status: the deployment command reported a successful V2 deployment and on-chain readback on 2026-10-22. Address, transaction and runtime code hash are recorded in `docs/evidence/portaldot-v2-deployment-2026-10-22.json`. An earlier read-only query to the configured RPC confirmed the deployment receipt and all 15 code/configuration readback checks. A later query no longer returned that historical deployment transaction and receipt. This RPC history limitation does not establish deployment failure and is not a reason to redeploy. The updated `npm run verify:deployment:v2` now checks current runtime bytecode and policy readbacks even when the historical receipt is unavailable, and reports those two verification levels separately. The V2 guard was funded with 0.11 POT in block 148577; `npm run verify:funding:v2` re-queries the recent funding transaction. The live Verigate ALLOW → V2 bridge-signing → EVM execution path completed on 2026-10-22 for a 0.1 POT transfer to the allowlisted recipient. The read-only follow-up verifier reported a successful receipt (`status=1`), block `149241`, and exactly one `TransferExecuted` event from the configured V2 guard with the expected recipient and amount. Evidence is recorded in `docs/evidence/portaldot-v2-live-transfer-2026-10-22.json`. The receipt-derived cost figure was 7.82782148139542551 POT (`gasUsed × effectiveGasPriceWei`); the pre-broadcast estimate was 11.851857777667611907 POT. A later read-only reconciliation found the sender balance fell from `416.196502092920504516` to `408.368680611525079006 POT` in the isolated transaction block, exactly matching `gasUsed × effectiveGasPriceWei`. This is verified through the configured RPC only; runtime execution-fee and storage-deposit components were not separately determined. The verifier used the configured RPC, so this is not independent authentication of the RPC operator. A later read-only follow-up measured the recipient's balance increasing from `0` to `0.1 POT` across the isolated block using the configured RPC. This is testnet execution evidence only.


## Known account-selection deviation (24 October 2026)

V2 was deployed on the intended PortalDot V3 EVM testnet (chain ID `420420777`), but the deployer choice was not fully reconciled with the team's native funding account before funds were moved and deployment was performed. The saved deployment record identifies `0x4c07B4f328FA738290Db96BCE2F9CBc4d020D2CB` as deployer. The earlier read-only mapping record associated the team's SS58 account `5CwFhhZoS2LP5tWAzurDznL949zEemjePH1XBdw6grgyrEPB` with `0xb82c4b7923080251c6cbb3bab79de1e56f901ce1`, and returned no mapping entry for `0x4c07...` at that time. A prior PortalDot explorer result also associated `0x4c07...` with a different native SS58 account.

This is a real verification/decision error: the target chain was correct, but the sender's relationship to the team's intended account and the precise meaning of PortalDot's deployment instruction were not established before the transfer and deployment. The saved successful V2 deployment and guarded-transfer evidence remains valid for the configured RPC path; it does not prove that the sender was the account PortalDot intended us to use.

**Do not redeploy or move more funds just to correct the address label.** Before deciding whether a new deployment is necessary, verify both `Revive.OriginalAccount` entries at the same finalized block and clarify whether PortalDot requires an EVM transaction on its EVM endpoint or a deployment originating from the native Substrate account. The existing script uses an EVM private key through Hardhat and cannot be assumed to sign for a different native account. Keep V2 as deployed unless the verified requirement makes a separate deployment necessary. See [the account-mapping incident record](funding-and-account-mapping.md#deployment-decision-error-native-funding-account-vs-selected-evm-deployer-24-october-2026).


## Findings from deployment-requirement research (24 October 2026)

### What public material establishes

- The publicly indexed PortalDot Hacker House listing says projects must deploy on PortalDot testnet and submit contract address / transaction hash. It does not specify a required transaction-sender H160. This is a secondary event listing, not proof that no separate oral/Discord instruction was given: https://www.hackathonradar.com/database/hackathon/portaldot-hacker-house-2026
- The older PortalDot developer documentation identifies the Substrate network and native POT denomination, but it does not document the current V3 EVM sender requirement: https://portaldot-dev.readthedocs.io/en/latest/chain-info.html
- So the available public material does not settle what the PortalDot team meant if it separately said “deploy from the PortalDot EVM address.” That wording may mean (a) deploy against PortalDot's EVM-compatible RPC/network, or (b) use the H160 mapped to the team's native Substrate account. These are different requirements.

### Community support-message evidence reviewed

The project-provided Discord excerpts were reviewed on 24 October 2026. They show the team distributing initial and additional testnet tPOT to the project's native SS58 address `5CwFhh...`. When the wallet UI initially showed a zero balance after allocation, the support reply was to change the selected chain in the wallet. The later request for a second allocation explicitly provided the native Substrate wallet as the destination for funds needed for the V2 deployment storage deposit.

These messages support the interpretation that test funds were allocated to the native Substrate account and that the initial zero balance was a wallet/network-selection issue. They do **not** state that the contract deployment transaction had to be signed by `0xb82c...`, nor do they specify a mandatory EVM deployer address. The excerpts contain no instruction to use `0x4c07...` either.

Accordingly, the support excerpts do not resolve any separate verbal instruction that may have been given elsewhere. They must not be used as proof that the native account was required as the contract deployer. The public submission requirements found so far only require deployment on the PortalDot testnet and submission of the contract address and transaction hash.

### Technical paths

- The current project's V2 deploy script uses Hardhat/ethers through the PortalDot V3 EVM RPC, chain ID `420420777`, and `DEPLOYER_PRIVATE_KEY`. The recorded deployer is `0x4c07...`. This is a successful EVM-RPC deployment on PortalDot V3 testnet, but it does not establish that the sender corresponds to the team's native SS58 account.
- The repo's saved runtime snapshot records `Revive.AllowEVMBytecode=true` and an earlier `Revive.OriginalAccount` read matching `0xb82c...` to the team's SS58 account. The same historical probe returned no entry for `0x4c07...` at that time. These are endpoint-reported results from the recorded test date, not a fresh independent check.
- Upstream `pallet-revive` has a native Substrate `instantiate_with_code` dispatchable that instantiates a contract from supplied bytecode, and a `ReviveApi.instantiate` runtime API for dry-running instantiation. References: https://paritytech.github.io/polkadot-sdk/master/pallet_revive/pallet/struct.Pallet.html and https://paritytech.github.io/polkadot-sdk/master/pallet_revive/trait.ReviveApi.html
- That upstream capability makes a native-origin dry-run a reasonable next test if the requirement is to deploy using the account represented by `0xb82c...`. It is **not yet verified** that the current PortalDot runtime exposes the exact compatible runtime API / bytecode path in the needed form, or that its native call produces a contract deployment acceptable to the hackathon team.

### Decision

1. Do not redeploy or transfer more funds yet.
2. Resolve the sender requirement against the original team wording / official Discord or mentor reply. Publicly available requirements alone do not say a particular sender H160 is required.
3. In parallel, implement and test a local-only, read-only native `Revive.instantiate` dry-run using the current V2 creation bytecode, ABI-encoded constructor arguments, and native SS58 account. Inspect runtime metadata first and query the runtime dry-run API at a pinned finalized block. Do not submit the extrinsic in this step.
4. Compare the dry-run's reported success, contract address, consumed weight and storage-deposit requirements with the deployed V2 contract. A local or runtime dry-run is feasibility evidence only; it is not a deployment.
5. Only if the team confirms that the native-account sender is mandatory and the dry-run passes should a second deployment be considered. It would create a different contract instance and require explicit bridge/configuration migration; preserve the existing V2 and its evidence.

The precise conclusion is: **deploying on PortalDot V3 EVM testnet is confirmed; a rule requiring the deployer to equal the H160 mapped to the team's native SS58 account is not established by the public documentation I found. The native-origin path exists upstream, but PortalDot-specific feasibility still needs a dry-run.**
 
## Safety model

- V1 remains deployed at `0x3f2f484484fbE6e224d058fDfDB6B5A14F09655b`; do not overwrite or relabel it.
- V2 adds an admin-controlled recipient allowlist, maximum transfer amount, and resettable time-window spending cap.
- The counter resets once `windowSeconds` has elapsed; this is a resettable interval cap, not a continuously sliding rolling-window sum. The admin can change this policy, so it is not immutable against a compromised admin.
- `admin`, `authoritySigner`, and the deployer must be three different EVM addresses.
- The admin can change policy and allowlisted recipients. The authority signer can authorize a transfer but cannot change policy.
- Verigate Ed25519 is still verified off-chain by the bridge. V2 verifies only the bridge's EIP-712 signature.
- Testnet only. The V1/V2 deployment entrypoints and explicit authorized-transfer broadcast require EVM chain ID `420420777` and pin the write RPC host to `test-evm-rpc-v3.portaldot.dev`; the fixed V1/V2 funding scripts also require the official testnet host for broadcasts. The authorized-transfer CLI may still run read-only simulations against a local Hardhat chain, but its `--broadcast` path refuses any other chain ID or RPC host. Mainnet V3 EVM RPC and chain identity are not yet verified in this project; a mainnet deployment requires a separately reviewed code/configuration change. No audit or production claim.

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


## Live V2 evidence and remaining checks

### Confirmed on 2026-10-22

- V2 runtime bytecode is present and the reported runtime code hash matches the expected hash.
- Deployment/configuration readback previously passed; the verifier also confirmed current code and policy readbacks when the deployment receipt was no longer available through the RPC.
- The 0.11 POT funding transaction was reported confirmed in block 148577.
- A fresh Verigate `ALLOW` was followed by a V2 bridge signature and a real 0.1 POT transfer to the allowlisted recipient.
- The separate read-only receipt check reported status `1`, block `149241`, a matching block hash, the correct guard address, and exactly one `TransferExecuted` event with the expected recipient and amount. The sender debit of 7.82782148139542551 POT was reconciled with before/after EVM-balance reads for the isolated block; the runtime fee/storage-deposit components were not separately determined.
- Complete details and caveats are in `docs/evidence/portaldot-v2-live-transfer-2026-10-22.json`.

These results came from the configured PortalDot RPC. The separate verifier is a separate query path, not independent authentication of the RPC operator. The recipient balance delta was subsequently verified in a separate read-only check; post-transaction nonce state was not separately verified. The old deployment transaction receipt later became unavailable through this RPC; do not redeploy just to recreate historical RPC access.

### V2 negative-path test status (CI run 24 October 2026)

The latest successful [Test workflow](https://github.com/rudimentall1/verigate-portaldot/actions/runs/40088327004) ran on commit `059cfc8ba53adb67e31b1dfbe92dc5b46eb2068e`. `npm ci` and `npm test` passed. During `npm test`, Hardhat compiled four Solidity files with `solc 0.8.24` and ran the contract suite.

The following V2 behaviours are confirmed by **local Hardhat contract tests**:

- `rejects a transfer above maxPerTransfer without consuming its nonce`: rejects an amount one wei above the configured per-transfer cap; the nonce remains unused.
- `rejects spending-window overflow without consuming the nonce`: after a successful 2 POT local transfer against a 3 POT test cap, an additional 1.01 POT transfer reverts with `WindowLimitExceeded`; the second nonce remains unused and `spentInWindow` remains at 2 POT.
- `resets window accounting after the configured interval`: after advancing local EVM time by 3,601 seconds, a new 2 POT transfer succeeds and the interval counter reflects the new interval.
- Other tests also verify that an unlisted recipient is rejected without consuming its nonce.

These are local contract tests. They do not represent mined public PortalDot revert transactions. The published DApp separately has read-only live `eth_call` evidence for `InvalidRecipient()` and `AmountExceedsCap(amount, cap)`; no public transaction was broadcast for those probes. No live transaction is necessary just to re-prove the already passing local state-reversion tests.

### Remaining evidence boundaries

1. A mined public-testnet rejection for time-window overflow is **not recorded**. Do not claim a live on-chain window-overflow rejection. Do not send a costly transaction solely to obtain one unless there is a specific evaluation reason and a reviewed budget.
2. H160-to-SS58 mapping still needs a separate same-finalized-block lookup; do not infer it from address conversion or successful EVM execution.
3. Independent EVM RPC authentication is not established; the recorded live transfer and read-only denial probes used one configured provider.

The dashboard can be opened with `?guard=0x87C494a5e4B0A8E055F283767579667E10E046C6`; it is read-only and cannot deploy, authorize, sign, or execute.

If live RPC history becomes unavailable, preserve evidence captured at the time. Never label a saved receipt as a current live lookup.
