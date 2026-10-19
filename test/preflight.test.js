import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { expect } = require("chai");
const assert = require("node:assert/strict");
const { requiredNetworkConfig, rpc } = require("../scripts/preflight");

describe("PortalDot RPC preflight configuration", function () {
  const originalRpc = process.env.PORTALDOT_RPC_URL;
  const originalChainId = process.env.PORTALDOT_CHAIN_ID;
  const originalFetch = global.fetch;

  afterEach(function () {
    if (originalRpc === undefined) delete process.env.PORTALDOT_RPC_URL;
    else process.env.PORTALDOT_RPC_URL = originalRpc;
    if (originalChainId === undefined) delete process.env.PORTALDOT_CHAIN_ID;
    else process.env.PORTALDOT_CHAIN_ID = originalChainId;
    global.fetch = originalFetch;
  });

  function configure(rpc, chainId) {
    if (rpc === undefined) delete process.env.PORTALDOT_RPC_URL;
    else process.env.PORTALDOT_RPC_URL = rpc;
    if (chainId === undefined) delete process.env.PORTALDOT_CHAIN_ID;
    else process.env.PORTALDOT_CHAIN_ID = chainId;
  }

  function jsonRpcResponse(result, overrides = {}) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: "2.0", id: 1, result, ...overrides })
    };
  }

  it("refuses a missing RPC endpoint", function () {
    configure(undefined, "123");
    expect(() => requiredNetworkConfig()).to.throw(/PORTALDOT_RPC_URL is required/);
  });

  it("refuses a missing or malformed chain ID", function () {
    for (const chainId of [undefined, "", "0", "-1", "01", "1.5", "1e3"]) {
      configure("https://rpc.example.invalid", chainId);
      expect(() => requiredNetworkConfig()).to.throw(/PORTALDOT_CHAIN_ID/);
    }
  });

  it("refuses invalid URLs and non-HTTP protocols", function () {
    configure("not-a-url", "123");
    expect(() => requiredNetworkConfig()).to.throw(/valid absolute URL/);

    configure("wss://rpc.example.invalid", "123");
    expect(() => requiredNetworkConfig()).to.throw(/HTTP or HTTPS/);
  });

  it("rejects RPC URLs with embedded username/password credentials", function () {
    configure("https://user:password@rpc.example.invalid", "420420777");
    expect(() => requiredNetworkConfig()).to.throw(/must not embed credentials/);
  });

  it("disables redirects and accepts a well-formed JSON-RPC quantity", async function () {
    let requestOptions;
    global.fetch = async (_url, options) => {
      requestOptions = options;
      return jsonRpcResponse("0x1");
    };
    expect(await rpc("https://rpc.example.invalid", "eth_blockNumber")).to.equal("0x1");
    expect(requestOptions.method).to.equal("POST");
    expect(requestOptions.redirect).to.equal("error");
    expect(JSON.parse(requestOptions.body)).to.deep.equal({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_blockNumber",
      params: []
    });
  });

  it("rejects malformed JSON-RPC envelopes and non-canonical quantities", async function () {
    const badResponses = [
      { payload: { jsonrpc: "1.0", id: 1, result: "0x1" }, message: /invalid JSON-RPC version/ },
      { payload: { jsonrpc: "2.0", id: "1", result: "0x1" }, message: /response ID mismatch/ },
      { payload: { jsonrpc: "2.0", id: 2, result: "0x1" }, message: /response ID mismatch/ },
      { payload: null, message: /invalid JSON-RPC response object/ },
      { payload: [], message: /invalid JSON-RPC response object/ },
      { payload: { jsonrpc: "2.0", id: 1 }, message: /canonical hexadecimal quantity/ },
      { payload: { jsonrpc: "2.0", id: 1, result: 1 }, message: /canonical hexadecimal quantity/ },
      { payload: { jsonrpc: "2.0", id: 1, result: "1" }, message: /canonical hexadecimal quantity/ },
      { payload: { jsonrpc: "2.0", id: 1, result: "0x" }, message: /canonical hexadecimal quantity/ },
      { payload: { jsonrpc: "2.0", id: 1, result: "0x01" }, message: /canonical hexadecimal quantity/ }
    ];

    for (const { payload, message } of badResponses) {
      global.fetch = async () => ({ ok: true, status: 200, json: async () => payload });
      await assert.rejects(() => rpc("https://rpc.example.invalid", "eth_chainId"), message);
    }
  });

  it("surfaces JSON-RPC errors rather than accepting an absent result", async function () {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32000, message: "provider unavailable" }
      })
    });
    await assert.rejects(
      () => rpc("https://rpc.example.invalid", "eth_chainId"),
      /JSON-RPC error: provider unavailable/
    );
  });

  it("rejects unsuccessful HTTP responses", async function () {
    global.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
    await assert.rejects(() => rpc("https://rpc.example.invalid", "eth_chainId"), /HTTP 503/);
  });

  it("accepts an explicitly configured HTTPS RPC and canonical chain ID", function () {
    configure("https://rpc.example.invalid", "420420777");
    expect(requiredNetworkConfig()).to.deep.equal({
      rpcUrl: "https://rpc.example.invalid",
      expectedChainId: 420420777n
    });
  });
});
