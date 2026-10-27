# PortalPilot integration spike: native transfer gate

Status: **adapter contract and unit tests prepared; not yet integrated into PortalPilot or verified against live Verigate credentials**.

## Why the integration is not a direct drop-in

PortalPilot's current \`src/sdk/portaldot.ts\` exposes \`mainnet\` and \`local\` network choices. Verigate's native executor intentionally restricts remote writes to \`wss://test-node-v3.portaldot.dev\` and the pinned V3 testnet genesis. A safe integration must explicitly select that raw testnet endpoint; it must not silently reuse PortalPilot's mainnet endpoint.

PortalPilot's \`planAction()\` signs the extrinsic before returning the plan. Therefore the Verigate ALLOW must be requested and verified **before** calling \`planAction()\`. Checking only \`/api/ask\` after plan creation is too late. The plan's SCALE call must then be compared with the call authorized by Verigate before \`/api/execute\` invokes \`executePlan()\`.

## Adapter contract

\`integrations/portalpilot/verigate-gate.mjs\` supplies two fail-closed boundaries:

1. \`authorizePortalPilotAction(action, ...)\`: obtains a Verigate response and requires a caller-supplied verifier that validates the signed artifacts and returns the binding produced by the native adapter's validation logic. It rejects anything except one native transfer, mismatched recipient/amount/genesis, or expired authorization before the host creates a signed plan.
2. \`assertPortalPilotPlanAuthorized(...)\`: checks the plan remains on the pinned testnet, the recipient and exact base-unit amount still match, the authorization has not expired, and \`plan.callHex\` equals \`api.tx.balances.transferKeepAlive(recipient, amount).method.toHex()\` generated from the actual connected API. Call it after plan creation and immediately before execution.

The module does **not** perform signature verification itself. The integration must wire \`verifyAuthorization\` to the real local Ed25519 checks and Verigate \`/v1/verify\`; a mock verifier is used only in unit tests. Do not treat this test harness as evidence of a live Verigate API integration.

## Minimal PortalPilot wiring

- In \`/api/ask\`, for a single \`transfer\`, request/verify Verigate authorization before \`planAction()\` is called.
- Pass the verified authorization object alongside the returned plan in server-side state. Do not trust a client-supplied authorization or call bytes.
- Compute expected call bytes using the same connected API, recipient, and exact \`BigInt\` base units. Compare to the plan's call bytes.
- In \`/api/execute\`, re-check authorization expiry, action binding, network and exact call bytes immediately before \`executePlan()\`. On any error, return a refusal and do not call \`executePlan()\`.
- Keep batch transfers and remarks disabled until they have explicit, independently tested action schemas and policy bindings.
- Add a test proving that BLOCK, invalid signature, expiry, recipient substitution, amount substitution, and call-byte substitution all stop before \`executePlan()\`.

## Tests

Run in this repository:

\`\`\`sh
node --test integrations/portalpilot/verigate-gate.test.mjs
\`\`\`

These tests validate the adapter contract with fixtures and injected verifier callbacks. They do not contact PortalPilot, Verigate, or PortalDot, and do not prove a live integration.
