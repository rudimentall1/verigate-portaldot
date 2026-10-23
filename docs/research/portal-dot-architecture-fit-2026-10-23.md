# PortalDot Architecture Fit: Integration Hypothesis

Updated: 2026-10-23

## Decision

Do not expand the EVM Guard or build another explorer feature yet. The strongest next integration hypothesis is a **Substrate-native Verigate execution adapter** that authorizes the exact runtime call before a signer can submit it, then binds the resulting extrinsic outcome to portable Verigate evidence.

This is a research-backed hypothesis, not a claim that PortalDot's team has requested or endorsed it.

## What the public architecture indicates

- The public PortalDot developer documentation describes a Substrate-style runtime, runtime APIs, SCALE extrinsics, storage queries, transaction-payment APIs, multisig, proxy, and ink! contracts through `pallet-contracts`.
- The PortalDot testnet integration in this repository proves a different surface: an EVM-compatible endpoint, Solidity Guard, EIP-712 authority signature, and native-value transfer through that guard. This remains useful evidence for the EVM surface, but it does not prove enforcement over native Substrate extrinsics.
- The public PortalPilot project independently targets the Substrate surface and implements reads, fee estimation, `system.dryRun`, and explicit confirmation before writes. Rebuilding its explorer or fee-preview feature would duplicate existing work rather than differentiate Verigate.
- GRAM Explorer's published terms state that it is read-only and relies on indexed/cached data that may be delayed, incomplete, or wrong. The relevant design lesson is evidence provenance and honest freshness semantics, not copying a TON-specific explorer.

## Candidate fit

| Candidate | Fit | Decision |
|---|---|---|
| Another EVM Guard feature | Only protects calls routed through the EVM contract; does not cover native Substrate extrinsics | Defer |
| Another explorer / transaction lookup | Overlaps with existing read-only lookup and community explorer work | Defer |
| Substrate-native authority adapter | Complements runtime simulation and fee estimation with exact-action authority, policy enforcement, and portable proof | Investigate first |
| Indexer / freshness monitor | Potentially useful, but requires evidence of a concrete PortalDot indexing or RPC pain point | Keep as follow-up hypothesis |

## Proposed vertical slice

One native POT transfer, with no custody by Verigate:

1. Parse a native transfer intent into a canonical typed action: genesis/spec identity, pallet + call, sender identity, destination SS58 account, exact base-unit amount, nonce, and mortality/era.
2. Query runtime metadata and reject unsupported or ambiguous call encodings. Never infer H160-to-SS58 identity mapping.
3. Run runtime dry-run and fee estimation where the target node supports them; bind the simulation result and fee ceiling to the intent. Simulation is advisory state, not authorization.
4. Ask Verigate for authority over that exact canonical action. Any change to destination, amount, call, chain identity, or nonce invalidates the authorization.
5. Enforce at the signing/submission boundary: a denied or stale authorization must not call the signer or submit the extrinsic. Verigate does not hold the user's private key.
6. For an allowed action, observe the finalized extrinsic and relevant events, then emit a portable evidence bundle linking the original intent, policy decision, authorization, extrinsic hash, block hash, runtime identity, fee observation, and outcome.
7. Provide an independent verifier and adversarial tests for destination/amount mutation, stale authorization, wrong genesis/runtime identity, replay, dry-run failure, fee ceiling breach, and ambiguous submission outcome.

## Acceptance criteria

The slice is not complete until all are true:

- A local Substrate-compatible test fixture proves an allowed native transfer reaches submission and yields a finalized receipt.
- A destination mutation and an amount mutation are denied before signing/submission.
- A denied path records zero signer calls and zero submitted extrinsics.
- Replayed, expired, or chain-mismatched authorization fails closed.
- Evidence can be verified offline without querying the Verigate service.
- RPC timeout, stale indexer data, null receipt, and ambiguous submission are represented as unavailable/unknown rather than proof that an action did not happen.
- Test output distinguishes local integration evidence from public PortalDot testnet evidence.

## Key risks / unknowns

- Confirm the exact PortalDot V3 native RPC surface and runtime metadata before choosing libraries or encoding calls.
- The official GitHub repository `Portaldot/Portaldot` currently has no source files, so it cannot establish the current runtime implementation by itself.
- The EVM-compatible testnet and native Substrate surface may have different identity, fee, and execution semantics. Treat them as separate adapters until equivalence is demonstrated.
- No evidence currently establishes that PortalDot's team has adopted Verigate, that this adapter is requested, or that the public EVM guard protects native wallet activity.

## Sources reviewed

- PortalDot developer docs: https://portaldot-dev.readthedocs.io/en/latest/
- PortalDot runtime API docs: https://portaldot-dev.readthedocs.io/en/latest/python-sdk/usage/call-runtime-apis.html
- PortalDot chain info (POT decimals and SS58 format): https://portaldot-dev.readthedocs.io/en/latest/chain-info.html
- PortalPilot repository: https://github.com/ismailridwans/portalpilot
- GRAM Explorer terms: https://gram.org/terms
- GRAM Explorer privacy/data-source description: https://gram.org/privacy
- Existing Verigate × PortalDot implementation and evidence: https://github.com/rudimentall1/verigate-portaldot
- Verigate authority protocol: https://github.com/rudimentall1/verigate
