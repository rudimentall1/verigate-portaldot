import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { expect } = require("chai");
const {
  evmToSubstrateAccount,
  encodeSs58AccountId,
  decodeSs58AccountId,
  substrateToEvmAddress,
  inspectAccountMapping
} = require("../scripts/portaldot-address.js");

describe("PortalDot account address derivation", function () {
  it("matches the published H160-to-Substrate fallback-address example", function () {
    const result = evmToSubstrateAccount("0x1807dbE0e8d790e63c4B2a90b9A108AfA14F8547");
    expect(result.accountIdHex).to.equal("0x1807dbe0e8d790e63c4b2a90b9a108afa14f8547eeeeeeeeeeeeeeeeeeeeeeee");
    expect(result.substrateAddress).to.equal("5CcDLjHrfoBeL4NX6ZGQzhBbzCrsS7qwFazkzFcF83pWjq3v");
    expect(result.ss58Prefix).to.equal(42);
    expect(result.runtimeMappingConfirmed).to.equal(false);
  });

  it("normalizes EVM address casing without changing the mapped fallback account", function () {
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

describe("SS58 AccountId32 to H160 inspection", function () {
  it("matches the public Polkadot CLI Alice AccountId32-to-H160 vector", function () {
    const result = substrateToEvmAddress("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY");
    expect(result.accountIdHex).to.equal("0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d");
    expect(result.evmAddress).to.equal("0x9621dde636de098b43efb0fa9b61facfe328f99d");
    expect(result.derivation).to.match(/keccak256/);
    expect(result.runtimeMappingConfirmed).to.equal(false);
  });

  it("decodes a known SS58 address and verifies its checksum", function () {
    const result = decodeSs58AccountId("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY");
    expect(result.ss58Prefix).to.equal(42);
    expect(result.accountId.toString("hex")).to.equal("d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d");
  });

  it("rejects an invalid SS58 checksum rather than guessing", function () {
    expect(() => decodeSs58AccountId("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQX"))
      .to.throw(/checksum does not match/);
  });

  it("recovers an H160 from its deterministic fallback AccountId32", function () {
    const fallback = evmToSubstrateAccount("0x1807dbe0e8d790e63c4b2a90b9a108afa14f8547");
    const reverse = substrateToEvmAddress(fallback.substrateAddress);
    expect(reverse.evmAddress).to.equal("0x1807dbe0e8d790e63c4b2a90b9a108afa14f8547");
    expect(reverse.derivation).to.match(/0xEE/);
  });

  it("reports an offline candidate mismatch without claiming the live mapping is disproved", function () {
    const result = inspectAccountMapping(
      "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
      "0x9999999999999999999999999999999999999999"
    );
    expect(result.candidateMatchesOfflineDerivation).to.equal(false);
    expect(result.runtimeMappingConfirmed).to.equal(false);
    expect(result.note).to.match(/different HD-derived EVM key|stateful runtime mapping/);
  });
});
