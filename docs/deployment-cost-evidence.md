# Read-only PortalDot V3 deployment estimate

**Observed:** 2026-10-19 06:54 UTC  
**Workflow evidence:** https://github.com/rudimentall1/verigate-portaldot/actions/runs/39212571573  
**Network response:** configured PortalDot V3 RPC reported chain ID `420420777`  
**Operation:** read-only `eth_estimateGas`, `eth_gasPrice`, and `eth_getBalance`; no signing and no transaction broadcast.

## Result

| Field | Observed value |
|---|---:|
| Contract | `PortalDotAgentGuard` |
| Compiled creation bytecode | 2,363 bytes |
| `eth_estimateGas` result | 4,724,145,944,260,813 |
| `eth_gasPrice` | 38,975 wei |
| Calculated deployment cost | 184.123588 POT |
| Budget check with 20% margin | 220.948305 POT |
| EVM balance at quote time | 0.900000 POT |
| Shortfall to the 20% margin budget | 220.048305 POT |
| Result | **Insufficient balance** |

The estimator used its explicitly labelled placeholder authority signer (`0x0000000000000000000000000000000000000001`) because a final `AUTHORITY_SIGNER_ADDRESS` had not been selected. The placeholder is only for a preliminary quote and must not be used for deployment. The constructor argument is fixed-width, but the estimate must be re-run with the actual dedicated authority signer before deployment.

## Interpreting the unusually large estimate

A PortalDot V3 field guide linked from `docs/portaldot-v3-network.md` reports an indicative code-storage deposit around 0.08 POT per byte plus a base cost around 18 POT. Applying that *rough reference only* to 2,363 bytes gives:

- Indicative deposit component: 2,363 × 0.08 = 189.04 POT
- Plus indicative base cost: about 18 POT
- Rough guide-derived total: about 207.04 POT

That rough total is in the same order of magnitude as the RPC-derived 184.123588 POT, so the large estimate is not, by itself, evidence of an RPC bug. The figures do not match exactly and must not be treated as a fee formula for this contract. The guide describes another sample, and actual costs may depend on optimized deployed code size, runtime parameters, gas accounting, storage deposits, and chain state. In particular, creation bytecode size is not necessarily the exact stored runtime-code size used to calculate a deposit.

Treat the RPC value as a preliminary live quote, not a permanent price guarantee or independent proof that the RPC is trustworthy. The configured genesis-hash pin was unset in this run. Re-run the estimate against the final compiled artifact, with the real dedicated authority signer and a verified deployer address, before any explicitly authorized deployment.

## Decision

Do **not** deploy with the observed 0.9 POT balance. The quote reported a requirement of 220.948305 POT including the project's 20% margin, with a shortfall of approximately 220.048305 POT at the time of measurement. This is the reported EVM-account shortfall, **not** a safe instruction for how much to transfer from Substrate: the earlier small transfer's 1 tPOT-to-0.9 POT difference has not been independently reconciled, and the registered SS58 account's mapping to the candidate H160 remains unverified. Do not fund a derived fallback address based only on offline address conversion.

A real deployment also requires a dedicated non-zero `AUTHORITY_SIGNER_ADDRESS` that differs from the deployer, and local configuration of the deployer key. Private keys must never be committed or shared in chat. Verify the live runtime's account mapping and token denomination, then re-run the read-only estimate with the selected authority signer and current balance immediately before any explicitly authorized deployment.
