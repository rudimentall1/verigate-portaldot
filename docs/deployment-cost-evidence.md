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

PortalDot V3's estimate may account for code-storage deposit as well as ordinary transaction execution. Treat this as a live, preliminary requirement reported by the current RPC, not as a permanent price guarantee or an independent cryptographic proof that the RPC is trustworthy. The configured genesis-hash pin was unset in this run. Gas price, chain state, bytecode, signer, and runtime rules can change the result.

## Decision

Do **not** deploy with the observed 0.9 POT balance. The estimate requires at least 220.948305 POT in the EVM account to meet the project's 20% margin, a shortfall of approximately 220.048306 POT at the time of measurement. This figure is the EVM-account shortfall, not a safe instruction for how much to transfer from Substrate: the earlier small transfer's 1 tPOT-to-0.9 POT difference has not been independently reconciled. Verify the transfer accounting before sending a larger amount.

A real deployment also requires a dedicated non-zero `AUTHORITY_SIGNER_ADDRESS` that differs from the deployer, and local configuration of the deployer key. Private keys must never be committed or shared in chat. Re-run the read-only estimate with the selected authority signer and current balance immediately before any explicitly authorized deployment.
