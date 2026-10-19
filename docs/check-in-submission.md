# Hacker House check-in submission draft

Copy and adapt this text for DoraHacks. It deliberately does not claim a live PortalDot deployment.

## Project

**Name:** Verigate PortalDot  
**Track:** Node Operations & Tooling

**One-line overview**

Verigate PortalDot is an authorization bridge that prevents an AI agent's proposed native-token payment from being signed unless Verigate issues a valid signed ALLOW decision and execution authorization; a Solidity guard enforces the resulting EIP-712 transfer constraints.

## Current progress

- **Public repository:** https://github.com/rudimentall1/verigate-portaldot
- **Native-transfer guard:** PortalDotAgentGuard accepts only an EIP-712-authorized native-token transfer. It checks the trusted signer, recipient, amount, deadline and replay nonce, and has no arbitrary-call interface.
- **Authorization bridge:** independently verifies both Verigate Ed25519 artifacts against a locally pinned issuer public key, asks the configured Verigate API verifier for a second check, binds the authorization to the exact action, recipient and base-unit amount, and creates a short-lived EIP-712 signature only for ALLOW.
- **Guarded executor:** validates the signed EIP-712 domain and recovered signer, rejects unsafe integer encodings and non-canonical signatures, checks guard runtime-code hash and authoritySigner, verifies deadline and contract balance, simulates the exact transfer, and checks relayer gas budget with a 20% margin. It does not broadcast unless --broadcast is explicitly supplied.
- **Live PortalDot runtime metadata:** a read-only probe against the advertised Substrate WSS endpoint returned runtime specName=portaldot-v3, specVersion=3002 and transactionVersion=2 at finalized block 100400. The decoded Revive.OriginalAccount storage is keyed by a 20-byte H160 and stores AccountId32; Revive.AddressSuffix does not exist in this runtime. The runtime reports AutoMap=true, NativeToEthRatio=10000 and live deposit/gas constants. Evidence: [read-only runtime inspection run](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39221376587). A synthetic H160 query returned no mapping entry, as expected. This establishes the storage schema and runtime-reported configuration, but not the mapping for any user's wallet.
- **Address verification tooling:** the repo validates SS58 checksums, computes offline H160 derivation for comparison, and adds the command npm run verify:account-mapping -- 0xCandidateH160 5RegisteredSS58 to query exactly one Revive.OriginalAccount key locally with polkadot-cli 0.7.0. It requires no private key, uses a temporary CLI home, and sends no extrinsics or transactions. Run it locally; do not put a personally identifying wallet pair into public CI inputs or logs.
- **Latest passing checks on code revision f403afc:** [149 tests and Solidity compilation](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39222765884), [PortalDot integration CI](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39222765902), [RPC health](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39222759657), and [dependency audit](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39222765909).
- **Full isolated execution evidence:** the integration harness starts a disposable Verigate API and a loopback-only Hardhat EVM, deploys the actual guard source to that simulator, verifies ALLOW and BLOCK artifacts, signs only ALLOW, proves executor dry-run does not change the guard balance, then executes the exact signed ALLOW transfer locally. It confirms the TransferExecuted event and that the recipient balance delta equals the authorized amount; BLOCK is refused. No transfer is sent to public PortalDot by this integration workflow.
- **Architecture and trust boundaries:** https://github.com/rudimentall1/verigate-portaldot/blob/chore/hardhat3-migration-preview/docs/architecture.md
- **Demo recording plan:** https://github.com/rudimentall1/verigate-portaldot/blob/chore/hardhat3-migration-preview/docs/demo-script.md

## Outstanding work

1. Run the new one-key verify:account-mapping command locally for the intended deployer H160 and registered SS58 account. The runtime schema is known, but that specific OriginalAccount entry has not been queried here.
2. Confirm the real dedicated authority signer and independently verify the intended guard's runtime bytecode fingerprint.
3. Re-run the read-only deployment estimate with the real signer and selected deployer address. The earlier preliminary quote used a placeholder constructor signer and is not deployment-ready.
4. Reconcile the EVM/Substrate account relationship and token units before funding or deploying. The old quote must not be used as a transfer instruction.
5. Deploy only after endpoint identity, mapping, token denomination, guard configuration, current storage/gas estimate and available budget are verified. Record address, transaction hash, block number and timestamp only after confirmation.
6. Record a demo video under three minutes, accurately labelling the automated execution as local EVM evidence rather than a live PortalDot transfer.
7. Submit the summary and repository on DoraHacks; reconfirm the event's current requirements and deadlines.

## Testnet deployment status

**Not deployed to PortalDot testnet.** No live contract address, transaction hash or explorer link is claimed. The end-to-end transfer evidence is from a temporary loopback Hardhat EVM. Public EVM/Substrate RPC CI calls are read-only. The current development branch remains a draft pull request and is not merged into main.

## Reproducibility

GitHub Actions runs contract tests, Solidity compilation, the isolated Verigate API integration, RPC health checks, dependency audit and a read-only runtime-metadata probe. The local ALLOW/BLOCK artifact proves the isolated integration path, not a live PortalDot transaction. Runtime metadata and constants come from one endpoint's reported state and are not independent network authentication.
