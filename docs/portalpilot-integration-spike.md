# PortalPilot integration spike: native transfer gate

Status: **fail-closed integration boundary and tests prepared; not integrated into PortalPilot or verified against live Verigate credentials**.

## Code findings

PortalPilot's \`src/sdk/tx.ts\` signs the extrinsic inside \`planAction()\`, then caches the signed transaction. \`executePlan()\` later submits that cached transaction. Verigate ALLOW must be requested and verified **before** \`planAction()\`, and the planned call must be checked again before \`executePlan()\`.

PortalPilot's current network selector exposes \`mainnet\` and \`local\`. Verigate's native executor is restricted to \`wss://test-node-v3.portaldot.dev\` and the pinned V3 testnet genesis. The integration must explicitly select the raw testnet endpoint; it must not silently reuse the mainnet endpoint.

## Adapter contract

- \`authorizePortalPilotAction(action, ...)\` requires a host-provided request callback, then uses the real default verifier.
- The verifier uses the existing native Substrate binding validator, checks both Ed25519 artifacts locally against \`VERIGATE_PUBLIC_KEY_FILE\`, and calls the configured Verigate \`/v1/verify\` endpoint for both artifacts.
- The signed binding must match one \`Balances.transfer_keep_alive\` action, exact SS58 recipient, exact base-unit amount, pinned genesis, and unexpired ALLOW.
- \`assertPortalPilotPlanAuthorized(...)\` checks testnet endpoint, action, expiry and exact SCALE call bytes. Call it after plan creation and immediately before execution.

The request adapter now targets the documented `POST /v1/actions/authorize` endpoint and constructs the native action metadata. Its signed fee ceiling is passed separately as adapter configuration (`maxFeeBaseUnits` or `PORTALDOT_SUBSTRATE_MAX_FEE_BASE_UNITS`), not added to PortalPilot's public `WriteAction` shape. It deliberately requires a host-provided `signActionIntent(actionIntent, identityId)` callback that produces the exact agent signature expected by the registered Verigate identity. It does not read private keys or implement Verigate's agent-signing canonicalization itself. Until that callback is wired to a verified signer from PortalPilot's backend, the request adapter is a tested contract, not a live authorization connector.

## Required PortalPilot wiring

1. Wire `requestPortalPilotAuthorization()` to the server-side registered agent signer. Confirm the callback's canonicalization and identity/capability IDs against the deployed Verigate instance. The helper posts to `/v1/actions/authorize` and fails closed unless it receives ALLOW plus an execution authorization.
2. Build one native transfer action and its exact Verigate intent, including \`action_type=portaldot.substrate_transfer\`, \`network=portaldot-v3-substrate\`, \`asset=POT\`, recipient SS58, base-unit amount, pinned genesis hash, and signed fee ceiling.
2. Request Verigate's decision before calling \`planAction()\`. If the decision is not ALLOW or either signature fails local/remote verification, do not sign a plan.
4. Pass the verified authorization in server-side state. Never trust a client-supplied binding or call bytes.
5. Compute expected call bytes from the same connected API using \`api.tx.balances.transferKeepAlive(recipient, amount).method.toHex()\`. Compare them with the plan after creation and again immediately before execution.
6. If any check fails, return a refusal and do not call \`executePlan()\`. Keep batch transfers and remarks disabled until separately authorized and tested.

## Tests

Run in this repository:

\`\`\`sh
node --test integrations/portalpilot/verigate-gate.test.mjs
\`\`\`

Tests use injected verification functions and fixtures. They check fail-closed wiring but do not contact the real Verigate service, PortalPilot, or PortalDot, and do not prove a live integration.
