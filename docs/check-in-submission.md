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
- **Authorization bridge:** the bridge independently verifies both Verigate Ed25519 artifacts against a locally pinned issuer public key, asks the configured Verigate API verifier for a second check, binds the authorization to the exact action, recipient and base-unit amount, and creates a short-lived EIP-712 signature only for ALLOW.
- **Guarded executor:** the execution CLI validates the signed EIP-712 domain and recovered signer, rejects unsafe integer encodings and non-canonical signatures, checks guard runtime-code hash and authoritySigner, verifies the deadline and contract balance, simulates the exact transfer, and checks relayer gas budget with a 20% margin. It does not broadcast unless --broadcast is explicitly supplied.
- **Address diagnostics:** the repository now validates and decodes SS58 AccountId32 addresses, verifies the SS58 checksum, calculates the expected H160 using current upstream pallet-revive derivation rules, and compares a candidate EVM address without claiming this proves a live mapping. Documentation was corrected to distinguish deterministic fallback accounts from stateful runtime mappings and to direct users to discover the actual storage fields from PortalDot's live runtime metadata. The tool does not send transactions or call the live RPC.
- **Automated checks:** [139 tests and Solidity compilation](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39219610484), [PortalDot CI with the full isolated execution harness](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39219610537), [dependency audit](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39219610495), and [read-only RPC health](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39219605337) passed on code revision 976c9ca.
- **Full isolated execution evidence:** the integration harness starts a disposable Verigate API and a loopback-only Hardhat EVM, deploys the actual guard source to that simulator, verifies ALLOW and BLOCK artifacts, signs only ALLOW, proves executor dry-run does not change the guard balance, then executes the exact signed ALLOW transfer locally. It confirms the TransferExecuted event and recipient balance delta equal to the authorized amount; BLOCK is refused. No transfer is sent to the public PortalDot network by this integration workflow.
- **Read-only network checks:** the configured V3 EVM endpoint responded to health checks and reported chain ID 420420777. The endpoint and unit conversion are documented with the available provenance in [the network guide](https://github.com/rudimentall1/verigate-portaldot/blob/chore/hardhat3-migration-preview/docs/portaldot-v3-network.md). This is not a cryptographic authentication of the RPC operator.
- **Architecture and trust boundaries:** https://github.com/rudimentall1/verigate-portaldot/blob/chore/hardhat3-migration-preview/docs/architecture.md
- **Demo recording plan:** https://github.com/rudimentall1/verigate-portaldot/blob/chore/hardhat3-migration-preview/docs/demo-script.md

## Outstanding work

1. Read the live PortalDot V3 runtime metadata and verify the actual Substrate-to-H160 mapping/storage semantics, or obtain explicit confirmation from the PortalDot team. Current upstream mapping rules are only an offline cross-check.
2. Confirm the real dedicated authority signer and independently verify the intended guard's runtime bytecode fingerprint.
3. Re-run the read-only deployment estimate with the real signer and selected deployer address. The earlier preliminary quote used a placeholder constructor signer and is not deployment-ready.
4. Deploy only after endpoint identity, account mapping, token denomination, guard configuration, current storage/gas estimate and available budget are verified. Record address, transaction hash, block number and timestamp only after confirmation.
5. Record a demo video under three minutes, accurately labelling the automated execution as local EVM evidence rather than a live PortalDot transfer.
6. Submit the summary and repository on DoraHacks; reconfirm the event's current requirements and deadlines.

## Testnet deployment status

**Not deployed to PortalDot testnet.** No live contract address, transaction hash or explorer link is claimed. The end-to-end transfer evidence is from a temporary loopback Hardhat EVM. The public RPC health workflow makes read-only queries; it does not send a transaction. The current development branch remains a draft pull request and is not merged into main.

## Reproducibility

GitHub Actions runs contract tests, Solidity compilation, the isolated Verigate API integration, RPC health checks and dependency audit. Its evidence artifact contains the local ALLOW/BLOCK responses, signed authorization, executor dry-run summary and local transfer receipt details. That artifact proves only the local integration path, not a live PortalDot transaction.
