# Hacker House check-in status

Updated: 19 October 2026

The public event listing gives the check-in deadline as 24 October 2026, 20:00 UTC+8 (12:00 UTC, or 14:00 in Frankfurt). It lists the final submission/code-freeze deadline as 6 November 2026, 12:00 UTC+8 (04:00 UTC). Reconfirm current requirements and deadlines on the [official DoraHacks listing](https://dorahacks.io/hackathon/2362/detail) and [PortalDot Discord](https://discord.gg/portaldot).

## Current progress

- Public repository: https://github.com/rudimentall1/verigate-portaldot
- Core contract: PortalDotAgentGuard accepts only EIP-712-authorized native-token transfers and has no generic arbitrary-call interface.
- Bridge: verifies both Ed25519 artifacts against a locally pinned issuer key, checks the action and exact base-unit amount, and creates a short-lived EIP-712 authorization only for a genuine Verigate ALLOW.
- Guarded executor: simulation is the default. Explicit --broadcast is required to submit the exact transfer, after validating the EIP-712 signer/domain, live guard code hash, authority signer, deadline, guard funds and relayer fee budget.
- Full local end-to-end exercise: the CI harness submits ALLOW and BLOCK through a disposable Verigate API, verifies signatures, signs only ALLOW, proves the dry run leaves guard funds unchanged, then executes ALLOW against the actual guard contract on a temporary loopback Hardhat EVM. It confirms the transfer event and recipient balance delta exactly equals the authorized amount. BLOCK is refused.
- Passing code checks: [134 tests and Solidity compilation](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39218574339); [PortalDot integration CI](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39218574347); [RPC health](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39218565358); [dependency audit](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39218574427). All checks passed on branch revision 59fa28a, including the guarded executor, canonical low-s/recovery-byte checks and local exact-amount transfer. Re-run CI after later code changes before submission.
- Architecture and trust boundaries: [docs/architecture.md](architecture.md).
- Demo plan: [docs/demo-script.md](demo-script.md).
- DoraHacks text draft: [docs/check-in-submission.md](check-in-submission.md).

## Remaining before check-in

1. Re-run all checks after any further code changes and preserve the current passing evidence.
2. Confirm the actual deployment authority signer and independently verify the intended contract fingerprint.
3. Re-run read-only deployment estimation with the real signer and chosen deployer address. The earlier estimate used a placeholder signer.
4. Deploy only after current budget and network configuration are verified; preserve transaction and receipt evidence after confirmation.
5. Record the demo video and submit the progress summary on DoraHacks.

## Honest current limitations

- No live PortalDot contract deployment is claimed.
- Public-RPC health checks are read-only. Local transaction receipts come only from the loopback Hardhat integration.
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
- [x] Passing branch test/compile and integration evidence recorded
- [ ] Verified testnet deployment evidence, if supported and available
- [ ] Initial demo link or video no longer than 3 minutes
- [ ] Check-in submission entered on DoraHacks
