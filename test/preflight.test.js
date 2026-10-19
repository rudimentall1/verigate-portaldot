import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { expect } = require("chai");
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

  it("disables redirects for read-only JSON-RPC requests", async function () {
    let requestOptions;
    global.fetch = async (_url, options) => {
      requestOptions = options;
      return { ok: true, json: async () => ({ result: "0x1" }) };
    };
    expect(await rpc("https://rpc.example.invalid", "eth_blockNumber")).to.equal("0x1");
    expect(requestOptions.redirect).to.equal("error");
  });

  it("accepts an explicitly configured HTTP RPC and canonical chain ID", function () {
    configure("https://rpc.example.invalid", "420420777");
    expect(requiredNetworkConfig()).to.deep.equal({
      rpcUrl: "https://rpc.example.invalid",
      expectedChainId: 420420777n
    });
  });
});
