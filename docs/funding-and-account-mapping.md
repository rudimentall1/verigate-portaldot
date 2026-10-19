# PortalDot V3 funding and account mapping

## Keep the account types separate

PortalDot V3 exposes a Substrate account interface and an EVM-compatible `pallet-revive` interface. They share the chain, but account identifiers and balance APIs are not interchangeable:

- Substrate wallets show an SS58 address, which encodes a 32-byte `AccountId32` plus an SS58 network prefix and checksum.
- EVM JSON-RPC reads an H160 address balance with `eth_getBalance`.
- The deterministic fallback `AccountId32` for an H160 is formed by appending twelve `0xEE` bytes: `H160 || 0xEE * 12`.
- The current upstream Polkadot CLI documentation describes the forward derivation as follows: if an `AccountId32` ends in twelve `0xEE` bytes, strip the suffix to get H160; otherwise take the last 20 bytes of `keccak256(AccountId32)`. See the [Polkadot CLI account-mapping documentation](https://paritytech.github.io/polkadot-cli/). Legacy runtimes may differ.
- SubWallet can present Substrate and EVM addresses under one Unified Account, but the UI grouping and different HD derivation paths do not prove that those two address strings refer to the same on-chain account mapping.

These formulas are **offline derivation rules**, not proof of PortalDot V3's deployed runtime or stateful mapping. A stateful `pallet-revive.map_account` mapping may be represented in on-chain storage such as `AddressSuffix` in current upstream implementations. The exact storage name and value type must be discovered from the live PortalDot runtime metadata rather than assumed from a different chain/version. The general [Polkadot map-account guide](https://docs.polkadot.com/smart-contracts/for-eth-devs/accounts/) explains that mapping may require an extrinsic and a deposit; this is general SDK guidance, not confirmation of PortalDot V3 configuration.

## Offline diagnostic now in this repository

The repository exposes two separate operations:

- `npm run address:substrate -- 0xYourH160` computes the deterministic fallback SS58 address `H160 || 0xEE * 12`.
- `npm run address:inspect -- <SS58-AccountId32> [candidate-H160]` validates and decodes the SS58 checksum, calculates the H160 using the current upstream offline derivation rules, and optionally compares a candidate H160. It also displays whether the candidate's *fallback* AccountId32 is byte-for-byte the input account.

This diagnostic intentionally always reports `runtimeMappingConfirmed: false`. A mismatch can mean a separate HD-derived EVM key, a stateful runtime mapping, or a different runtime version. It does not prove the account is unusable and does not make any RPC call. It is a way to avoid mistaking an offline fallback account for an on-chain mapping result.

## Read-only runtime mapping verification

First inspect the actual V3 Substrate runtime over its advertised WebSocket endpoint. Do not call `map_account`, submit an extrinsic, or transfer funds during this verification.

With the upstream Polkadot CLI installed:

```bash
dot chain add portaldot-v3 --rpc wss://test-node-v3.portaldot.dev
dot chain update portaldot-v3
dot metadata portaldot-v3
dot portaldot-v3.query.Revive
```

Use the metadata output to confirm whether a `Revive` (or differently named) pallet exists and list its actual storage items. If the current runtime exposes `AddressSuffix`, inspect its exact key and value types using:

```bash
dot portaldot-v3.query.Revive.AddressSuffix --help
```

Then query the candidate H160 using the syntax reported by that live metadata. Record the runtime `specName`, `specVersion`, metadata/runtime fingerprint, queried state/block hash, storage value type, and raw result. Do not assume a missing item or null result alone proves there is no mapping: check for automatic mapping, historical/runtime-version changes, and the exact metadata. If a confirmed reverse mapping is returned, reconstruct/compare the raw 32-byte AccountId32 using the current runtime's defined value semantics, then encode with the right SS58 prefix. This is a read-only investigation plan; this repository's current CI does not query or authenticate that storage.

A useful separate check is to calculate the expected H160 from the registered SS58 public key under the current upstream derivation rule. If it differs from the wallet's displayed EVM address, do not substitute either address in the hackathon form. First determine whether the EVM address is a separate HD-derived secp256k1 key or a runtime-mapped address.

## Incident-specific safety rule

The hackathon account supplied to PortalDot and funded by the team is the user's original Substrate address. Do not replace it in the application, and do not send further test funds to a derived fallback address based only on offline address conversion.

A prior investigation observed a difference between the Substrate wallet's reported transferable balance and the EVM RPC balance of a candidate H160 after a small transfer. That observation alone does **not** prove the original SS58 account is mapped to that H160, nor does it explain the balance difference. The exact transfer extrinsic/transaction, current mapping state and token denomination remain to be reconciled. The project should treat all three as unverified rather than infer a cause.

Before any further funding or deployment:
1. Read the actual PortalDot V3 runtime metadata and inspect the relevant storage if exposed, or get explicit confirmation from the PortalDot team.
2. Establish which H160 corresponds to the registered Substrate account and whether it is mapped/usable as an origin for contract calls.
3. Confirm the native-token denomination and how `eth_getBalance` represents it.
4. Run a read-only deployment estimate using the verified deployer H160 and the real intended authority signer.
5. Only consider a transfer or deployment after the account mapping, token units, estimate and required budget are independently verified.

No additional transfer is a prerequisite for this investigation. Do not treat a generated fallback SS58 address as an alias for the registered account.

## Read-only deployment estimate

The estimator compiles the current contract and requests `eth_estimateGas`, `eth_gasPrice`, and `eth_getBalance`. It never signs or broadcasts. Set `DEPLOYMENT_ESTIMATE_FROM` to the public H160 that is independently verified to pay for deployment. If `AUTHORITY_SIGNER_ADDRESS` has not been selected yet, the estimator may use a clearly labelled non-zero placeholder for a preliminary cost probe. That placeholder is **not** a valid deployment configuration; the real deployment script requires a dedicated, non-zero authority signer different from the deployer.

A previous preliminary quote against a candidate H160 reported 0.9 POT balance and a cost estimate around 184.12 POT (around 220.95 POT with a 20% margin), using a placeholder authority signer. This is not a reliable final budget: the H160 mapping, token denomination, real authority signer, and unusually large gas estimate still need validation. Do not use that quote alone to decide to fund the account.

PortalDot V3 may charge code-storage deposits as well as transaction fees. If the RPC estimate is inconclusive or unexpectedly large, investigate the runtime's gas/weight and deposit semantics rather than treating the number as a normal Ethereum gas estimate. No transaction is sent by the estimator.
