# PortalDot V3 testnet deployment evidence

Deployment verified on 20 October 2026. This is public testnet evidence, not a production deployment or independent security audit.

## Network

- EVM RPC: https://test-evm-rpc-v3.portaldot.dev
- Chain ID: `420420777`
- Expected Substrate genesis hash: `0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd`

## Deployment

- Contract: `PortalDotAgentGuard`
- Address: `0x3f2f484484fbE6e224d058fDfDB6B5A14F09655b`
- Transaction: `0xb1cf9cca75bb029b0a723f13c398479d2c18704c1138c02c6d92a02c1fcdce3c`
- Receipt status: `0x1` (success)
- Block: `116872`
- Block hash: `0x09c8a98bba7f0a6886105fb5ae74707f8508fef796258fc3e528797bac75ab03`
- Canonical block check: passed; RPC block hash matched the receipt
- Runtime bytecode length: 2,153 bytes
- Runtime code Keccak-256: `0xb3d71ff82b4b654c7bafe855ce13b0dc277627a046e3190f6f6e0ee5eb7f7671`
- On-chain `authoritySigner()`: `0x48F9B07d37b5AF744BA8195c4d6740145b593ea6`
- Deployer public EVM address: `0x4c07B4f328FA738290Db96BCE2F9CBc4d020D2CB`

## Measured transaction fee

- Receipt gas used: `4856432276155584`
- Effective gas price: `37330 wei`
- Fee calculated from receipt fields: `181.29061686888795072 EVM POT`
- Deployer balance observed after deployment: `270.60938313111204928 EVM POT`

The fee above is calculated from the confirmed receipt fields; it is not an estimate. Token denomination and network-specific fee mechanics should not be generalized from this one transaction.

## Test status

The deployment workspace reported `156 passing` automated tests after deployment. These are not a substitute for an independent audit or end-to-end test of every live bridge path.

## Explicit caveat

A read-only lookup of the runtime's `Revive.OriginalAccount` mapping did not confirm a mapping entry for the deployer H160 and the supplied SS58 address. Do not claim that the EVM-to-SS58 mapping has been verified. The EVM deployment itself succeeded from the funded EVM address.

## Secret handling

Only public addresses, transaction identifiers, code hashes and measured results are recorded here. Private keys, mnemonic phrases, `.env` files, signed authorization payloads and wallet backups must never be committed.
