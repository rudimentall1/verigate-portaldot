# Hacker House check-in submission draft

Copy and adapt this text for DoraHacks. It deliberately does not claim a live PortalDot deployment.

## Project

**Name:** Verigate PortalDot  
**Track:** Node Operations & Tooling

**One-line overview**

Verigate PortalDot is a narrow authorization bridge that prevents an AI agent's proposed native-token payment from being signed unless Verigate issues a valid signed `ALLOW` decision and execution authorization; a Solidity guard then enforces the resulting EIP-712 transfer constraints.

## Current progress

- **Public repository:** https://github.com/rudimentall1/verigate-portaldot
- **Native-transfer guard:** `PortalDotAgentGuard` accepts only an EIP-712-authorized native-token transfer. It checks the trusted signer, recipient, amount, deadline and replay nonce; it has no arbitrary-call interface.
- **Authorization bridge:** the bridge independently validates both Verigate Ed25519 artifacts using a locally pinned issuer public key, asks the API verifier for a second check, binds the authorization to the exact action, recipient and amount, and produces a short-lived EIP-712 signature only for `ALLOW`.
- **Automated evidence:** GitHub Actions runs local Hardhat tests and Solidity compilation, plus a separate integration job using a temporary Verigate API instance with disposable test keys. The integration verifies genuine signed artifacts locally against a pinned Ed25519 public key, asks the API verifier for a second check, creates a dry-run EIP-712 signature for `ALLOW`, and refuses `BLOCK`. Unit tests also prove that an invalid signature is refused even if the API claims it is valid.
- **Latest CI evidence:** https://github.com/rudimentall1/verigate-portaldot/actions/runs/38681783295
- **Architecture and trust boundaries:** https://github.com/rudimentall1/verigate-portaldot/blob/main/docs/architecture.md
- **Demo recording plan:** https://github.com/rudimentall1/verigate-portaldot/blob/main/docs/demo-script.md

## Outstanding work

1. Confirm the official PortalDot V3 EVM testnet RPC, chain ID, native-token denomination and address mapping with the PortalDot team or authoritative documentation.
2. Run the network preflight and deploy the guard only after those details are confirmed. Capture the contract address, transaction hash, block number and explorer link if the network supports it.
3. Record and publish an initial demo video of no more than three minutes. Until network details are confirmed, label the current integration as a local dry run.

## Testnet deployment status

**Not deployed to the PortalDot testnet.** No contract address, deployment transaction hash or explorer transaction link is claimed. `PORTALDOT_RPC_URL` and `PORTALDOT_CHAIN_ID` are intentionally blank in `.env.example`; the previously discussed chain ID `420420777` is a test fixture, not a confirmed network setting. The current CI demonstration does not broadcast a transaction.

## Reproducibility

The local contract and bridge checks run through GitHub Actions. The integration job uploads `summary.json`, signed `ALLOW` and `BLOCK` responses, and a dry-run signature as the `isolated-verigate-api-evidence` artifact. The artifact contains temporary test data only and is not proof of a live PortalDot transaction.

