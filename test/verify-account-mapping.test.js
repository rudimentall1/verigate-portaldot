import { expect } from "chai";
import {
  encodeSs58AccountId
} from "../scripts/portaldot-address.js";
import {
  EXPECTED_PORTALDOT_CHAIN_ID,
  validateMappingInputs,
  parseDotJsonValue,
  compareOriginalAccountMapping,
  verifyOriginalAccountMapping
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
    expect(parseDotJsonValue("undefined")).to.equal(null);
    expect(parseDotJsonValue("chain: portaldot-v3\n\nundefined")).to.equal(null);
    expect(parseDotJsonValue("chain: portaldot-v3\n\n" + JSON.stringify(accountOne))).to.equal(accountOne);
    expect(parseDotJsonValue("chain: portaldot-v3\n\n" + accountOne)).to.equal(accountOne);
    expect(parseDotJsonValue(JSON.stringify({ value: accountOne }))).to.equal(accountOne);
    expect(() => parseDotJsonValue("")).to.throw(/is empty/);
    expect(() => parseDotJsonValue("not-json")).to.throw(/did not contain valid JSON/);
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
    expect(missing.mappingMatchesRegisteredAccount).to.equal(null);
  });

  it("runs a one-key mapping query after checking the reported V3 runtime and records its finalized block", async function () {
    const calls = [];
    const runtimeSnapshot = {
      status: "ok",
      chainName: "PortalDot test fixture",
      nodeName: "test-node",
      nodeVersion: "test-version",
      runtimeVersion: {
        specName: "portaldot-v3",
        specVersion: 3002,
        implName: "test-node",
        implVersion: 1,
        transactionVersion: 2
      },
      finalizedBlockNumber: "100400",
      finalizedHead: "0x" + "ab".repeat(32),
      genesisHash: "0x" + "cd".repeat(32),
      metadata: {
        metadataBytes: 100,
        metadataSha256: "a".repeat(64)
      }
    };
    const commandRunner = (args, env, label) => {
      calls.push({ args, env, label });
      if (args[0] === "const") return '"420420777"';
      if (args[0] === "query") {
        expect(args).to.include(h160);
        expect(args[0]).to.include("Revive.OriginalAccount");
        expect(args).to.include("--output");
        expect(args).to.include("json");
        expect(args).to.include("--at");
        expect(args).to.include(runtimeSnapshot.finalizedHead);
        return "chain: portaldot-v3\n\n" + JSON.stringify(accountOne);
      }
      return "ok";
    };

    const result = await verifyOriginalAccountMapping({
      h160,
      ss58Address: accountOne,
      runtimeInspector: async ({ rpcUrl }) => {
        expect(rpcUrl).to.equal("wss://test-node-v3.portaldot.dev/");
        return runtimeSnapshot;
      },
      commandRunner
    });

    expect(result.status).to.equal("mapping_matches");
    expect(result.runtimeSnapshot.runtimeVersion.specVersion).to.equal(3002);
    expect(result.runtimeSnapshot.finalizedBlockNumber).to.equal("100400");
    expect(result.reportedChainId).to.equal("420420777");
    expect(result.queryScope).to.equal("one H160 key only");
    expect(result.transactionSubmitted).to.equal(false);
    expect(calls.filter((call) => call.args[0] === "query")).to.have.lengthOf(1);
    expect(calls.some((call) => call.args[0] === "query" && call.args.length === 2)).to.equal(false);
    expect(calls.every((call) => call.env.DOT_NO_UPDATE_CHECK === "1")).to.equal(true);
  });

  it("refuses a different runtime name before running Polkadot CLI commands", async function () {
    let calls = 0;
    let errorMessage = "";
    try {
      await verifyOriginalAccountMapping({
        h160,
        ss58Address: accountOne,
        runtimeInspector: async () => ({
          status: "ok",
          runtimeVersion: { specName: "some-other-chain" }
        }),
        commandRunner: () => {
          calls += 1;
          return "should not run";
        }
      });
    } catch (error) {
      errorMessage = error.message;
    }
    expect(errorMessage).to.match(/expected portaldot-v3/);
    expect(calls).to.equal(0);
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
