# Evidence in this repository

## Read-only PortalDot runtime fingerprint

[portaldot-v3-runtime-2026-10-19.json](portaldot-v3-runtime-2026-10-19.json) records the runtime spec reported by the advertised Substrate WSS endpoint, decoded Revive storage schema, selected runtime constants, and one synthetic H160 lookup. The latest pinned-state probe is https://github.com/rudimentall1/verigate-portaldot/actions/runs/39225053317; its artifact is https://github.com/rudimentall1/verigate-portaldot/actions/runs/39225053317/artifacts/12172714887.

The runtime metadata shows Revive.OriginalAccount keyed by H160 and storing AccountId32; Revive.AddressSuffix is absent; AutoMap=true and NativeToEthRatio=10000 were reported. The synthetic key query returned no value, as expected. This evidence does not include a user's wallet pair and does not establish its live mapping.

## Deployment and authorized-transfer evidence

- [authorized-transfer-2026-10-21.json](authorized-transfer-2026-10-21.json) records a read-only re-verification of a public PortalDot V3 receipt and its TransferExecuted event. The amount is one EVM base unit, so it proves the call path but not a meaningful-value transfer. The reproducible verifier is npm run verify:authorized-transfer -- <transaction-hash>.
- Keep deployment evidence and further authorized transfer evidence here:
- preflight output with timestamp, actual chain ID and latest block;
- deployment address and transaction hash;
- confirmed block number and explorer link;
- demo transaction hashes for an allowed payment;
- evidence that a denied or modified authorization did not execute.

Do not add seed phrases, private keys, raw .env files, signed authorization payloads, or credentials. The live transfer record is endpoint-reported evidence from the configured RPC, not independent authentication of its operator. GitHub Actions local execution evidence uses disposable keys and a loopback Hardhat EVM; keep it separate from public PortalDot evidence.
