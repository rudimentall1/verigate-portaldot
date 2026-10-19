import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { expect } = require("chai");
const { verifyWithVerigate } = require("../adapter/verigate-bridge");

describe("Verigate verifier response validation", function () {
  const originalFetch = global.fetch;

  afterEach(function () {
    global.fetch = originalFetch;
  });

  for (const result of [
    { valid: false, reason: "signature invalid" },
    { valid: "true" },
    { valid: 1 },
    {},
    null
  ]) {
    it(`rejects a verifier response that is not the literal boolean true (${JSON.stringify(result)})`, async function () {
      global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => result
      });

      let caught;
      try {
        await verifyWithVerigate("https://verigate.example", {
          algorithm: "Ed25519",
          signature: Buffer.alloc(64, 2).toString("base64"),
          payload: { intent_id: "strict-response-test" }
        }, "");
      } catch (error) {
        caught = error;
      }
      expect(caught).to.be.instanceOf(Error);
      expect(caught.message).to.match(/was not validated/);
    });
  }
});
