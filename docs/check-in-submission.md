# Hacker House check-in submission draft

Copy this into the DoraHacks check-in form after verifying the current event requirements. This describes the state as of 20 October 2026; it does not claim a live token transfer.

## Project

**Name:** Verigate PortalDot  
**Track:** Node Operations & Tooling  
**Repository:** https://github.com/rudimentall1/verigate-portaldot

**One-line overview**

Verigate is an authorization control layer for AI-agent payments. An agent's proposal is not sufficient authority to move funds: the bridge requires a valid signed Verigate ALLOW decision and execution authorization, and a Solidity guard enforces the exact recipient, amount, deadline and replay nonce.

## What works

- **PortalDot V3 testnet deployment:** `PortalDotAgentGuard` deployed at `0x3f2f484484fbE6e224d058fDfDB6B5A14F09655b`.
- **Deployment transaction:** `0xb1cf9cca75bb029b0a723f13c398479d2c18704c1138c02c6d92a02c1fcdce3c`, receipt status `0x1`, block `116872`.
- **On-chain checks:** the deployed runtime bytecode was read back and hashed; the contract's `authoritySigner()` readback matched the configured signer. Evidence and limitations: https://github.com/rudimentall1/verigate-portaldot/blob/main/docs/deployment-evidence-2026-10-20.md
- **Guard contract:** accepts only a short-lived EIP-712-authorized native-token transfer and has no arbitrary-call interface.
- **Authorization bridge:** validates the signed Verigate decision and execution authorization, binds the action to the exact recipient and base-unit amount, and creates an EIP-712 authorization only for ALLOW.
- **Guarded executor:** defaults to simulation; validates the signature/domain, deployed code hash, authority signer, deadline, contract funds and relayer gas budget. Broadcasting requires an explicit `--broadcast` flag.
- **Automated checks:** 156 tests passed in the deployment workspace. Local end-to-end integration exercises ALLOW and BLOCK against a disposable loopback Hardhat EVM.

## Important limitations

The contract deployment is confirmed on PortalDot V3 testnet, but the local ALLOW/BLOCK end-to-end transfer evidence is from a loopback Hardhat EVM, not a public PortalDot transfer. The EVM-to-SS58 account mapping has not been independently confirmed for the displayed wallet address. This is a testnet prototype, not an independent audit or production-ready key-management system.

## Next work

1. Publish/review the guarded transfer executor and its dependencies on the public default branch so another developer can reproduce the flow.
2. Record a demo under three minutes showing the authorization decision, BLOCK refusal, simulation and the confirmed testnet deployment evidence. Label local execution as local.
3. Submit the check-in through DoraHacks and keep the repository and evidence links public.

## Operations and evidence

- Deployment evidence: https://github.com/rudimentall1/verigate-portaldot/blob/main/docs/deployment-evidence-2026-10-20.md
- Testnet operations runbook: https://github.com/rudimentall1/verigate-portaldot/blob/main/docs/testnet-operations-2026-10-20.md
- Repository Actions: https://github.com/rudimentall1/verigate-portaldot/actions

No private keys, seed phrases, API tokens or secret environment files belong in the submission.
