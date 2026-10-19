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
| EVM explorer | No dedicated EVM explorer was listed in the field guide |

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

The raw metadata was 561,916 bytes and its returned SHA-256 varied between inspection runs despite the same reported `specVersion=3002`; consequently, the project does not pin that raw metadata digest or the endpoint-reported genesis hash as a trusted identity anchor. Record the runtime version and finalized block from the time of each inspection instead.

## Provenance

The [Allowance V3 testnet field guide](https://github.com/Oziman13/allowance/blob/main/docs/SOLIDITY-ON-PORTALDOT-V3.md) attributes the EVM RPC, chain ID, Substrate endpoint and Node Console to PortalDot Discord `#dev-announcement` dated 16 October 2026. Its [network configuration](https://github.com/Oziman13/allowance/blob/main/config/networks.json) lists the same reported endpoints. The public [PortalDot developer Chain Info page](https://portaldot-dev.readthedocs.io/en/latest/chain-info.html) describes Substrate mainnet separately and should not be substituted for V3 EVM settings.

The project's GitHub Actions metadata probe uses the advertised Substrate WebSocket endpoint and only reads chain/node information, finalized head/genesis hash, runtime version, runtime metadata, the storage definition, and named runtime constants. It never submits an extrinsic. The account-mapping verifier queries one requested H160 key and compares the returned AccountId32 locally; automated CI only queries a synthetic H160 and does not log a user's account pair.

## Amount units and account mapping

- Substrate POT is reported as 14 decimals (`10^14` raw native units per POT).
- EVM `value` uses 18-decimal units. The live-reported `Revive.NativeToEthRatio=10000` is consistent with the `10^4` conversion between those raw representations.
- The live runtime exposes `Revive.OriginalAccount`, keyed by 20-byte H160 and valued by `AccountId32`. The storage definition describes it as the reverse mapping from Ethereum address to the original Substrate account. `Revive.AutoMap=true` means this runtime reports automatic mapping enabled; it does **not** tell us the stored value for an arbitrary H160.
- The generic [Polkadot CLI documentation](https://paritytech.github.io/polkadot-cli/) describes current upstream H160/AccountId32 conversion. Such offline derivations are useful cross-checks, not replacements for this live storage value; runtime versions and wallet derivation paths can differ.
- Use the local-only one-key check, `npm run verify:account-mapping -- <candidate-H160> <registered-SS58>`, to query `Revive.OriginalAccount` without publishing the wallet pair to CI. The command uses a temporary Polkadot CLI home and does not submit transactions. See [funding and account mapping](funding-and-account-mapping.md).

## Read-only deployment estimate

This repository provides a read-only estimator:

```bash
# In local .env set AUTHORITY_SIGNER_ADDRESS and DEPLOYMENT_ESTIMATE_FROM
npm run estimate:deployment
```

It compiles the current contract, builds constructor init code, and calls `eth_estimateGas`, `eth_gasPrice`, and `eth_getBalance`. It includes a 20% safety margin and never signs or broadcasts. Rerun immediately before any explicitly authorized deployment with the actual authority signer and independently verified deployer H160. Runtime deposit constants may account for part of the unusually large estimate, but the prior preliminary quote has not yet been reconciled into a verified fee/deposit breakdown.

## Optional genesis hash pin

`PORTALDOT_GENESIS_HASH` is optional additional protection. The Substrate endpoint reported genesis hash `0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd` during inspection, but that response has not been independently authenticated. Do not hard-code it as a trust pin without independent confirmation. An untrusted RPC can lie about its own genesis hash, chain ID, balance and storage responses.

## Evidence limitations

RPC health checks establish that endpoints responded and reported certain values at check time; they do not prove a live contract deployment, wallet ownership, or deployment budget. There is no dedicated EVM explorer listed in the field guide. Preserve transaction receipts, block numbers, addresses and runtime-code hashes only after an authorized live deployment is independently verified.
