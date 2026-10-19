# Hacker House check-in status

Updated: 19 October 2026

The public event listing gives the check-in deadline as 24 October 2026, 20:00 UTC+8 (12:00 UTC, or 14:00 in Frankfurt). It lists the final submission/code-freeze deadline as 6 November 2026, 12:00 UTC+8 (04:00 UTC). Reconfirm current requirements and deadlines on the [official DoraHacks listing](https://dorahacks.io/hackathon/2362/detail) and [PortalDot Discord](https://discord.gg/portaldot).

## Current progress

- Public repository: https://github.com/rudimentall1/verigate-portaldot
- Core contract: PortalDotAgentGuard accepts only EIP-712-authorized native-token transfers and has no generic arbitrary-call interface.
- Bridge: verifies both Ed25519 artifacts against a locally pinned issuer key, checks the action and exact base-unit amount, and creates a short-lived EIP-712 authorization only for a genuine Verigate ALLOW.
- Guarded executor: simulation is the default. Explicit --broadcast is required to submit the exact transfer, after validating EIP-712 signer/domain, canonical signature encoding, live guard code hash, authority signer, deadline, guard funds and relayer fee budget.
- Live runtime metadata: a read-only Substrate probe returned specName=portaldot-v3, specVersion=3002, transactionVersion=2. The actual Revive.OriginalAccount storage has H160 keys and AccountId32 values. Revive.AddressSuffix is absent; AutoMap=true, NativeToEthRatio=10000 and runtime deposit/gas constants were read. [Runtime metadata evidence](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39225053317). A fixed synthetic H160 returned `no_mapping_entry` at finalized block 100714; this does not decide the mapping for a user's wallet.
- Address tools: offline SS58/H160 inspector plus a new one-key live mapping verifier. The latter queries only the supplied H160 at the captured finalized block and compares the returned AccountId32 bytes locally; it requires no private key and submits no transaction. Use `--redact` to keep the address pair out of the printed report, and run it locally so the pair isn't exposed in public CI logs. The RPC still receives the H160 necessary for the query.
- Full local end-to-end exercise: CI submits ALLOW and BLOCK through a disposable Verigate API, verifies signatures, signs only ALLOW, proves dry run leaves guard funds unchanged, then executes ALLOW against the actual guard contract on a temporary loopback Hardhat EVM. It confirms the transfer event and exact recipient balance delta. BLOCK is refused.
- Passing checks on code revision 9bb654b: [151 tests and Solidity compilation](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39225345829); [PortalDot integration CI](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39225345811); [RPC health](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39225339176); [dependency audit](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39225345731).
- Architecture and trust boundaries: [docs/architecture.md](architecture.md).
- Demo plan: [docs/demo-script.md](demo-script.md).
- DoraHacks text draft: [docs/check-in-submission.md](check-in-submission.md).

## Remaining before check-in

1. Use npm run verify:account-mapping -- 0xCandidateH160 5RegisteredSS58 locally to read exactly one Revive.OriginalAccount entry for the intended EVM/registered-SS58 pair. Do not use a keyless map query that enumerates accounts.
2. Confirm the actual deployment authority signer and independently verify the intended guard fingerprint.
3. Re-run read-only deployment estimation with the real signer and chosen deployer address. The earlier estimate used a placeholder signer and is preliminary.
4. Reconcile account mapping, token units and current budget before funding/deploying.
5. Deploy only after current network identity, mapping, budget and guard configuration are verified; preserve transaction and receipt evidence after confirmation.
6. Record the demo video and submit the progress summary on DoraHacks.

## Honest current limitations

- No live PortalDot contract deployment is claimed.
- Read-only checks found no `OriginalAccount` entry for the wallet-displayed H160, while the offline-derived H160 mapped to the registered SS58 account at the endpoint's reported finalized block. This is endpoint-reported evidence only; it does not prove private-key control or independently authenticate the network.
- Public RPC checks are read-only. Local transfer receipts come only from the loopback Hardhat integration.
- No CI job sends a transaction to public PortalDot.
- An HTTPS URL and reported chain ID do not independently authenticate a potentially malicious RPC.
- This is an initial integration, not production key management or an independent smart-contract audit.

## Submission checklist

- [x] Public GitHub repository
- [x] README with run instructions and explicit limitations
- [x] Architecture diagram and trust-boundary notes
- [x] Development commits during the build period
- [x] Contract tests, compilation, dependency audit and isolated Verigate integration
- [x] Executor defaults to simulation and local ALLOW execution is verified against the exact authorized amount
- [x] Read-only runtime metadata, storage schema and runtime constants captured
- [x] Local one-key OriginalAccount verification command added
- [x] Passing 151-test / compile / integration evidence recorded
- [ ] Exact registered-account mapping independently verified
- [ ] Verified testnet deployment evidence, if supported and available
- [ ] Initial demo link or video no longer than 3 minutes
- [ ] Check-in submission entered on DoraHacks
