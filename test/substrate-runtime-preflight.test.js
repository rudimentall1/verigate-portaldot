import { expect } from "chai";
import {
  DEFAULT_SUBSTRATE_RPC_URL,
  validateSubstrateRpcUrl,
  parseCanonicalHexNumber,
  summarizeRuntimeMetadata,
  inspectSubstrateRuntime
} from "../scripts/substrate-runtime-preflight.mjs";

class FakeWebSocket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    super();
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    this.methods = [];
    setTimeout(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.dispatchEvent(new Event("open"));
    }, 0);
  }

  send(payload) {
    const request = JSON.parse(payload);
    this.methods.push(request.method);
    const finalized = "0x" + "ab".repeat(32);
    const genesis = "0x" + "cd".repeat(32);
    const metadataHex = "0x" + Buffer.from(
      "fixture metadata Revive AddressSuffix OriginalAccount",
      "utf8"
    ).toString("hex");
    const results = {
      system_chain: "PortalDot V3 testnet fixture",
      system_name: "PortalDot node fixture",
      system_version: "1.2.3-fixture",
      chain_getFinalizedHead: finalized,
      chain_getBlockHash: genesis,
      chain_getHeader: { number: "0x2a" },
      state_getRuntimeVersion: {
        specName: "portaldot-v3-fixture",
        specVersion: 123,
        implName: "portaldot-node",
        implVersion: 4,
        transactionVersion: 7
      },
      state_getMetadata: metadataHex
    };
    queueMicrotask(() => {
      this.dispatchEvent(new MessageEvent("message", {
        data: JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          result: results[request.method]
        })
      }));
    });
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatchEvent(new Event("close"));
  }
}

describe("PortalDot Substrate runtime metadata preflight", function () {
  it("defaults to the configured V3 Substrate WebSocket endpoint", function () {
    expect(DEFAULT_SUBSTRATE_RPC_URL).to.equal("wss://test-node-v3.portaldot.dev");
    expect(validateSubstrateRpcUrl(DEFAULT_SUBSTRATE_RPC_URL)).to.deep.equal({
      url: DEFAULT_SUBSTRATE_RPC_URL,
      origin: "wss://test-node-v3.portaldot.dev"
    });
  });

  it("rejects credentialed, remote plaintext and non-WebSocket endpoints", function () {
    expect(() => validateSubstrateRpcUrl("wss://user:pass@rpc.example")).to.throw(/must not embed credentials/);
    expect(() => validateSubstrateRpcUrl("ws://rpc.example")).to.throw(/must use WSS/);
    expect(() => validateSubstrateRpcUrl("https://rpc.example")).to.throw(/must use WSS/);
    expect(validateSubstrateRpcUrl("ws://127.0.0.1:9944").origin).to.equal("ws://127.0.0.1:9944");
  });

  it("parses only canonical hexadecimal block numbers", function () {
    expect(parseCanonicalHexNumber("0x0")).to.equal(0n);
    expect(parseCanonicalHexNumber("0x2a")).to.equal(42n);
    for (const value of ["", "42", "0x", "0x00", "0x02", 42, null]) {
      expect(() => parseCanonicalHexNumber(value)).to.throw(/canonical hexadecimal quantity/);
    }
  });

  it("hashes metadata and only emits candidate storage-name hints", function () {
    const metadataHex = "0x" + Buffer.from("Revive AddressSuffix OriginalAccount").toString("hex");
    const result = summarizeRuntimeMetadata(metadataHex);
    expect(result.metadataBytes).to.equal(Buffer.from("Revive AddressSuffix OriginalAccount").length);
    expect(result.metadataSha256).to.match(/^[a-f0-9]{64}$/);
    expect(result.palletOrStorageNameHints).to.deep.equal({
      revive: true,
      addressSuffix: true,
      originalAccount: true
    });
    expect(result.note).to.match(/only a byte-level hint/);
    expect(() => summarizeRuntimeMetadata("0x123")).to.throw(/even-length hexadecimal/);
    expect(() => summarizeRuntimeMetadata("0x")).to.throw(/non-empty/);
  });

  it("collects chain, finalized block, runtime version and metadata through read-only methods", async function () {
    const result = await inspectSubstrateRuntime({ WebSocketImpl: FakeWebSocket, timeoutMs: 500 });
    expect(result.status).to.equal("ok");
    expect(result.chainName).to.equal("PortalDot V3 testnet fixture");
    expect(result.genesisHash).to.equal("0x" + "cd".repeat(32));
    expect(result.finalizedHead).to.equal("0x" + "ab".repeat(32));
    expect(result.finalizedBlockNumber).to.equal("42");
    expect(result.runtimeVersion.specName).to.equal("portaldot-v3-fixture");
    expect(result.runtimeVersion.specVersion).to.equal(123);
    expect(result.metadata.palletOrStorageNameHints.addressSuffix).to.equal(true);
    expect(result.runtimeMappingConfirmed).to.equal(false);
    expect(result.performedOnlyReadOnlyRpc).to.equal(true);
    expect(result.rpcMethods).not.to.include("author_submitExtrinsic");
    expect(result.rpcMethods).not.to.include("eth_sendRawTransaction");
  });
});
