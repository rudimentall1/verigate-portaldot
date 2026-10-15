# Hacker House check-in status

Updated: 15 October 2026

The public event listing gives the check-in deadline as 24 October, 20:00 UTC+8 (12:00 UTC). Confirm the live deadline and any changes on the official DoraHacks page or PortalDot Discord before submission.

## Current progress

- Public repository: https://github.com/rudimentall1/verigate-portaldot
- Core contract: `PortalDotAgentGuard` accepts only EIP-712-authorized native-token transfers and has no generic arbitrary-call method.
- Bridge: checks the signed Verigate decision and execution authorization, binds the action to the exact recipient and base-unit amount, and creates an EIP-712 signature for an ALLOW decision only.
- Verification: GitHub Actions passed contract and bridge tests plus Solidity compilation. The latest source-validation run is [unit tests](https://github.com/rudimentall1/verigate-portaldot/actions/runs/38679693720); the [PortalDot CI run](https://github.com/rudimentall1/verigate-portaldot/actions/runs/38679693695) also passed the isolated Verigate integration job.
- Local integration exercise: CI starts a disposable Verigate API, verifies genuine signed ALLOW/BLOCK artifacts through HTTP routes, creates an EIP-712 dry-run signature for ALLOW only, refuses BLOCK, and broadcasts no transaction.
- Architecture and security boundary: [docs/architecture.md](architecture.md).

## Remaining before check-in

1. Confirm the supported PortalDot V3 EVM testnet RPC, chain ID, native-token value denomination and address mapping with an authoritative PortalDot source or mentor.
2. Run the RPC preflight against that confirmed network. Do not deploy with the current assumed endpoint or chain ID.
3. Deploy the guard only after the target chain is confirmed. Record the contract address, deployment transaction hash, block number, timestamp and explorer link where available.
4. Capture a short demo of the core ALLOW and BLOCK flow. Keep a dry-run demo clearly labeled if a live deployment remains blocked.
5. Publish a compact progress summary and open issues on DoraHacks. Keep development commits and test results public.

## Honest current limitations

- No live PortalDot deployment is claimed.
- The configured default RPC and chain ID `420420777` remain unverified assumptions.
- The CLI outputs a signed authorization JSON but does not submit a transaction.
- The contract code is tested on local Hardhat only; local tests do not establish that PortalDot V3 EVM is reachable or behaves the same way.

## Submission checklist

- [x] Public GitHub repository
- [x] README with run instructions and explicit limitations
- [x] Architecture diagram and trust-boundary notes
- [x] Development commits during the build period
- [x] Local contract and bridge tests plus CI evidence
- [ ] Confirmed PortalDot testnet details
- [ ] Verified testnet deployment evidence, if supported and available
- [ ] Initial demo link or video no longer than 3 minutes
- [ ] Check-in submission entered on DoraHacks

The public event listing asks for current progress, outstanding items, repository, README, development records, architecture diagram, testnet deployment details and an initial demo. The event organizer's current page and Discord announcements take precedence if dates or requirements change.
