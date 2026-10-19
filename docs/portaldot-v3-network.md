# PortalDot V3 testnet configuration

## Network parameters used by this project

| Setting | Value |
|---|---|
| EVM RPC | `https://test-evm-rpc-v3.portaldot.dev` |
| EVM chain ID | `420420777` (`0x190f1ca9`) |
| Substrate RPC | `wss://test-node-v3.portaldot.dev` |
| Node Console | https://node-console.portaldot.dev/ |
| Native symbol | POT; UI may show tPOT/tPOTv3 |
| Substrate native precision | 14 decimals |
| EVM native `value` precision | 18 decimal places |
| Explorer | No dedicated EVM explorer was listed in the 18 Oct 2026 field guide |

### Provenance

The [Allowance testnet field guide](https://github.com/Oziman13/allowance/blob/main/docs/SOLIDITY-ON-PORTALDOT-V3.md) says its live-testnet observations were measured on 18 October 2026 and attributes the EVM RPC, chain ID, Substrate endpoint, and Node Console to Portaldot Discord `#dev-announcement` on 16 October. Its [network config](https://github.com/Oziman13/allowance/blob/main/config/networks.json) lists the same endpoints and chain ID. This is the configuration basis used here; the published [PortalDot developer Chain Info page](https://portaldot-dev.readthedocs.io/en/latest/chain-info.html) describes Substrate mainnet separately, and must not be confused with the V3 EVM testnet.

### Amount units and account mapping

- Substrate POT precision is 14 decimals (`10^14` raw units per POT).
- EVM native `value` uses 18-decimal units. The chain field guide describes a `10^4` conversion between Substrate raw balances and EVM value units. The bridge therefore accepts exact integer strings in EVM base units; human-readable amounts must be converted explicitly before signing.
- The field guide's offline address converter maps an H160 by appending twelve `0xEE` bytes to form AccountId32 and then encoding SS58 with prefix 42. See [`fallback_address.py`](https://github.com/Oziman13/allowance/blob/main/script/fallback_address.py). Where the runtime account-mapping API is available, prefer querying the runtime over reimplementing address mapping in app code.

### Project-specific cost estimate

This repository provides a read-only estimator:

```bash
# In .env set AUTHORITY_SIGNER_ADDRESS and DEPLOYMENT_ESTIMATE_FROM (public EVM address)
npm run estimate:deployment
```

It compiles the current contract, generates the exact constructor init code, then calls `eth_estimateGas`, `eth_gasPrice`, and `eth_getBalance`. It includes a 20% safety margin when comparing the estimate with the deployer's EVM-reported balance. It never signs or broadcasts. Rerun immediately before any authorized deployment.

### Deployment cost

PortalDot V3 uses `pallet-revive`; deployed code incurs a storage deposit in addition to transaction fees. The same field guide reports around 0.08 POT per byte of contract code plus a base cost around 18 POT, with an optimized 9.8 KB sample estimated near 791 POT. Those figures belong to that sample, not to `PortalDotAgentGuard`. Before deployment, estimate cost for our own optimized creation bytecode via `eth_estimateGas` and multiply by the current gas price, then compare with the deployer's EVM-reported balance. Do not assume that 500 POT is enough just because ordinary transfer fees are low.

### Optional genesis hash pin

`PORTALDOT_GENESIS_HASH` is optional additional protection, not a parameter the cited developer announcement requires participants to provide. When populated from a separately trusted source, preflight, direct deployment, and bridge signing verify block 0 against the pin. When blank, these paths use the configured HTTPS endpoint and chain ID. An untrusted RPC can lie about its own responses, so do not claim cryptographic authentication from a single RPC response alone.

### Evidence limitations

The RPC smoke workflow proves read-only connectivity and that the endpoint returned chain ID `420420777` at its check time. It does not establish a live contract deployment, account balance, or deployment budget. There is no dedicated EVM explorer listed in the field guide; preserve transaction hashes, receipts, block numbers, contract addresses, and runtime bytecode hashes when a deployment is authorized and verified.
