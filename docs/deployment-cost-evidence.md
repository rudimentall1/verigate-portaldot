# Read-only PortalDot V3 deployment estimate

**Observed:** 19 October 2026, 06:54 UTC  
**Workflow evidence:** https://github.com/rudimentall1/verigate-portaldot/actions/runs/39212571573  
**Operation:** read-only `eth_estimateGas`, `eth_gasPrice`, and `eth_getBalance`; no signing and no transaction broadcast.  
**Important:** the quote used a placeholder authority signer, and the deployer-to-Substrate account relationship had not been reconciled. It is preliminary evidence only.

## Result

| Field | Observed value |
|---|---:|
| Contract | `PortalDotAgentGuard` |
| Compiled creation bytecode | 2,363 bytes |
| `eth_estimateGas` result | 4,724,145,944,260,813 |
| `eth_gasPrice` | 38,975 wei |
| Calculated `estimateGas × gasPrice` | 184.123588 POT |
| Budget check with 20% margin | 220.948305 POT |
| EVM balance reported for the candidate H160 | 0.900000 POT |
| Shortfall to the 20% margin budget | 220.048305 POT |
| Result | **Insufficient balance** |

The estimator used `0x0000000000000000000000000000000000000001` as a clearly labelled placeholder authority signer. It is not a valid deployment configuration; the estimate must be re-run with the real dedicated authority signer and verified deployer address immediately before any deployment.

## Live Revive runtime configuration subsequently observed

A separate read-only Substrate metadata probe on 19 October 2026 reported `specName=portaldot-v3`, `specVersion=3002`, `transactionVersion=2`, `Revive.ChainId=420420777`, `Revive.NativeToEthRatio=10000`, `Revive.AutoMap=true`, `Revive.GasScale=5`, and `Revive.CodeHashLockupDepositPercent=300000000` (30% Perbill). The decoded `Revive.OriginalAccount` storage is a map keyed by 20-byte H160 with `AccountId32` values; `Revive.AddressSuffix` is not present in this runtime.

The observed native-token storage constants were:

| Constant | Raw native units | Approximate value if native precision is 14 decimals |
|---|---:|---:|
| `DepositPerByte` | 6,000,000,000,000 | 0.06 POT per byte |
| `DepositPerItem` | 15,000,000,000,000 | 0.15 POT per storage item |
| `DepositPerChildTrieItem` | 150,000,000,000 | 0.0015 POT per child-trie item |

Those are runtime constants, not a full per-contract quote. The earlier community field-guide approximation of about 0.08 POT per byte plus a base cost around 18 POT does not match the observed `DepositPerByte` value for this runtime; do not use that guide estimate as the active fee formula.

## Interpreting the quote

The 184.123588 POT figure is the direct result of multiplying the endpoint's `eth_estimateGas` response by `eth_gasPrice` and formatting the result as 18-decimal EVM POT. It is not an independently verified breakdown of transaction fees, code deposits, code-hash lockup, storage items, or other runtime charges. The runtime constants above help explain why ordinary Ethereum gas intuition is insufficient, but they do not by themselves reconcile every part of the earlier estimate.

In particular:

- Creation bytecode size is not necessarily the byte length charged by the runtime for stored deployed code.
- The previous estimate used a placeholder constructor signer and an unverified candidate H160.
- The runtime reports `GasScale=5`. Current upstream `pallet-revive` documentation explains that `GasScale` scales the gas price and gas estimate in opposite directions, so the total gas cost normally cancels out apart from rounding. Do not multiply the observed `estimateGas × gasPrice` total by five again. See [upstream GasScale documentation](https://paritytech.github.io/polkadot-sdk/master/pallet_revive/pallet/trait.Config.html#tymethod.GasScale).
- A quote from one RPC endpoint is neither a permanent price guarantee nor independent authentication of that endpoint.

## Decision

Do **not** deploy using the observed 0.9 POT balance or transfer the reported 220.048305 POT shortfall as a funding instruction. The SS58-to-H160 mapping for the chosen deployer must first be verified from the live `Revive.OriginalAccount[H160]` state or independently confirmed with PortalDot.

Before any explicitly authorized deployment, re-run the estimate against the actual optimized contract, with the real authority signer and the selected public deployer H160. Confirm the RPC/network identity, storage-deposit semantics, current balance and fee budget first. The estimator never signs or broadcasts a transaction.
