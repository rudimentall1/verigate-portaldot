import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { expect } = require("chai");
const { evaluateSnapshot, requiredConfig, rpc } = require("../scripts/monitor-rpc");

describe("PortalDot RPC monitor", function () {
  const originalFetch = global.fetch;

  afterEach(function () {
    global.fetch = originalFetch;
  });
  it("reports a healthy snapshot when the chain ID matches", function () {
    expect(evaluateSnapshot({
      expectedChainId: 420420777n,
      actualChainId: 420420777n,
      blockNumber: 12345n,
      latencyMs: 81
    })).to.deep.equal({
      status: "ok",
      expectedChainId: "420420777",
      actualChainId: "420420777",
      blockNumber: "12345",
      latencyMs: 81
    });
  });

  it("flags a chain ID mismatch without treating it as healthy", function () {
    expect(evaluateSnapshot({
      expectedChainId: 420420777n,
      actualChainId: 1n,
      blockNumber: 12345n,
      latencyMs: 81
    }).status).to.equal("chain_id_mismatch");
  });

  it("rejects insecure remote HTTP RPC endpoints", function () {
    expect(() => requiredConfig({
      PORTALDOT_RPC_URL: "http://rpc.example",
      PORTALDOT_CHAIN_ID: "420420777"
    })).to.throw("Remote RPC endpoints must use HTTPS.");
  });

  it("rejects RPC URLs with embedded username/password credentials", function () {
    expect(() => requiredConfig({
      PORTALDOT_RPC_URL: "https://user:password@rpc.example.invalid",
      PORTALDOT_CHAIN_ID: "420420777"
    })).to.throw(/must not embed credentials/);
  });

  it("disables redirects for read-only JSON-RPC requests", async function () {
    let requestOptions;
    global.fetch = async (_url, options) => {
      requestOptions = options;
      return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result: "0x1" }) };
    };
    expect(await rpc("https://rpc.example.invalid", "eth_blockNumber")).to.equal("0x1");
    expect(requestOptions.redirect).to.equal("error");
  });

  it("accepts the announced PortalDot endpoint configuration", function () {
    const config = requiredConfig({
      PORTALDOT_RPC_URL: "https://test-evm-rpc-v3.portaldot.dev",
      PORTALDOT_CHAIN_ID: "420420777"
    });
    expect(config.expectedChainId).to.equal(420420777n);
  });
});
