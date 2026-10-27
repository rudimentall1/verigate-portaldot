# PortalPilot server-side wiring patch

Status: patch plan against the inspected upstream `ismailridwans/portalpilot` `main` source. This file is in Verigate's repository; it does **not** modify the upstream PortalPilot repository.

## Why the route boundary matters

At the inspected upstream revision, `POST /api/ask` calls `planAction(intent.action, network)` for every write. `planAction()` signs and caches the extrinsic before returning. `POST /api/execute` calls `executePlan(planId)` without any authorization check. The gate must therefore run before `planAction()` and again in `/api/execute`.

## Agent signer: implementation found, deployment boundary remains

The Verigate source does contain the canonical signer: `core.identity.sign_action_intent(action, identity_id, private_key)`. It signs an Ed25519 signature over the UTF-8 bytes of compact, key-sorted JSON for `{ "identity_id": identity_id, "action": action.as_dict() }`, then base64-encodes the signature. `ActionIntent.as_dict()` is defined in `core/models.py`. The existing `scripts/prepare-native-substrate-auth.py` uses this exact function with the registered live-proof agent key and identity.

This resolves the canonicalization question, but does **not** make the private key available to PortalPilot. PortalPilot's `PORTALDOT_SIGNER_SEED` is an sr25519 Substrate transaction signer, not the Verigate Ed25519 agent identity key. Do not substitute one for the other, copy the private key into a hosted frontend, or expose a general-purpose public signing endpoint.

PortalPilot needs a trusted server-side function with this contract:

```ts
type SignActionIntent = (
  actionIntent: Record<string, unknown>,
  identityId: string
) => Promise<string>;
```

If PortalPilot does not have a confirmed compatible signer, leave the gate unavailable and refuse writes. Do not accept `agent_signature`, an authorization binding, or expected SCALE bytes from the browser.

## Patch shape for `src/server.ts`

1. Add a server-only integration module that wraps the helpers in this repository:
   - `requestPortalPilotAuthorization(action, { signActionIntent })`
   - `verifyPortalPilotVerigateResponse(response)`
   - `assertPortalPilotTransferMatchesAuthorization(action, binding)`
   - `assertPortalPilotPlanAuthorized(...)`

   Copy the required modules and their dependencies into PortalPilot or publish them as a versioned package first. Do not import across two independent GitHub repositories using relative paths.

2. Add a private in-memory map alongside the other server constants:

```ts
const verigatePlans = new Map<string, {
  plan: Awaited<ReturnType<typeof planAction>>;
  authorization: Awaited<ReturnType<typeof authorizePortalPilotAction>>;
}>();
```

   This map is process-local. If the server is deployed serverlessly or runs multiple instances, use a shared server-side store with TTL and atomic consume semantics instead. The authorization must never be stored only in client state.

3. In the `intent.type === "write"` branch of `POST /api/ask`, fail closed unless all of these are true:
   - `intent.action.kind === "transfer"` (batch transfers and remarks remain disabled);
   - the requested network is the pinned PortalDot V3 Substrate testnet endpoint, `wss://test-node-v3.portaldot.dev`;
   - a trusted `signActionIntent` callback is configured;
   - Verigate returns ALLOW and both signed artifacts pass local issuer-key verification plus the configured remote `/v1/verify` checks.

   The order must be:

```ts
const authorization = await authorizePortalPilotAction(intent.action, {
  requestAuthorization: (action) =>
    requestPortalPilotAuthorization(action, { signActionIntent }),
});
const expectedCallHex = await expectedNativeTransferCallHex(
  authorization.recipient,
  authorization.amountBaseUnits,
  PORTALDOT_TESTNET_RPC
);
const actionCallHex = await encodeUnsignedTransferCallHex(
  intent.action, PORTALDOT_TESTNET_RPC
);
if (actionCallHex !== expectedCallHex) {
  throw new Error("Unsigned call differs from Verigate authorization");
}
// Only now may PortalPilot create/sign the plan.
const plan = await planAction(intent.action, PORTALDOT_TESTNET_RPC);
assertPortalPilotPlanAuthorized({ plan, authorization, expectedCallHex });
verigatePlans.set(plan.id, { plan, authorization });
return res.json({ kind: "plan", intent, plan });
```

   The names above are the intended host adapter contract, not functions currently exported by PortalPilot. Implement `expectedNativeTransferCallHex` inside PortalPilot's SDK so it obtains the connected API for the pinned endpoint and encodes `api.tx.balances.transferKeepAlive(recipient, BigInt(amountBaseUnits)).method.toHex()`. It must derive bytes from the verified authorization, never from `plan.callHex`.

4. In `POST /api/execute`, replace the unconditional `executePlan(planId)` call with this sequence:
   - retrieve the server-side `{ plan, authorization }` by `planId`, otherwise refuse;
   - recompute the expected SCALE call from the immutable verified authorization using the pinned testnet API;
   - re-run `assertPortalPilotPlanAuthorized` immediately before submission, including expiry and fee ceiling checks;
   - only then call `executePlan(planId)`;
   - consume the server-side authorization record on success or refusal so it cannot be replayed.

5. The expected-call helper must verify the API's genesis hash equals the pinned genesis before encoding. Do not silently accept the existing `mainnet` or `local` network aliases. Reject if the fee estimate is unavailable, non-canonical, or above the signed fee ceiling.

## Additional SDK helper

Add an SDK helper in `src/sdk/tx.ts` that builds but does not sign or submit a single transfer using the already-connected pinned API and returns only the encoded call bytes. It should:
- validate the SS58 recipient against the connected API's SS58 prefix;
- accept the amount as exact base-unit `bigint` or canonical integer string, never floating point;
- build `api.tx.balances.transferKeepAlive(recipient, amount)`;
- return `tx.method.toHex()`;
- refuse if the API genesis hash differs from `PORTALDOT_TESTNET_GENESIS`.

Do not use `planAction()` to calculate expected bytes: that function signs the extrinsic.

## Validation before claiming integration

- Unit-test refusal before `planAction()` for BLOCK, bad signatures, wrong recipient, wrong amount, wrong genesis, missing signer, and unsupported action.
- Unit-test refusal before `executePlan()` for expiry, changed SCALE bytes, missing/unavailable fee estimate, and fee above the signed ceiling.
- Verify that client-supplied plan fields and authorization data are ignored.
- Run the upstream TypeScript build and tests.
- Only after the real server routes and signer are connected, test against the configured Verigate service and PortalDot V3 testnet. A fixture test is not live integration evidence.

## Deployment constraint discovered

The upstream `src/sdk/portaldot.ts` explicitly supports raw `ws(s)://` endpoints, so the pinned testnet endpoint can be supplied without adding a public network alias. However, `src/sdk/tx.ts` stores signed transactions in a process-local `planCache`, and `src/server.ts` is designed to run as a serverless function when `VERCEL` is set. A process-local Verigate plan map would not be safe/reliable across independent serverless invocations. The integration must either run on one persistent backend process or move both the cached signed extrinsic and one-time authorization binding into a shared server-side store with TTL and atomic consume semantics.

The existing Verigate Python signer uses the registered agent key referenced by the live proof plan. If PortalPilot and Verigate are not colocated, do not assume the key path is available. The safe next implementation is a narrow, authenticated internal signer adapter deployed beside Verigate, or an explicit server-to-server identity-signing service with strict action validation; no such endpoint currently exists in the inspected API.

## Current boundary

This patch specification is based on the inspected upstream files:
- `src/server.ts` at the current upstream `main` revision inspected on 2026-10-27;
- `src/sdk/tx.ts` at the current upstream `main` revision inspected on 2026-10-27.

No upstream files have been changed by this document. The implementation remains blocked on a confirmed Verigate-compatible agent signing callback and write access/maintainer acceptance in the upstream repository.


## Restricted local agent-signing adapter added

The branch now includes `integrations/portalpilot/verigate-agent-signer.py`. It is a stdin/stdout CLI, not an HTTP endpoint. It calls Verigate's own `sign_action_intent()`, checks the identity is active in the configured Verigate DB, verifies that the configured private key matches that identity's registered public key, and only signs the fixed native PortalDot transfer action type. It pins the known testnet genesis and enforces configured maximum amount and fee-ceiling values. The signature is the only value written to stdout; diagnostic failures go to stderr.

This adapter is useful only when the PortalPilot backend can securely invoke the script on the same trusted host (or through an equally protected process boundary) where the registered agent key and Verigate identity database are available. It must not be deployed in a browser bundle, exposed as an unauthenticated web endpoint, or run with a key copied to a public/serverless frontend. It does not call Verigate authorization, does not produce an ALLOW, and does not submit a transaction.

Required server-side environment variables:
- `VERIGATE_SOURCE_ROOT`
- `VERIGATE_DB`
- `VERIGATE_AGENT_ID`
- `VERIGATE_IDENTITY_ID`
- `VERIGATE_AGENT_PRIVATE_KEY_FILE`
- `PORTALDOT_SUBSTRATE_GENESIS_HASH`
- `PORTALDOT_SUBSTRATE_SIGNER_RECIPIENT_SS58` (exact allowlisted recipient; other targets are refused)
- `PORTALDOT_SUBSTRATE_SIGNER_MAX_AMOUNT_BASE_UNITS`
- `PORTALDOT_SUBSTRATE_SIGNER_MAX_FEE_BASE_UNITS`

PortalPilot should invoke this through a server-only child process using JSON on stdin, then send the exact same ActionIntent fields plus the returned `agent_signature` to `POST /v1/actions/authorize`. The API key remains server-side. Verify the returned receipt and execution authorization using the existing `verigate-live-verifier.mjs` before planning or execution. Never accept a signature or signed authorization response supplied by the browser.

Important limitation: this is a source-level adapter, not a deployed signer. Its imports and tests still need to be validated in the target Verigate runtime. The PortalPilot routes and plan storage remain unwired, so the end-to-end integration is not complete.


### Signer hardening note

The signer now requires `PORTALDOT_SUBSTRATE_SIGNER_RECIPIENT_SS58` and refuses any target that differs byte-for-byte from this configured allowlist entry. This prevents the signer CLI itself from being used as a generic signing oracle for arbitrary recipients. The Verigate authorization/capability check remains mandatory after signing; this recipient restriction is an additional layer, not a replacement for policy enforcement.
