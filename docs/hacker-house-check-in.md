# Hacker House check-in status

Updated: 19 October 2026

The public event listing gives the check-in deadline as 24 October 2026, 20:00 UTC+8 (12:00 UTC, or 14:00 in Frankfurt). It lists the final submission/code-freeze deadline as 6 November 2026, 12:00 UTC+8 (04:00 UTC). Reconfirm current requirements and deadlines on the [official DoraHacks listing](https://dorahacks.io/hackathon/2362/detail) and [PortalDot Discord](https://discord.gg/portaldot).

## Current progress

- **Public repository:** https://github.com/rudimentall1/verigate-portaldot
- **Core contract:** PortalDotAgentGuard accepts only EIP-712-authorized native-token transfers and has no generic arbitrary-call interface.
- **Bridge:** verifies both Ed25519 artifacts against a locally pinned issuer key, checks the action and exact base-unit amount, and creates a short-lived EIP-712 authorization only for a genuine Verigate ALLOW.
- **Guarded executor:** npm run execute:authorization -- ./signed-transfer.json validates and simulates the exact signed transfer without broadcasting. The explicit --broadcast path checks the guard code hash, configured authority, signature, deadline, guard funds, gas estimate and relayer budget before submitting the exact authorized payment.
- **Full local end-to-end exercise:** the CI harness submits ALLOW and BLOCK through a disposable Verigate API, verifies the signed artifacts, creates the EIP-712 authorization, proves dry-run did not mutate guard state, then executes ALLOW against the actual guard contract on a temporary loopback Hardhat EVM. It confirms the transfer event and asserts the recipient balance delta equals the authorized amount. BLOCK is refused. These are local transactions, not public PortalDot evidence.
- **Network guardrails:** read-only preflight and RPC health checks, optional genesis-hash pin, runtime bytecode hash verification, exact integer unit conversion, deployment estimate with 20% margin, and dependency security audit.
- **Architecture and trust boundaries:** [docs/architecture.md](architecture.md).
- **Demo plan:** [docs/demo-script.md](demo-script.md), explicitly distinguishing local integration from a live deployment.
- **Submission draft:** [docs/check-in-submission.md](check-in-submission.md).

## Remaining before check-in

1. Complete a successful branch-head test run after the executor change and keep its passing Actions evidence linked here.
2. Configure and verify a dedicated non-zero authority signer and the intended guard's runtime-code fingerprint.
3. Re-run the read-only deployment estimate with the real authority signer and selected deployer address. A prior preliminary quote used a placeholder authority signer and is not deployment-ready.
4. Deploy only after network configuration, estimated storage/gas cost and available budget have been checked. Record contract address, transaction hash, block number and timestamp only after confirmation.
5. Record the demo video, then enter the progress summary and public repository on DoraHacks.

## Honest current limitations

- No live PortalDot contract deployment is claimed.
- Public-RPC health checks are read-only. The full ALLOW transfer test and local transaction receipts use only loopback Hardhat.
- The public executor can submit a transfer when --broadcast is explicitly supplied and all checks pass; no public transaction is sent by CI.
- Network details and amount units are documented with their available source provenance in docs/portaldot-v3-network.md. An HTTPS URL and expected chain ID do not independently authenticate a potentially malicious RPC.
- The CLI is an initial integration, not a production key service or independent smart-contract audit.

## Submission checklist

- [x] Public GitHub repository
- [x] README with run instructions and explicit limitations
- [x] Architecture diagram and trust-boundary notes
- [x] Development commits during the build period
- [x] Contract tests, dependency audit and isolated Verigate integration harness
- [x] Executor defaults to simulation and the local harness tests an exact signed ALLOW payment
- [ ] Final branch-head CI evidence linked here
- [ ] Verified testnet deployment evidence, if supported and available
- [ ] Initial demo link or video no longer than 3 minutes
- [ ] Check-in submission entered on DoraHacks

