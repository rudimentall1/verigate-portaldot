import test from "node:test";
import assert from "node:assert/strict";
import { requestPortalPilotAuthorization } from "./verigate-request.mjs";
import { PORTALDOT_TESTNET_GENESIS } from "./verigate-gate.mjs";

const action = {
  kind: "transfer",
  to: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
  amountPot: "0.01",
  maxFeeBaseUnits: "1000000000000",
};

test("request posts an exact native intent to /v1/actions/authorize", async () => {
  let posted;
  const result = {
    decision_receipt: { payload: { decision: { decision: "ALLOW" } } },
    execution_authorization: { payload: {} },
  };
  const response = await requestPortalPilotAuthorization(action, {
    baseUrl: "https://verigate.example/api-prefix",
    apiKey: "fixture-key",
    identityId: "identity-1",
    agentId: "agent-1",
    capabilityId: "native-capability",
    now: () => 2_000_000_000_000,
    signActionIntent: async (intent, identityId) => {
      assert.equal(identityId, "identity-1");
      assert.equal(intent.amount_exact, "1000000000000");
      assert.equal(intent.metadata.portaldot_substrate_v3.genesis_hash, PORTALDOT_TESTNET_GENESIS);
      return "signed-agent-intent";
    },
    fetchImpl: async (url, options) => {
      posted = { url: String(url), options, body: JSON.parse(options.body) };
      return { ok: true, status: 200, json: async () => result };
    },
  });
  assert.equal(response, result);
  assert.equal(posted.url, "https://verigate.example/v1/actions/authorize");
  assert.equal(posted.options.method, "POST");
  assert.equal(posted.options.headers["x-api-key"], "fixture-key");
  assert.equal(posted.body.agent_signature, "signed-agent-intent");
  assert.equal(posted.body.action_type, "portaldot.substrate_transfer");
  assert.equal(posted.body.amount_exact, "1000000000000");
  assert.equal(posted.body.metadata.portaldot_substrate_v3.recipient_ss58, action.to);
});

test("refuses missing signer, missing identity configuration, and non-ALLOW", async () => {
  await assert.rejects(() => requestPortalPilotAuthorization(action, {
    baseUrl: "https://verigate.example",
    identityId: "i", agentId: "a", capabilityId: "c",
  }), /signActionIntent callback/);
  await assert.rejects(() => requestPortalPilotAuthorization(action, {
    baseUrl: "https://verigate.example",
    signActionIntent: async () => "signature",
  }), /IDENTITY_ID/);
  await assert.rejects(() => requestPortalPilotAuthorization(action, {
    baseUrl: "https://verigate.example",
    identityId: "i", agentId: "a", capabilityId: "c",
    signActionIntent: async () => "signature",
    fetchImpl: async () => ({
      ok: true, status: 200,
      json: async () => ({ decision_receipt: { payload: { decision: { decision: "BLOCK" } } } }),
    }),
  }), /did not ALLOW/);
});
