# Evidence in this repository

## Read-only PortalDot runtime fingerprint

[portaldot-v3-runtime-2026-10-19.json](portaldot-v3-runtime-2026-10-19.json) records the runtime spec reported by the advertised Substrate WSS endpoint, decoded Revive storage schema, selected runtime constants, and one synthetic H160 lookup. The corresponding GitHub Actions run is https://github.com/rudimentall1/verigate-portaldot/actions/runs/39221376587.

The runtime metadata shows Revive.OriginalAccount keyed by H160 and storing AccountId32; Revive.AddressSuffix is absent; AutoMap=true and NativeToEthRatio=10000 were reported. The synthetic key query returned no value, as expected. This evidence does not include a user's wallet pair and does not establish its live mapping.

## Deployment evidence

Keep verified PortalDot V3 deployment evidence here after an authorized public transaction:
- preflight output with timestamp, actual chain ID and latest block;
- deployment address and transaction hash;
- confirmed block number and explorer link;
- demo transaction hashes for an allowed payment;
- evidence that a denied or modified authorization did not execute.

Do not add seed phrases, private keys, raw .env files, or credentials. No live deployment evidence is recorded yet. GitHub Actions local execution evidence uses disposable keys and a loopback Hardhat EVM; it is not evidence of a transaction to public PortalDot.
