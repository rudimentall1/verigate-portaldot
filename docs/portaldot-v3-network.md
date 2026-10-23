# PortalDot V3 testnet configuration

## Network parameters reported by the project

| Setting | Value |
|---|---|
| EVM RPC | `https://test-evm-rpc-v3.portaldot.dev` |
| EVM chain ID | `420420777` (`0x190f1ca9`) |
| Substrate RPC | `wss://test-node-v3.portaldot.dev` |
| Node Console | https://node-console.portaldot.dev/ |
| Native symbol | POT; UI may show tPOT/tPOTv3 |
| Reported Substrate native precision | 14 decimals |
| EVM native `value` precision | 18 decimal places |
| Officially announced testnet explorer | https://scanner-testnet-v3.portaldot.dev/ (announced 23 October 2026; EVM receipt/deep-link behavior not independently checked) |
| Officially announced V3 mainnet explorer | https://scanner-live-v3.portaldot.dev/ (network-endpoints notice supplied 23 October 2026; rollout announced for 23 October at 23:00 UTC) |
| Mainnet EVM RPC / chain ID | Not confirmed by this project; do not infer these from the explorer URL or reuse testnet settings |

## Mainnet V3.0 rollout watch — network-endpoints notice supplied 23 October 2026

The supplied PortalDot V3.0 network-endpoints notice schedules rollout for **23 October 2026 at 23:00 UTC** (24 October at 01:00 in Europe/Berlin). The notice lists the following surfaces:

**Mainnet**
- Node Console: https://node-console.portaldot.dev/
- Block explorer: https://scanner-live-v3.portaldot.dev/
- Cross-chain bridge: https://bridge.portaldot.dev/
- Mobile wallet: the notice says an update release is expected; no release URL or build/version is provided.

**Testnet**
- Substrate node endpoint: `wss://test-node-v3.portaldot.dev`
- EVM-compatible RPC: `https://test-evm-rpc-v3.portaldot.dev`
- Block explorer: https://scanner-testnet-v3.portaldot.dev/

The announced testnet EVM RPC and Substrate WSS match the project's existing testnet configuration. The notice supplies **no Mainnet EVM RPC URL, EVM chain ID, or Mainnet Substrate WebSocket endpoint**. Mainnet explorer availability must not be treated as proof of EVM RPC parameters. The repo's read-only testnet health check passed earlier on 23 October, before the announced rollout; that result does not prove endpoint continuity or runtime identity after the rollout. The project's DApp links to both V3 explorers for navigation only; it does not claim that either explorer indexes all EVM transactions or retains all historical receipts.

**Do not switch the deployment configuration to Mainnet merely because the mainnet explorer is available.** This announcement, as pasted, does not supply a mainnet EVM RPC URL or EVM chain ID, and the existing V2 contract/transfer evidence is testnet-only. Before considering mainnet work, independently confirm the mainnet EVM RPC, chain ID, Substrate genesis/runtime identity, deployment cost and contract semantics. Do not reuse testnet addresses or signing configuration as mainnet deployment evidence, and do not redeploy the testnet guard to recreate an RPC-pruned historical receipt.

## Live Substrate runtime inspection

On 19 October 2026, the read-only Substrate endpoint returned chain name `PortaldotV3 Test`, node version `3.0.0-dev-fddd43141f2`, `specName=portaldot-v3`, `specVersion=3002`, and `transactionVersion=2`. The runtime's decoded metadata and constants returned:

| Item | Live-reported result |
|---|---|
| `Revive.ChainId` | `420420777` |
| `Revive.NativeToEthRatio` | `10000` |
| `Revive.AutoMap` | `true` |
| `Revive.AllowEVMBytecode` | `true` |
| `Revive.GasScale` | `5` |
| `Revive.CodeHashLockupDepositPercent` | `300000000` (30% on a Perbill scale) |
| `Revive.OriginalAccount` | map from a 20-byte H160 key to an `AccountId32` value |
| `Revive.AddressSuffix` | Not present in this runtime's `Revive` pallet |
| `Revive.DepositPerByte` | `6000000000000` native raw units |
| `Revive.DepositPerItem` | `15000000000000` native raw units |
| `Revive.DepositPerChildTrieItem` | `150000000000` native raw units |

With a 14-decimal native denomination, the three observed deposit constants correspond to 0.06 POT per byte, 0.15 POT per storage item, and 0.0015 POT per child-trie item. These constants are evidence from one endpoint's reported runtime metadata; they are not, alone, a complete deployment-cost calculation or cryptographic network authentication.

The raw metadata was 561,916 bytes and its returned SHA-256 varied between inspection runs despite the same reported `specVersion=3002`; consequently, the project does not pin that raw metadata digest as a trusted identity anchor. A sanitized snapshot from the read-only probe is versioned in [evidence/portaldot-v3-runtime-2026-10-19.json](../evidence/portaldot-v3-runtime-2026-10-19.json); it contains only the fixed synthetic H160 query, not a user account pair.

## Provenance

The [Allowance V3 testnet field guide](https://github.com/Oziman13/allowance/blob/main/docs/SOLIDITY-ON-PORTALDOT-V3.md) attributes the EVM RPC, chain ID, Substrate endpoint and Node Console to PortalDot Discord `#dev-announcement` dated 16 October 2026. Its [network configuration](https://github.com/Oziman13/allowance/blob/main/config/networks.json) lists the same reported endpoints. The public [PortalDot developer Chain Info page](https://portaldot-dev.readthedocs.io/en/latest/chain-info.html) describes Substrate mainnet separately and should not be substituted for V3 EVM settings.

The project's GitHub Actions metadata probe uses the advertised Substrate WebSocket endpoint and only reads chain/node information, finalized head/genesis hash, runtime version, runtime metadata, storage definitions and named constants. The one-key verifier uses polkadot-cli 1.25.0 and pins `Revive.OriginalAccount[H160]` to the finalized block hash returned by the runtime inspector. The synthetic query completed successfully at block 100714: [workflow](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39225053317), [artifact](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39225053317/artifacts/12172714887). Automated CI queries only a synthetic H160 and does not log a user's account pair.

## Amount units and account mapping

- Substrate POT is reported as 14 decimals (`10^14` raw native units per POT).
- EVM `value` uses 18-decimal units. The live-reported `Revive.NativeToEthRatio=10000` is consistent with the `10^4` conversion between those raw representations.
- The live runtime exposes `Revive.OriginalAccount`, keyed by 20-byte H160 and valued by `AccountId32`. The storage definition describes it as the reverse mapping from Ethereum address to the original Substrate account. `Revive.AutoMap=true` means this runtime reports automatic mapping enabled; it does **not** tell us the stored value for an arbitrary H160.
- The generic [Polkadot CLI documentation](https://paritytech.github.io/polkadot-cli/) describes current upstream H160/AccountId32 conversion. Such offline derivations are useful cross-checks, not replacements for this live storage value; runtime versions and wallet derivation paths can differ.
- Use the local-only one-key check, `npm run verify:account-mapping -- <candidate-H160> <registered-SS58>`, to query `Revive.OriginalAccount` without publishing the wallet pair to CI. The command uses a temporary Polkadot CLI home and does not submit transactions. See [funding and account mapping](funding-and-account-mapping.md).

## Read-only deployment estimate

Current upstream `pallet-revive` documentation specifies that Ethereum-facing `eth_estimateGas` includes execution resource requirements **and storage deposits**; the returned estimate is intended to be sufficient for both. It also describes `GasScale` as scaling `eth_gasPrice` and the gas estimate in opposite directions, leaving the total `estimateGas × gasPrice` approximately unchanged except for rounding. See the [Polkadot Hub gas model](https://docs.polkadot.com/smart-contracts/for-eth-devs/gas-model/) and [upstream GasScale semantics](https://paritytech.github.io/polkadot-sdk/master/pallet_revive/pallet/trait.Config.html#tymethod.GasScale).

PortalDot V3 reports the same runtime constants, but a single RPC response does not prove full upstream RPC conformance. Use the direct estimate as the primary budget signal; do not multiply the result by `GasScale` again or add the listed per-byte deposit a second time without evidence that the endpoint omitted it. Reconcile the quote with a fresh optimized-bytecode estimate and the current runtime response before deployment.

This repository provides a read-only estimator:

```bash
# In local .env set AUTHORITY_SIGNER_ADDRESS and DEPLOYMENT_ESTIMATE_FROM
npm run estimate:deployment
```

It compiles the current contract, builds constructor init code, and calls `eth_estimateGas`, `eth_gasPrice`, and `eth_getBalance`. It includes a 20% safety margin and never signs or broadcasts. Rerun immediately before any explicitly authorized deployment with the actual authority signer and independently verified deployer H160. Runtime deposit constants may account for part of the unusually large estimate, but the prior preliminary quote has not yet been reconciled into a verified fee/deposit breakdown.

## Mandatory Substrate genesis pin

On 19 October 2026, the PortalDot team replied in the Hacker House Discord thread: “Hello, this information is all correct” in response to the project's request to confirm the V3 testnet endpoints, EVM chain ID, and Substrate genesis hash. The confirmed values are recorded in `.env.example`: `PORTALDOT_SUBSTRATE_RPC_URL=wss://test-node-v3.portaldot.dev`, `PORTALDOT_SUBSTRATE_GENESIS_HASH=0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd`, `PORTALDOT_RPC_URL=https://test-evm-rpc-v3.portaldot.dev`, and `PORTALDOT_CHAIN_ID=420420777`. The team confirmation supports pinning these parameters for the project. The Substrate genesis hash is not an EVM block hash; the EVM chain ID is checked separately. A malicious or compromised endpoint can still lie about balances and storage responses, so this pin is a network-configuration guard, not complete cryptographic authentication of every RPC response.

## Evidence limitations

RPC health checks establish that endpoints responded and reported certain values at check time; they do not prove a live contract deployment, wallet ownership, or deployment budget. There is no dedicated EVM explorer listed in the field guide. Preserve transaction receipts, block numbers, addresses and runtime-code hashes only after an authorized live deployment is independently verified.
