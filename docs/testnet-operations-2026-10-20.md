# PortalDot V3 testnet operations

This runbook contains public testnet identifiers and reproducible commands only. Never put `.env`, mnemonic files, private keys, signed secrets, or wallet exports in Git. The repository ignores `.env` and `.secrets/`; keep them local and mode `600`.

## Verified deployment

- Network: PortalDot V3 EVM testnet
- Chain ID: `420420777`
- Expected Substrate genesis hash: `0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd`
- Contract: `PortalDotAgentGuard`
- Contract address: `0x3f2f484484fbE6e224d058fDfDB6B5A14F09655b`
- Deployment transaction: `0xb1cf9cca75bb029b0a723f13c398479d2c18704c1138c02c6d92a02c1fcdce3c`
- Receipt: success, block `116872`
- Runtime code Keccak-256: `0xb3d71ff82b4b654c7bafe855ce13b0dc277627a046e3190f6f6e0ee5eb7f7671`
- Configured authority signer: `0x48F9B07d37b5AF744BA8195c4d6740145b593ea6`
- Deployer public EVM address: `0x4c07B4f328FA738290Db96BCE2F9CBc4d020D2CB`

The deployment receipt, canonical block hash, runtime code hash, signer readback, measured fee and limitations are recorded in [deployment evidence](deployment-evidence-2026-10-20.md). This is testnet evidence, not an audit or a production deployment. The specific H160-to-SS58 mapping has not been verified by the runtime storage lookup.

## Reproduce checks

From the repository root on a configured machine:

```bash
npm ci
npm test
npm run preflight
npm run inspect:substrate-runtime
npm run verify:deployer-address
```

`verify:deployer-address` uses the locally configured address and `.env`; do not print or paste `.env` output into issues, chat, CI logs or commits. Review the deployment evidence before considering a new deployment. `npm run deploy:portaldot` can submit a new deployment transaction and should not be run casually just to verify the existing contract.


## Confirmed authorized transfer (21 October 2026)

A test transfer has now been broadcast and verified on the configured PortalDot V3 EVM RPC. The successful receipt is in block 130741, transaction 0xbe3ade2ba3209cf0df3647cea50fb6608a77bb837213a25b8ec419fa9914cc14; one matching TransferExecuted event was decoded from PortalDotAgentGuard. Full fields, fee observation, limitations and a read-only verification command are recorded in [authorized-transfer evidence](authorized-transfer-evidence-2026-10-21.md).

This was only **1 EVM base unit** (1e-18 EVM POT). For the next demo-quality proof, create a fresh Verigate authorization for a non-dust amount, independently review recipient/amount/fees, then verify the new receipt, event fields and guard/recipient balance delta. Never replay this signed payload or modify a signed payload after signing. The signed JSON is intentionally ignored by Git.

## Create and simulate a Verigate-authorized token transfer

The bridge path transfers EVM-denominated POT held by `PortalDotAgentGuard`. It is not the same as transferring native Substrate tPOT from a SubWallet account.

1. Generate an authorization through the approved Verigate flow and save the response locally as `authorization-response.json`. It must contain a valid signed authorization; do not commit it if it contains confidential action details or signatures.
2. Sign/normalize it with the bridge CLI, then run the executor without `--broadcast`:

```bash
npm run bridge:sign -- ./authorization-response.json > ./signed-transfer.json
npm run execute:authorization -- ./signed-transfer.json
```

Without `--broadcast`, the executor validates the EIP-712 authorization, chain, contract bytecode hash, on-chain authority signer, deadline, recipient, amount, guard balance and relayer fee budget, then simulates the exact call. It does not send a transaction. Inspect every displayed field and require `status: "simulation_passed"` before considering broadcast.

3. Only after a human has reviewed and explicitly approved the exact recipient, amount, action ID, network, contract and fee budget, submit the same signed payload:

```bash
npm run execute:authorization -- ./signed-transfer.json --broadcast
```

Broadcast requires `DEPLOYER_PRIVATE_KEY` in the local untracked `.env`. That key is the relayer key and pays the transaction fee; it must not equal the authority signer. The executor rechecks the latest state and fee budget immediately before submission. Never place the key or mnemonic in command-line arguments, shell history, screenshots, documentation or issue comments. If a transaction hash is reported but the receipt is unavailable, inspect the hash before retrying; do not blindly submit again.

Do not run the broadcast command as a smoke test. A successful call transfers the exact authorized amount from the guard contract to the authorized recipient. Start with a deliberately authorized, minimal test amount only after confirming the guard is funded and the intended recipient is controlled by the test team.

## Submission materials

- [Presentation PDF](Verigate-PortalDot-Presentation.pdf) is a seven-slide overview of the problem, architecture, PortalDot integration, deployment evidence, verification results, ecosystem value, and current limitations.
- The product demo recording is a separate deliverable and remains pending. Do not submit the PDF as a substitute for that video.

## Evidence and safety boundaries

- Deployment evidence is in [deployment-evidence-2026-10-20.md](deployment-evidence-2026-10-20.md).
- Earlier read-only estimate and its caveats are in [deployment-cost-evidence.md](deployment-cost-evidence.md); it is not a fee guarantee.
- Automated tests run against a local temporary EVM and do not prove every PortalDot on-chain path works.
- No production readiness or independent audit is claimed.
- Public addresses and transaction hashes are intentionally documented. Private keys, mnemonics, `.env`, signed payloads and wallet backups are not.