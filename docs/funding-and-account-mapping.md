# PortalDot V3 funding and account mapping

## Keep the account types separate

PortalDot V3 exposes a Substrate account interface and an EVM-compatible `pallet-revive` interface. They share the chain, but account identifiers and balance APIs are not interchangeable:

- Substrate wallets show an SS58 address and native balance.
- EVM JSON-RPC reads the balance of an H160 address with `eth_getBalance`.
- The deterministic fallback account for an H160 is formed by appending twelve `0xEE` bytes to the 20-byte address and encoding the 32-byte result as SS58.
- Native Substrate accounts can require a stateful `pallet_revive.map_account` mapping before they can act as an origin in the EVM-compatible contract system. Do not assume that every SS58 account and an H160 are the same key or automatically mapped.

The current general Polkadot `pallet-revive` documentation describes this distinction and the `map_account` extrinsic: https://docs.polkadot.com/smart-contracts/for-eth-devs/accounts/ . PortalDot V3 runtime behavior must still be verified against PortalDot's deployed runtime rather than inferred solely from generic Polkadot documentation.

## Funding an EVM deployer

1. Derive the fallback SS58 address for the intended EVM H160 with `npm run address:substrate -- 0xYourEvmAddress`.
2. Verify the address and chain in a trusted PortalDot interface before sending a small test amount.
3. Query `eth_getBalance(H160, "latest")` through the configured PortalDot V3 EVM RPC.
4. Compare the Substrate transfer amount with the resulting EVM balance. Record the transaction hash and inspect the actual extrinsic/event before concluding why the values differ.
5. Only after this test succeeds should the deployer be funded for a deployment estimate.

Do not infer a conversion loss, existential deposit, or mapping status from the balance difference alone. The observed balance is the spendable balance reported by the EVM API; runtime accounting, reserved deposits, fees, and unit conversion may affect how it compares with the Substrate wallet UI.

## Read-only deployment estimate

The estimator compiles the current contract and requests `eth_estimateGas`, `eth_gasPrice`, and `eth_getBalance`. It never signs or broadcasts. Set `DEPLOYMENT_ESTIMATE_FROM` to the public H160 that will pay for deployment. If `AUTHORITY_SIGNER_ADDRESS` has not been selected yet, the estimator uses a clearly labelled non-zero placeholder for a preliminary cost probe. That placeholder is **not** a valid deployment configuration; the real deployment script still requires a dedicated, non-zero authority signer different from the deployer.

PortalDot V3 can charge code-storage deposits as well as transaction fees. If the RPC refuses estimation because the sender has insufficient funds, the estimate is inconclusive; do not interpret the error as a zero cost. Re-run once the account has enough test funds, then compare the quote with the live balance and keep a safety margin. No transaction is sent by the estimator.
