# Hacker House check-in status

Updated: 19 October 2026

The public event listing gives the check-in deadline as 24 October 2026, 20:00 UTC+8 (12:00 UTC, or 14:00 in Frankfurt). It lists the final submission/code-freeze deadline as 6 November 2026, 12:00 UTC+8 (04:00 UTC). Reconfirm current requirements and deadlines on the [official DoraHacks listing](https://dorahacks.io/hackathon/2362/detail) and [PortalDot Discord](https://discord.gg/portaldot).

## Current progress

- Public repository: https://github.com/rudimentall1/verigate-portaldot
- Core contract: PortalDotAgentGuard accepts only EIP-712-authorized native-token transfers and has no generic arbitrary-call interface.
- Bridge: verifies both Ed25519 artifacts against a locally pinned issuer key, checks the action and exact base-unit amount, and creates a short-lived EIP-712 authorization only for a genuine Verigate ALLOW.
- Guarded executor: simulation is the default. Explicit --broadcast is required to submit the exact transfer, after validating the EIP-712 signer/domain, canonical signature encoding, live guard code hash, authority signer, deadline, guard funds and relayer fee budget.
- Address diagnosis: an offline SS58-to-H160 inspector was added. It validates SS58 checksum, extracts AccountId32 and calculates the current upstream pallet-revive H160 derivation. It explicitly does not claim the PortalDot V3 runtime mapping is confirmed. The funding guide now references current upstream documentation describing AddressSuffix as a candidate stateful mapping entry and instructs the user to inspect the deployed runtime metadata rather than assuming OriginalAccount exists.
- Full local end-to-end exercise: the CI harness submits ALLOW and BLOCK through a disposable Verigate API, verifies signatures, signs only ALLOW, proves the dry run leaves guard funds unchanged, then executes ALLOW against the actual guard contract on a temporary loopback Hardhat EVM. It confirms the transfer event and recipient balance delta exactly equals the authorized amount. BLOCK is refused.
- Passing checks on code revision 976c9ca: [139 tests and Solidity compilation](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39219610484); [PortalDot integration CI](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39219610537); [RPC health](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39219605337); [dependency audit](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39219610495).
- Architecture and trust boundaries: [docs/architecture.md](architecture.md).
- Demo plan: [docs/demo-script.md](demo-script.md).
- DoraHacks text draft: [docs/check-in-submission.md](check-in-submission.md).

## Remaining before check-in

1. Verify the actual PortalDot V3 Substrate runtime metadata and stateful mapping for the registered Substrate account; the WebSocket endpoint could not be reached from this execution environment, so that live state remains unverified.
2. Confirm the actual deployment authority signer and independently verify the intended contract fingerprint.
3. Re-run read-only deployment estimation with the real signer and chosen deployer address. The earlier estimate used a placeholder signer.
4. Deploy only after current network identity, token denomination, account mapping, budget and guard configuration are verified; preserve transaction and receipt evidence after confirmation.
5. Record the demo video and submit the progress summary on DoraHacks.

## Honest current limitations

- No live PortalDot contract deployment is claimed.
- The Substrate RPC mapping has not been read from the live V3 runtime in this environment; offline derivation is not a substitute for that state.
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
- [x] Offline SS58/H160 diagnostic and runtime-mapping verification instructions
- [x] Passing test/compile and integration evidence recorded
- [ ] Live PortalDot runtime mapping independently verified
- [ ] Verified testnet deployment evidence, if supported and available
- [ ] Initial demo link or video no longer than 3 minutes
- [ ] Check-in submission entered on DoraHacks
