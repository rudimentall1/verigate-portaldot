# Hacker House check-in status

Updated: 19 October 2026

The public event listing gives the check-in deadline as 24 October 2026, 20:00 UTC+8 (12:00 UTC, or 14:00 in Frankfurt). It lists the final submission/code-freeze deadline as 6 November, 12:00 UTC+8 (04:00 UTC). A recently indexed copy of a post from the official @PortaldotL0 account reports schedule changes for later activities: Office Hour applications by 27 October, 12:00 UTC; Office Hours on 28–29 October; Live Demo Day on 8–9 November; community voting from 9 November, 16:00 UTC to 10 November, 16:00 UTC; winners announced 11 November. The reported update does not mention changing the check-in deadline. Reconfirm both deadlines in the official [DoraHacks listing](https://dorahacks.io/hackathon/2362/detail) and [PortalDot Discord](https://discord.gg/portaldot) before submitting.

## Current progress

- Public repository: https://github.com/rudimentall1/verigate-portaldot
- Core contract: `PortalDotAgentGuard` accepts only EIP-712-authorized native-token transfers and has no generic arbitrary-call method.
- Bridge: checks the signed Verigate decision and execution authorization, binds the action to the exact recipient and base-unit amount, and creates an EIP-712 signature for an ALLOW decision only.
- Verification: code revision `ccf96f356c4e29bc60d0e0de1931a12fb3a95824` passes [108 tests and Solidity compilation](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39201987993). The latest [PortalDot CI](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39201987956), [read-only RPC health](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39201987958), and [dependency security audit](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39201991674) also pass. Preflight and direct deployment require a configured genesis hash matching the read-only block-0 response; bridge signing enforces the same pin as well as chain ID, guard runtime-code hash, and `authoritySigner()`. The pin must be independently confirmed with PortalDot; a remote RPC can still lie about its responses.
- Local integration exercise: CI starts a disposable Verigate API and loopback Hardhat EVM, deploys the actual guard source to that simulator, confirms code hash and signer identity, signs EIP-712 only for ALLOW, and refuses BLOCK. No public PortalDot RPC or transaction is used.
- Architecture and security boundary: [docs/architecture.md](architecture.md).
- Video plan: [three-minute demo script](demo-script.md); clearly labels the local integration as a dry run, not a PortalDot deployment.

## Remaining before check-in

1. Obtain a canonical official announcement URL or direct PortalDot confirmation for the reported V3 EVM RPC, chain ID, and genesis block hash. Set `PORTALDOT_GENESIS_HASH` only from an independently trusted source; preflight, direct deployment, and bridge signing now fail closed when the pin is missing or mismatched. A matching hash from the same untrusted RPC is not independent authentication.
2. Confirm native-token denomination and native/EVM wallet mapping with the team before using testnet funds.
3. Deploy the guard only after the target chain is confirmed. Record the contract address, deployment transaction hash, block number, timestamp and explorer link where available.
4. Record the [three-minute ALLOW/BLOCK demo](demo-script.md). Use the CI evidence artifact for the reproducible local integration; clearly state that it does not demonstrate a live transaction.
5. Publish a compact progress summary and open issues on DoraHacks. Keep development commits and test results public.

## Honest current limitations

- No live PortalDot deployment is claimed.
- `.env.example` records the reported `https://test-evm-rpc-v3.portaldot.dev` endpoint and chain ID `420420777`, but the canonical announcement URL is not recorded in the repository and I could not independently reconfirm those exact values in the published developer docs during this review. Confirm these details with PortalDot before deployment or spending test funds.
- The CLI outputs a signed authorization JSON but does not submit a transaction. It requires a pinned runtime-code hash and independently confirmed genesis hash; these guardrails catch missing or inconsistent configuration but do not prove that a malicious RPC is honest.
- The guard and end-to-end signing flow are tested on local Hardhat only; local tests do not establish that PortalDot V3 EVM is reachable or that any live deployment exists.

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
