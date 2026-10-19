# Hacker House check-in status

Updated: 19 October 2026

The public event listing gives the check-in deadline as 24 October 2026, 20:00 UTC+8 (12:00 UTC, or 14:00 in Frankfurt). It lists the final submission/code-freeze deadline as 6 November, 12:00 UTC+8 (04:00 UTC). A recently indexed copy of a post from the official @PortaldotL0 account reports schedule changes for later activities: Office Hour applications by 27 October, 12:00 UTC; Office Hours on 28–29 October; Live Demo Day on 8–9 November; community voting from 9 November, 16:00 UTC to 10 November, 16:00 UTC; winners announced 11 November. The reported update does not mention changing the check-in deadline. Reconfirm both deadlines in the official [DoraHacks listing](https://dorahacks.io/hackathon/2362/detail) and [PortalDot Discord](https://discord.gg/portaldot) before submitting.

## Current progress

- Public repository: https://github.com/rudimentall1/verigate-portaldot
- Core contract: `PortalDotAgentGuard` accepts only EIP-712-authorized native-token transfers and has no generic arbitrary-call method.
- Bridge: checks the signed Verigate decision and execution authorization, binds the action to the exact recipient and base-unit amount, and creates an EIP-712 signature for an ALLOW decision only.
- Verification: revision `e55cc2c5261287b3e028e6cb76f9cf3a13e8be5f` passed [117 tests and Solidity compilation](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39203676936). [PortalDot CI](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39203676937) also passes, including read-only deployment estimator and isolated Verigate ALLOW/BLOCK integration. The estimator compares current estimate and balance with a 20% margin without signing or broadcasting; the address-mapping helper has a regression test against the published sample vector.
- Local integration exercise: CI starts a disposable Verigate API and loopback Hardhat EVM, deploys the actual guard source to that simulator, confirms code hash and signer identity, signs EIP-712 only for ALLOW, and refuses BLOCK. No public PortalDot RPC or transaction is used.
- Architecture and security boundary: [docs/architecture.md](architecture.md).
- Video plan: [three-minute demo script](demo-script.md); clearly labels the local integration as a dry run, not a PortalDot deployment.

## Remaining before check-in

1. Network parameters are recorded in [docs/portaldot-v3-network.md](portaldot-v3-network.md): EVM RPC, chain ID, Substrate endpoint, native precision, and account mapping. The genesis hash is an optional extra guard, not a missing parameter from the cited announcement.
2. Estimate this contract's actual deployment storage deposit and gas using its creation bytecode, then compare the total against the deployer's EVM-reported balance. PortalDot V3 charges a code storage deposit that may exceed ordinary gas costs.
3. Deploy the guard only after the target chain is confirmed. Record the contract address, deployment transaction hash, block number, timestamp and explorer link where available.
4. Record the [three-minute ALLOW/BLOCK demo](demo-script.md). Use the CI evidence artifact for the reproducible local integration; clearly state that it does not demonstrate a live transaction.
5. Publish a compact progress summary and open issues on DoraHacks. Keep development commits and test results public.

## Honest current limitations

- No live PortalDot deployment is claimed.
- `.env.example` records the published V3 testnet EVM endpoint and chain ID. Source provenance, the Substrate endpoint, native precision, EVM value units, address mapping, and code-deposit warning are documented in `docs/portaldot-v3-network.md`.
- The CLI outputs a signed authorization JSON but does not submit a transaction. It requires a pinned runtime-code hash. A genesis hash is an optional extra guard when independently sourced; a chain ID and single RPC response do not cryptographically authenticate a potentially malicious RPC.
- The guard and end-to-end signing flow are tested on local Hardhat only; local tests do not establish that PortalDot V3 EVM is reachable or that any live deployment exists.

## Submission checklist

- [x] Public GitHub repository
- [x] README with run instructions and explicit limitations
- [x] Architecture diagram and trust-boundary notes
- [x] Development commits during the build period
- [x] Local contract and bridge tests plus CI evidence
- [x] Published EVM RPC, chain ID, Substrate endpoint and token-unit notes recorded with cited provenance
- [ ] Verified testnet deployment evidence, if supported and available
- [ ] Initial demo link or video no longer than 3 minutes
- [ ] Check-in submission entered on DoraHacks

The public event listing asks for current progress, outstanding items, repository, README, development records, architecture diagram, testnet deployment details and an initial demo. The event organizer's current page and Discord announcements take precedence if dates or requirements change.
