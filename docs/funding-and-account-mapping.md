# PortalDot V3 funding and account mapping

## Keep the account types separate

PortalDot V3 exposes a Substrate account interface and an EVM-compatible `pallet-revive` interface. They share the chain, but account identifiers and balance APIs are not interchangeable:

- Substrate wallets show an SS58 address and native balance.
- EVM JSON-RPC reads the balance of an H160 address with `eth_getBalance`.
- The deterministic fallback account for an H160 is formed by appending twelve `0xEE` bytes to the 20-byte address and encoding the 32-byte result as SS58.
- A native Substrate account may require a stateful `pallet_revive.map_account` mapping before it can act as an origin in the contract system. Do not assume an SS58 account and an H160 are the same account or automatically mapped.

The general Polkadot `pallet-revive` documentation describes this distinction and the `map_account` extrinsic: https://docs.polkadot.com/smart-contracts/for-eth-devs/accounts/ . This is general SDK guidance, **not proof of PortalDot V3's deployed runtime configuration**. PortalDot's runtime state or a team-confirmed procedure must establish the mapping.

## Incident-specific safety rule

The hackathon account supplied to PortalDot and funded by the team is the user's original Substrate address. Do not replace it in the application, and do not send further test funds to a derived fallback address based only on offline address conversion.

In the current investigation, the original SS58 account was reported to hold 500 transferable tPOT. The EVM RPC returned 0.9 POT for a candidate H160 after a 1-token transfer was attempted. That balance observation alone does **not** prove that the original SS58 account is mapped to that H160, nor does it explain the difference. The transfer's exact transaction/extrinsic and the live runtime mapping remain unverified.

Before any further funding or deployment:
1. Read the PortalDot V3 runtime metadata and relevant `pallet_revive` storage (including the original-account mapping, if exposed) or obtain explicit confirmation from the PortalDot team.
2. Establish which H160 corresponds to the registered Substrate account and whether it is mapped/usable as a contract origin.
3. Confirm the native token denomination and how `eth_getBalance` represents it.
4. Run a read-only deployment estimate using the verified deployer H160 and the real intended authority signer.
5. Only consider a transfer or deployment after the account mapping, token units, estimate, and required budget are independently verified.

No additional transfer is a prerequisite for this investigation. Do not treat a generated fallback SS58 address as an alias for the registered account.

## Read-only deployment estimate

The estimator compiles the current contract and requests `eth_estimateGas`, `eth_gasPrice`, and `eth_getBalance`. It never signs or broadcasts. Set `DEPLOYMENT_ESTIMATE_FROM` to the public H160 that is independently verified to pay for deployment. If `AUTHORITY_SIGNER_ADDRESS` has not been selected yet, the estimator may use a clearly labelled non-zero placeholder for a preliminary cost probe. That placeholder is **not** a valid deployment configuration; the real deployment script requires a dedicated, non-zero authority signer different from the deployer.

A previous preliminary quote against the candidate H160 reported 0.9 POT balance and a cost estimate around 184.12 POT (around 220.95 POT with a 20% margin), using a placeholder authority signer. This is not a reliable final budget: the H160 mapping, token denomination, real authority signer, and unusually large gas estimate still need validation. Do not use that quote alone to decide to fund the account.

PortalDot V3 may charge code-storage deposits as well as transaction fees. If the RPC estimate is inconclusive or unexpectedly large, investigate the runtime's gas/weight and deposit semantics rather than treating the number as a normal Ethereum gas estimate. No transaction is sent by the estimator.
