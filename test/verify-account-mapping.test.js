import { expect } from "chai";
import {
  encodeSs58AccountId
} from "../scripts/portaldot-address.js";
import {
  EXPECTED_PORTALDOT_CHAIN_ID,
  validateMappingInputs,
  parseDotJsonValue,
  compareOriginalAccountMapping
} from "../scripts/verify-account-mapping.mjs";

describe("Read-only Revive OriginalAccount verifier", function () {
  const h160 = "0x" + "11".repeat(20);
  const accountOne = encodeSs58AccountId(Buffer.alloc(32, 0x22), 42);
  const accountTwo = encodeSs58AccountId(Buffer.alloc(32, 0x33), 42);

  it("pins the expected PortalDot V3 chain ID and validates the user-supplied addresses", function () {
    expect(EXPECTED_PORTALDOT_CHAIN_ID).to.equal(420420777n);
    const result = validateMappingInputs(h160, accountOne);
    expect(result.h160).to.equal(h160);
    expect(result.ss58Address).to.equal(accountOne);
    expect(result.accountIdHex).to.equal("0x" + Buffer.alloc(32, 0x22).toString("hex"));
    expect(() => validateMappingInputs("0x1234", accountOne)).to.throw(/40 hexadecimal characters/);
    expect(() => validateMappingInputs(h160, "invalid-SS58")).to.throw();
  });

  it("parses plain JSON storage values without coercing them into mappings", function () {
    expect(parseDotJsonValue(JSON.stringify(accountOne))).to.equal(accountOne);
    expect(parseDotJsonValue("null")).to.equal(null);
    expect(parseDotJsonValue(JSON.stringify({ value: accountOne }))).to.equal(accountOne);
    expect(() => parseDotJsonValue("")).to.throw(/is empty/);
    expect(() => parseDotJsonValue("not-json")).to.throw(/not valid JSON/);
  });

  it("confirms only a mapping value that matches the exact AccountId32 bytes", function () {
    const result = compareOriginalAccountMapping({
      rawStorageValue: accountOne,
      h160,
      ss58Address: accountOne
    });
    expect(result.status).to.equal("mapping_matches");
    expect(result.mappingMatchesRegisteredAccount).to.equal(true);
    expect(result.mappingValueAccountIdHex).to.equal("0x" + Buffer.alloc(32, 0x22).toString("hex"));
    expect(result.transactionSubmitted).to.equal(false);
    expect(result.independentNetworkAuthentication).to.equal(false);
  });

  it("does not mistake a different account or missing storage entry for a match", function () {
    const mismatch = compareOriginalAccountMapping({
      rawStorageValue: accountTwo,
      h160,
      ss58Address: accountOne
    });
    expect(mismatch.status).to.equal("mapping_points_to_another_account");
    expect(mismatch.mappingMatchesRegisteredAccount).to.equal(false);

    const missing = compareOriginalAccountMapping({
      rawStorageValue: null,
      h160,
      ss58Address: accountOne
    });
    expect(missing.status).to.equal("no_mapping_entry");
    expect(missing.mappingMatchesRegisteredAccount).to.equal(false);
  });

  it("accepts a hex-encoded AccountId32 value returned by an alternate CLI formatter", function () {
    const bytes = Buffer.alloc(32, 0x44);
    const account = encodeSs58AccountId(bytes, 42);
    const result = compareOriginalAccountMapping({
      rawStorageValue: "0x" + bytes.toString("hex"),
      h160,
      ss58Address: account
    });
    expect(result.status).to.equal("mapping_matches");
  });
});
