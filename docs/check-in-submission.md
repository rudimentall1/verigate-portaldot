# Hacker House check-in submission draft

Copy and adapt this text for DoraHacks. It deliberately does not claim a live PortalDot deployment.

## Project

**Name:** Verigate PortalDot  
**Track:** Node Operations & Tooling

**One-line overview**

Verigate PortalDot is an authorization bridge that prevents an AI agent's proposed native-token payment from being signed unless Verigate issues a valid signed `ALLOW` decision and execution authorization; a Solidity guard then enforces the resulting EIP-712 transfer constraints.

## Current progress

- **Public repository:** https://github.com/rudimentall1/verigate-portaldot
- **Native-transfer guard:** `PortalDotAgentGuard` accepts only an EIP-712-authorized native-token transfer. It checks the trusted signer, recipient, amount, deadline and replay nonce, and has no arbitrary-call interface.
- **Authorization bridge:** the bridge independently verifies both Verigate Ed25519 artifacts against a locally pinned issuer public key, asks the configured Verigate API verifier for a second check, binds the authorization to the exact action, recipient and base-unit amount, and produces a short-lived EIP-712 signature only for `ALLOW`.
- **Pre-sign safety checks:** the bridge checks the configured chain ID, deployed guard runtime-code hash and on-chain `authoritySigner()`. Missing or mismatched configuration fails closed. A genesis-hash pin is an optional extra check, not a claim that one RPC endpoint can authenticate itself.
- **Automated tests:** the current PR branch passed 117 tests and Solidity compilation, plus PortalDot integration CI, read-only RPC health checks and the dependency security audit. Latest branch-head results: [Test](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39215891700), [PortalDot CI](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39215891705), [RPC health](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39215886934), and [dependency security audit](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39215891761).
- **Isolated end-to-end evidence:** CI starts a disposable Verigate API and a loopback-only Hardhat EVM, deploys the actual guard source to that simulator, verifies signed `ALLOW` and `BLOCK` artifacts, creates a dry-run signature only for `ALLOW`, and refuses `BLOCK`. It sends no transaction to the public PortalDot network.
- **Read-only network checks:** the configured PortalDot V3 EVM endpoint has responded to read-only RPC health checks and reported chain ID `420420777`. The endpoint and chain details are documented with their available provenance in [the network guide](https://github.com/rudimentall1/verigate-portaldot/blob/chore/hardhat3-migration-preview/docs/portaldot-v3-network.md).
- **Architecture and trust boundaries:** https://github.com/rudimentall1/verigate-portaldot/blob/chore/hardhat3-migration-preview/docs/architecture.md
- **Demo recording plan:** https://github.com/rudimentall1/verigate-portaldot/blob/chore/hardhat3-migration-preview/docs/demo-script.md

## Outstanding work

1. Confirm a final deploy configuration using a real dedicated authority signer and independently verified guard bytecode fingerprint.
2. Re-run the read-only deployment estimate with that real signer and the selected public deployer address. A prior preliminary estimate used a placeholder constructor signer, so it is not a deployment-ready quote.
3. Deploy the guard only after the estimate, available budget and network details have been checked. Record the contract address, transaction hash, block number and timestamp only after the transaction is confirmed.
4. Record and publish an initial demo video no longer than three minutes. Clearly label the currently reproducible CI flow as a local dry run, not a live PortalDot transaction.
5. Submit the progress summary and public repository on DoraHacks; confirm the event's current requirements and deadlines on the official listing and PortalDot Discord.

## Testnet deployment status

**Not deployed to the PortalDot testnet.** No contract address, deployment transaction hash or explorer link is claimed. CI checks and the RPC health workflow are read-only with respect to the public testnet; the automated end-to-end contract exercise uses only a local EVM simulator. The current branch is a draft pull request and has not been merged into `main`.

## Reproducibility

GitHub Actions runs the contract tests, Solidity compilation, bridge integration checks, RPC health check and dependency audit. The integration workflow can upload an `isolated-verigate-api-evidence` artifact containing disposable test data. That artifact is evidence of the local integration path only, not proof of a live PortalDot transaction.
