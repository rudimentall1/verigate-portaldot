# Verigate-authorized native PortalDot transfer

## Why this adapter exists

The public V2 proof already demonstrates the EVM path: a Verigate decision is verified off-chain, a bridge signer produces a scoped EIP-712 authorization, and `PortalDotAgentGuardV2` transfers native EVM POT.

PortalDot also exposes a native Substrate runtime. This adapter adds a separate, deliberately narrow path for **`Balances.transfer_keep_alive`** so the project can demonstrate Verigate-gated authority over a native-runtime transfer instead of treating EVM as the only execution interface.

This is not a DaaS integration. The public material available to this project did not provide a concrete DaaS pallet/call ABI that could be safely encoded, so the adapter does not invent a liquidation or recovery call. It is a testnet reference adapter for a standard native transfer.

## Authorization contract

The input file must contain both signed artifacts from Verigate: `decision_receipt` and `execution_authorization`. Both are checked locally against the pinned Ed25519 issuer public key and checked again through Verigate's `/v1/verify` endpoint.

The signed intent/action must exactly bind:

| Field | Required value |
|---|---|
| `action_type` | `portaldot.substrate_transfer` |
| `network` | `portaldot-v3-substrate` |
| `asset` | `POT` |
| `target` | PortalDot SS58 address with prefix 42 |
| `amount_exact` | Canonical positive decimal string in Substrate base units |
| `metadata.portaldot_substrate_v3.genesis_hash` | `0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd` |
| `metadata.portaldot_substrate_v3.recipient_ss58` | Same address as `target` |
| `metadata.portaldot_substrate_v3.amount_base_units` | Same integer string as `amount_exact` |
| `metadata.portaldot_substrate_v3.max_fee_base_units` | Positive integer string defining the maximum fee estimate accepted by preflight; identical in signed intent and authorization |

The same metadata and action values must be present in the signed intent and execution authorization. Authorization ID, policy digest, intent ID, agent ID, action digest, issue time and expiry are checked. Only `ALLOW` continues; `WARN` and `BLOCK` fail closed.

This action type/network may need to be explicitly enabled in the operator's Verigate capability and policy configuration. The adapter does not weaken Verigate policy or create an ALLOW decision by itself.

## Configure

Use the existing `.env` file locally; do not commit it or paste a mnemonic/private URI into a report. The CLI loads this file automatically.

Required values:

- `PORTALDOT_SUBSTRATE_RPC_URL=wss://test-node-v3.portaldot.dev`
- `PORTALDOT_SUBSTRATE_GENESIS_HASH=0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd`
- `PORTALDOT_SUBSTRATE_SIGNER_ADDRESS=<funded SS58 address>`
- `PORTALDOT_SUBSTRATE_RECIPIENT_SS58=<recipient SS58 address, prefix 42>`
- `VERIGATE_PUBLIC_KEY_FILE=<trusted issuer public-key PEM path>`
- `VERIGATE_PUBLIC_KEY_SHA256=<independently verified issuer-key fingerprint>`
- `VERIGATE_BASE_URL=<trusted Verigate API URL>`

For a public Verigate API, use HTTPS and the configured API key if required. The adapter reuses the repository's pinned issuer verification logic. Keep the native-runtime signer separate from EVM deployer, relayer and EIP-712 authority keys. Prefer a dedicated low-balance test account.

The local native authorization preparation helper creates a separate policy/capability profile and asks Verigate for a fresh authorization. It does not edit the active EVM policy, sign a Substrate extrinsic, run the RPC simulation, or broadcast a transaction:

The default requested action is `0.01 POT` (`1000000000000` base units), while the separate policy/capability ceiling is `0.1 POT` (`10000000000000` base units). This keeps the initial request within the default dynamic-authority `PROBATION` multiplier of 10%; the action amount is not automatically set equal to its ceiling. Configure them independently with `PORTALDOT_SUBSTRATE_AUTH_AMOUNT_BASE_UNITS` and `PORTALDOT_SUBSTRATE_CAPABILITY_MAX_BASE_UNITS`.

```sh
npm run prepare:substrate:auth
```

The helper requires an existing agent identity plan at `/opt/verigate-portaldot-issuer/live-e2e/plan-1ae14879503d.json` and a recipient SS58 address set in the local `.env`. It starts a separate verifier on loopback `127.0.0.1:8003`, preserves the verifier on port 8001, creates a narrow native capability in the existing issuer database, and writes a mode-0600 authorization response under `/opt/verigate-portaldot-issuer/live-e2e/`. This has local policy/database side effects but no chain side effects. It refuses to proceed if governed-policy mode is enabled or the registered identity/key binding does not match. Review the printed target, amount and decision.

The secret signing URI is required only for `--simulate` or `--broadcast`:

- `PORTALDOT_SUBSTRATE_SIGNER_URI=<local secret URI; never commit>`
- `PORTALDOT_SUBSTRATE_REPLAY_DIR=.verigate-substrate-replay`

`--simulate` signs locally and sends the signed call to `system_dryRun`, not the transaction pool. `--broadcast` is the only on-chain write mode.

## Read-only preflight

Save the Verigate response to an untracked local JSON file such as `authorization-response-native.json`, then run:

```sh
npm run substrate:execute -- ./authorization-response-native.json
```

This mode:

1. validates the signed `ALLOW` and exact target/amount/network/genesis bindings;
2. verifies the Ed25519 artifacts locally and through `/v1/verify`;
3. checks the connected Substrate genesis hash and runtime `specName`;
4. queries sender/recipient balances, runtime existential deposit, and `paymentInfo` fee estimate;
5. prints JSON with authorization identifiers, amount, estimated fee, signed fee ceiling, current free balance and chain/runtime version.

The signed intent must include `metadata.portaldot_substrate_v3.max_fee_base_units`. The adapter refuses to continue if the current `paymentInfo` estimate exceeds this ceiling. The ceiling is part of the signed action digest, so it cannot be raised in the execution artifact without invalidating authorization.

No extrinsic is signed or sent in this mode. `paymentInfo` is a fee estimate, not a full execution dry-run. The signed ceiling blocks preflight when the estimate is already too high, but it is not a runtime-enforced maximum on the final charged fee. A successful result means the checked preconditions passed at that time, not that a transfer has been submitted.

The remote URL is restricted to the recorded PortalDot V3 testnet WSS. Loopback WebSocket is allowed for isolated local testing when a local genesis hash is explicitly pinned. Other remote endpoints are refused.

## Runtime simulation without broadcast

The node's RPC list advertises `system_dryRun` and `system_dryRunAt`. This method is marked unsafe in PortalDot's RPC documentation and can still be disabled by the server, so the adapter treats an RPC error as a failed simulation and stops.

To sign the exact authorized transfer locally and ask the node to simulate it at a finalized block, run:

```sh
npm run substrate:execute -- ./authorization-response-native.json --simulate
```

This mode requires the local `PORTALDOT_SUBSTRATE_SIGNER_URI` and verifies that it derives the configured signer address. The adapter signs the exact `Balances.transfer_keep_alive` extrinsic locally, queries `system_dryRun` at the checkpoint block, and reports transaction-validity errors separately from dispatch errors. It does not call `signAndSend`, submit to the transaction pool, or create a replay reservation. The signature and call are sent to the configured RPC endpoint for simulation, but no transfer is broadcast and no balance should change from this RPC call.

A successful simulation is a point-in-time runtime result, not a guarantee of inclusion later or of the final fee. A rejected/disabled RPC is not treated as success. The plain preflight mode remains read-only and does not sign.

## Explicit testnet broadcast

Broadcast requires the separate `--broadcast` argument and `PORTALDOT_SUBSTRATE_SIGNER_URI`. The signer address derived from that URI must match `PORTALDOT_SUBSTRATE_SIGNER_ADDRESS`.

```sh
npm run substrate:execute -- ./authorization-response-native.json --broadcast
```

Before submitting, review the exact `ALLOW`, recipient, base-unit amount and fee estimate. The adapter records the authorization ID in a local replay ledger **before** submission, waits for finalization, rejects dispatch errors, and requires exactly one matching `Balances.Transfer` event in the finalized extrinsic. Save the JSON output as execution evidence only after a successful live testnet transfer.

The replay ledger is local to one filesystem and is not a distributed nonce service. Multiple executor replicas need shared durable replay state before this pattern can be relied on in a distributed deployment. A crash after reserving authorization but before recording the result intentionally requires operator reconciliation rather than automatic replay.

## Verify saved native transfer evidence

The repository includes a saved record at `docs/evidence/portaldot-native-substrate-live-transfer-2026-10-24.json`. Re-query it without signing or broadcasting:

```sh
node scripts/verify-substrate-transfer.mjs docs/evidence/portaldot-native-substrate-live-transfer-2026-10-24.json
```

By default the verifier uses `PORTALDOT_SUBSTRATE_RPC_URL` (or the endpoint recorded in the evidence file). To compare the same evidence through a second endpoint, configure `PORTALDOT_SUBSTRATE_RPC_URL_SECONDARY` with a different WSS origin. The secondary endpoint must be independently operated for that comparison to add meaningful trust; a different hostname alone does not prove operator independence.

The verifier reads the saved block hash, the extrinsic in that block, current finality/canonical hash at the recorded height, runtime version and events in the target extrinsic phase. It requires the signer, recipient, amount, successful dispatch, `Balances.Transfer`, and `TransactionFeePaid` values to match the evidence. Possible statuses are `VERIFIED_BY_ONE_RPC_ENDPOINT`, `MATCHING_EVIDENCE_FROM_TWO_RPC_ENDPOINTS`, `CONFLICT`, and `UNAVAILABLE`.

A pruned historical block or unavailable `system.events` state returns `UNAVAILABLE`, not evidence that the transfer failed or never existed. This verifier corroborates chain observations; it does not cryptographically re-verify Verigate's off-chain signed artifacts, perform an audit, or authenticate the RPC operator.

## Safety boundaries and status

- The adapter accepts one native call: `Balances.transfer_keep_alive`. It does not dispatch arbitrary runtime calls, DaaS liquidation calls, governance actions, or EVM contract calls.
- The native runtime executes the transfer; Verigate authorization is verified by the adapter before submission. The Substrate runtime does not natively verify the Verigate Ed25519 artifact.
- Native transfer execution evidence was saved on 24 October 2026 from one configured Substrate RPC. Use the read-only evidence verifier above to re-query it; this has not yet been independently corroborated through a second provider.
- The verifier checks chain observations against the saved evidence but does not contain or re-verify the Verigate Ed25519 signed artifacts. Its unit tests use fixtures; only a successful run against the live endpoint establishes that the saved block and event are currently available from that endpoint.
- The adapter is not security-audited or production-ready. Do not use a valuable account or mainnet credentials.