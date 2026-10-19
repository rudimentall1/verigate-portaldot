import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { expect } = require("chai");
const { verifyWithVerigate } = require("../adapter/verigate-bridge");

describe("Verigate verifier transport hardening", function () {
  const attestation = {
    algorithm: "Ed25519",
    signature: Buffer.alloc(64, 1).toString("base64"),
    payload: { intent_id: "transport-test" }
  };
  const originalFetch = global.fetch;

  afterEach(function () {
    global.fetch = originalFetch;
  });

  it("disables redirects so API credentials cannot be forwarded to a redirect target", async function () {
    let requestOptions;
    global.fetch = async (_url, options) => {
      requestOptions = options;
      // Simulate the runtime behavior when redirect:error encounters a 3xx.
      if (options.redirect === "error") throw new TypeError("redirect mode is error");
      return { ok: true, status: 200, json: async () => ({ valid: true }) };
    };

    let caught;
    try {
      await verifyWithVerigate("https://verigate.example", attestation, "disposable-api-key");
    } catch (error) {
      caught = error;
    }
    expect(requestOptions.redirect).to.equal("error");
    expect(requestOptions.headers["x-api-key"]).to.equal("disposable-api-key");
    expect(caught).to.be.instanceOf(TypeError);
    expect(caught.message).to.match(/redirect mode is error/);
  });

  it("rejects a remote verifier URL using plain HTTP before sending credentials", async function () {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => ({ valid: true }) };
    };

    let caught;
    try {
      await verifyWithVerigate("http://verigate.example", attestation, "disposable-api-key");
    } catch (error) {
      caught = error;
    }
    expect(caught).to.be.instanceOf(Error);
    expect(caught.message).to.match(/must use HTTPS/);
    expect(calls).to.equal(0);
  });

  it("rejects verifier URLs containing embedded credentials before sending a request", async function () {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => ({ valid: true }) };
    };

    let caught;
    try {
      await verifyWithVerigate("https://user:password@verigate.example", attestation, "disposable-api-key");
    } catch (error) {
      caught = error;
    }
    expect(caught).to.be.instanceOf(Error);
    expect(caught.message).to.match(/must not embed credentials/);
    expect(calls).to.equal(0);
  });

  it("fails closed on malformed verifier JSON", async function () {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError("invalid JSON"); }
    });

    let caught;
    try {
      await verifyWithVerigate("https://verigate.example", attestation, "");
    } catch (error) {
      caught = error;
    }
    expect(caught).to.be.instanceOf(SyntaxError);
    expect(caught.message).to.equal("invalid JSON");
  });

  it("fails closed when the verifier returns a non-success HTTP status", async function () {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return { ok: false, status: 503, json: async () => ({ valid: true }) };
    };

    let caught;
    try {
      await verifyWithVerigate("https://verigate.example", attestation, "");
    } catch (error) {
      caught = error;
    }
    expect(caught).to.be.instanceOf(Error);
    expect(caught.message).to.match(/HTTP 503/);
    expect(calls).to.equal(1);
  });
});
