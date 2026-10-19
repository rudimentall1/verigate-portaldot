import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { expect } = require("chai");
const { evmToSubstrateAccount, encodeSs58AccountId } = require("../scripts/portaldot-address.js");

describe("PortalDot V3 H160 to Substrate account mapping", function () {
  it("matches the published PortalDot fallback-address example", function () {
    const result = evmToSubstrateAccount("0x1807dbE0e8d790e63c4B2a90b9A108AfA14F8547");
    expect(result.accountIdHex).to.equal("0x1807dbe0e8d790e63c4b2a90b9a108afa14f8547eeeeeeeeeeeeeeeeeeeeeeee");
    expect(result.substrateAddress).to.equal("5CcDLjHrfoBeL4NX6ZGQzhBbzCrsS7qwFazkzFcF83pWjq3v");
    expect(result.ss58Prefix).to.equal(42);
  });

  it("normalizes EVM address casing without changing the mapped account", function () {
    const lower = evmToSubstrateAccount("0x1807dbe0e8d790e63c4b2a90b9a108afa14f8547");
    const upperMixed = evmToSubstrateAccount("0x1807dbE0e8d790e63c4B2a90b9A108AfA14F8547");
    expect(lower.accountIdHex).to.equal(upperMixed.accountIdHex);
    expect(lower.substrateAddress).to.equal(upperMixed.substrateAddress);
  });

  it("rejects invalid EVM addresses and unsupported SS58 prefixes", function () {
    expect(() => evmToSubstrateAccount("0x1234")).to.throw(/40 hexadecimal characters/);
    expect(() => evmToSubstrateAccount("0x" + "gg".repeat(20))).to.throw(/40 hexadecimal characters/);
    expect(() => evmToSubstrateAccount("0x" + "11".repeat(20), 64)).to.throw(/prefixes 0 through 63/);
  });

  it("rejects non-32-byte account IDs when encoding SS58", function () {
    expect(() => encodeSs58AccountId(Buffer.alloc(20))).to.throw(/exactly 32 bytes/);
  });
});
