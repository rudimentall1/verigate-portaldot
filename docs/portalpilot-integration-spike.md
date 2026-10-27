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

The adapter **does not create a Verigate intent or decision**. The host still needs to call the correct decision endpoint with the native action metadata, then return both signed artifacts. That request format must be confirmed against the deployed Verigate API before implementing a live connector.

## Required PortalPilot wiring

1. Build one native transfer action and its exact Verigate intent, including \`action_type=portaldot.substrate_transfer\`, \`network=portaldot-v3-substrate\`, \`asset=POT\`, recipient SS58, base-unit amount, pinned genesis hash, and signed fee ceiling.
2. Request Verigate's decision before calling \`planAction()\`. If the decision is not ALLOW or either signature fails local/remote verification, do not sign a plan.
3. Pass the verified authorization in server-side state. Never trust a client-supplied binding or call bytes.
4. Compute expected call bytes from the same connected API using \`api.tx.balances.transferKeepAlive(recipient, amount).method.toHex()\`. Compare them with the plan after creation and again immediately before execution.
5. If any check fails, return a refusal and do not call \`executePlan()\`. Keep batch transfers and remarks disabled until separately authorized and tested.

## Tests

Run in this repository:

\`\`\`sh
node --test integrations/portalpilot/verigate-gate.test.mjs
\`\`\`

Tests use injected verification functions and fixtures. They check fail-closed wiring but do not contact the real Verigate service, PortalPilot, or PortalDot, and do not prove a live integration.
