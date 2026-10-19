# PortalDot V3 funding and account mapping

## Runtime details confirmed from the live V3 metadata

On 19 October 2026, a read-only query against `wss://test-node-v3.portaldot.dev` reported `specName=portaldot-v3`, `specVersion=3002`, `transactionVersion=2`. The Polkadot CLI decoded the deployed `Revive` pallet metadata and returned:

| Runtime item | Observed value |
|---|---|
| `Revive.OriginalAccount` storage key | `[u8; 20]` (H160) |
| `Revive.OriginalAccount` stored value | `AccountId32` |
| `Revive.AddressSuffix` | Not present in this runtime's `Revive` pallet |
| `Revive.ChainId` | `420420777` |
| `Revive.NativeToEthRatio` | `10000` |
| `Revive.AutoMap` | `true` |
| `Revive.AllowEVMBytecode` | `true` |
| `Revive.GasScale` | `5` |
| `Revive.CodeHashLockupDepositPercent` | `300000000` (30% on a 1,000,000,000 Perbill scale) |
| `Revive.DepositPerByte` | `6000000000000` native raw units |
| `Revive.DepositPerItem` | `15000000000000` native raw units |
| `Revive.DepositPerChildTrieItem` | `150000000000` native raw units |

The decoded metadata describes `Revive.OriginalAccount` as a map from an Ethereum address to the original Substrate `AccountId32`. It specifically says the reverse mapping exists so the original account can be reconstructed when an H160 is converted back to a native account. `AddressSuffix` is not the storage item to query on this PortalDot V3 runtime.

The runtime-reported `AutoMap=true` agrees with the current upstream [pallet-revive configuration documentation](https://paritytech.github.io/polkadot-sdk/master/pallet_revive/pallet/trait.Config.html): automatic mapping happens when an account is created and is removed when it is killed, replacing explicit `map_account` calls. This is a runtime configuration value, not proof that a particular H160 points to a particular SS58 account. The [Polkadot CLI documentation](https://paritytech.github.io/polkadot-cli/) explains how to inspect storage types and query a single key.

These observations come from one RPC endpoint and are not independent authentication of the network. The runtime's reported genesis hash should remain an observed value, not a pinned trust anchor, until independently confirmed.

## Runtime evidence snapshot

The sanitized read-only snapshot is committed in [evidence/portaldot-v3-runtime-2026-10-19.json](../evidence/portaldot-v3-runtime-2026-10-19.json), including the reported runtime version, Revive.OriginalAccount key/value types and selected runtime constants. The matching [read-only workflow run](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39225053317) and [artifact](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39225053317/artifacts/12172714887) include a structured synthetic-key result pinned to finalized block 100714. It contains no user wallet pair.

## Keep the account types separate

PortalDot V3 exposes a Substrate account interface and an EVM-compatible `pallet-revive` interface. The account identifiers and balance APIs are not interchangeable:

- Substrate wallets show an SS58 address, which encodes a 32-byte `AccountId32` plus an SS58 prefix and checksum.
- EVM JSON-RPC reads an H160 address balance with `eth_getBalance`.
- The deterministic fallback `AccountId32` for an H160 is `H160 || 0xEE * 12`.
- Current upstream Polkadot CLI documentation describes the forward derivation for a typical `AccountId32` as the last 20 bytes of `keccak256(AccountId32)`; if the account ends in twelve `0xEE` bytes, those bytes are stripped instead. This is an offline derivation rule, and other runtime versions or HD-wallet address paths may differ.
- A wallet interface grouping a Substrate and EVM address under one account does not prove that an on-chain `Revive.OriginalAccount` entry connects those two addresses.

This repository implements both offline conversions and explicitly labels them as unconfirmed until the actual runtime storage is queried.

## Offline address diagnostics

- `npm run address:substrate -- 0xYourH160` calculates the deterministic fallback SS58 address `H160 || 0xEE * 12`.
- `npm run address:inspect -- <SS58-AccountId32> [candidate-H160]` validates and decodes the SS58 checksum, calculates the expected H160 under the current upstream derivation, and compares a candidate address without claiming live mapping.
- `npm run verify:account-mapping -- <candidate-H160> <registered-SS58>` checks the actual `Revive.OriginalAccount` value for **one H160 key** using the live Substrate RPC. It validates the expected chain ID and SS58 checksum, compares raw AccountId32 bytes, and prints one of `mapping_matches`, `mapping_points_to_another_account`, or `no_mapping_entry`. It uses a temporary Polkadot CLI home, requires no private keys or seed phrase, and submits no extrinsic or transaction. Add `--redact` to omit both wallet addresses and AccountId32 values from the printed output while preserving the result and finalized-block fingerprint; the RPC still receives the queried H160. Install the CLI version used by the verified probe with `npm install --global polkadot-cli@1.25.0`.

Run the live verifier locally, not in public CI, when the pair being compared is personally identifying. Use `--redact` to keep the address pair out of terminal output and copied reports; the RPC endpoint still receives the H160 needed for the storage lookup. The repository's automated workflow only queries a synthetic H160 and never puts a user's wallet pair into an Actions log or artifact.

A match means the configured endpoint returned an `OriginalAccount` value whose AccountId32 bytes equal the supplied SS58 account. A different value means the H160 resolves to another AccountId32 in that endpoint's reported state. A missing entry means no value was returned for that key. Since a single RPC can lie, treat the result as endpoint-reported evidence and obtain independent PortalDot confirmation before moving funds or deploying.

## Exact manual read-only check

With Polkadot CLI 1.25.0, you can inspect the storage type and query a single key manually at the exact finalized block returned by the read-only runtime inspector:

```bash
npm install --global polkadot-cli@1.25.0
export DOT_HOME="$(mktemp -d)"
dot chain add portaldot-v3 --rpc wss://test-node-v3.portaldot.dev
dot chain update portaldot-v3
dot inspect portaldot-v3.Revive.OriginalAccount
runtime_json="$(npm run --silent inspect:substrate-runtime)"
finalized_hash="$(printf '%s' "$runtime_json" | node -e 'let s=""; process.stdin.on("data", c => s += c).on("end", () => console.log(JSON.parse(s).finalizedHead))')"
dot portaldot-v3.query.Revive.OriginalAccount 0xYourCandidateH160 --output json --at "$finalized_hash"
rm -rf "$DOT_HOME"
```

The `--at` hash pins the single storage read to the finalized head captured immediately beforehand. The repository's verifier performs the same pin automatically and validates the reported runtime name and ChainId first.

Never query the storage map without a key in shared CI; a keyless query may enumerate mapped accounts. The repository's CI probe only queries a fixed synthetic H160 and synthetic SS58 fixture.

## Token units and storage-deposit implications

- `Revive.NativeToEthRatio=10000` confirms the runtime-reported conversion ratio between native-token units and EVM/ETH units. This is consistent with the chain guide's 14-decimal native denomination and 18-decimal EVM `value` denomination, but the human-facing token symbol should still be confirmed before describing a balance as tPOT/POT.
- With the reported 14-decimal native precision, the observed storage constants correspond to 0.06 POT per code byte, 0.15 POT per storage item, and 0.0015 POT per child-trie storage item. These are runtime constants, not a complete deployment quote.
- `Revive.CodeHashLockupDepositPercent=300000000` represents 30% on a Perbill scale. Together with storage deposits and the runtime's gas/weight conversion, this is a reason not to use an Ethereum-style gas-only mental model for PortalDot deployment cost.
- The live `DepositPerByte` value of 0.06 POT differs from the community field guide's indicative 0.08 POT per byte. The runtime metadata is the more relevant observation for this runtime, but it still does not fully calculate a specific contract's deposit.

## Incident-specific safety rule

The hackathon account supplied to PortalDot and funded by the team is the user's original Substrate address. Do not replace it in the application, and do not send further test funds to a derived fallback address based only on offline conversion.

A previous investigation saw a difference between the Substrate wallet's transferable balance and an EVM RPC balance after a small transfer. That observation alone does not establish which H160 corresponds to the funded SS58 account or explain the balance difference. The live storage key/value types and important runtime constants are now known; the specific `OriginalAccount[H160]` entry for the candidate pair still needs to be checked. No additional transfer is a prerequisite for that query.

Before any further funding or deployment:
1. Run the one-key `verify:account-mapping` check locally against the candidate H160 and the registered SS58 account.
2. Independently confirm the reported result and intended EVM endpoint with PortalDot where possible.
3. Confirm the native denomination and compare the relevant EVM-reported balance.
4. Run the read-only deployment estimator with the verified deployer H160 and the real intended authority signer.
5. Only consider funding or deployment after mapping, units, quote and required budget have been reconciled.

## Read-only deployment estimate

Current upstream `pallet-revive` documentation says `eth_estimateGas` must cover the execution resources and the storage deposit required for the call. It also says `GasScale` scales gas price and gas estimation in opposite directions; the product is generally unchanged apart from rounding. See the [Polkadot Hub gas model](https://docs.polkadot.com/smart-contracts/for-eth-devs/gas-model/) and [upstream GasScale documentation](https://paritytech.github.io/polkadot-sdk/master/pallet_revive/pallet/trait.Config.html#tymethod.GasScale).

Treat these as the upstream semantics for comparison, not independent proof that PortalDot's endpoint conforms exactly. Do not multiply `estimateGas × gasPrice` by `GasScale` again or add an estimated per-byte deposit a second time unless a verified PortalDot-specific response establishes that the returned estimate excludes it.

The estimator compiles the current contract and requests `eth_estimateGas`, `eth_gasPrice`, and `eth_getBalance`. It never signs or broadcasts. Set `DEPLOYMENT_ESTIMATE_FROM` to the public H160 that is independently verified to pay for deployment. If `AUTHORITY_SIGNER_ADDRESS` has not been selected yet, the estimator may use a clearly labelled non-zero placeholder for a preliminary cost probe. That placeholder is not a deployment configuration; the real deployment script requires a dedicated, non-zero authority signer different from the deployer.

The earlier quote with the placeholder signer is still preliminary. Do not use it alone to decide to fund an account. Re-run the quote after verifying the account mapping, signer, optimized bytecode and runtime deposit constants.