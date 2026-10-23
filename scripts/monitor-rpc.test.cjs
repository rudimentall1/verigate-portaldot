const test = require("node:test");
const assert = require("node:assert/strict");
const { rpcWithRetry } = require("./monitor-rpc.js");

test("RPC monitor retries transient failures and recovers", async () => {
  let calls = 0;
  const result = await rpcWithRetry("https://rpc.invalid", "eth_chainId", {
    attempts: 3,
    delayMs: 0,
    request: async () => {
      calls += 1;
      if (calls < 3) throw new Error("temporary timeout");
      return "0x190f1ca9";
    }
  });
  assert.equal(result, "0x190f1ca9");
  assert.equal(calls, 3);
});

test("RPC monitor reports exhaustion instead of hiding an outage", async () => {
  let calls = 0;
  await assert.rejects(
    rpcWithRetry("https://rpc.invalid", "eth_blockNumber", {
      attempts: 2,
      delayMs: 0,
      request: async () => {
        calls += 1;
        throw new Error("temporary timeout");
      }
    }),
    /eth_blockNumber failed after 2 attempts: temporary timeout/
  );
  assert.equal(calls, 2);
});

test("RPC retry count is bounded", async () => {
  await assert.rejects(
    rpcWithRetry("https://rpc.invalid", "eth_chainId", { attempts: 6, request: async () => "0x1" }),
    /between 1 and 5/
  );
});
