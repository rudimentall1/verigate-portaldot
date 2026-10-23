import test from "node:test";
import assert from "node:assert/strict";
import {
  NETWORK,
  PUBLIC_SURFACES,
  MAINNET_EVM_IDENTITY,
  aggregateStatus,
  classifySurfaceHttp,
  evaluateEvmSnapshot,
  evaluateSubstrateSnapshot,
  exitCodeForReport,
  parseQuantity,
} from "./portal-dot-readiness.mjs";

const HASH_A = "0x" + "a".repeat(64);
const HASH_B = "0x" + "b".repeat(64);

function evmSnapshot(overrides = {}) {
  return {
    expectedChainId: NETWORK.chainId,
    chainId: NETWORK.chainId,
    blockNumber: 123n,
    latestBlock: { number: "0x7b", hash: HASH_A, timestamp: "0x6718a800" },
    ...overrides,
  };
}

function substrateSnapshot(overrides = {}) {
  return {
    expectedGenesisHash: NETWORK.substrateGenesisHash,
    genesisHash: NETWORK.substrateGenesisHash,
    finalizedHead: HASH_A,
    finalizedHeader: { number: "0x190f6" },
    chainName: "PortalDotV3 Test",
    nodeVersion: "3.0.0-test",
    runtimeVersion: { specName: "portaldot-v3", specVersion: 3002, transactionVersion: 2 },
    health: { peers: 5, isSyncing: false },
    ...overrides,
  };
}

test("EVM report checks the expected testnet chain ID and internally consistent latest block", () => {
  const result = evaluateEvmSnapshot(evmSnapshot());
  assert.equal(result.status, "ok");
  assert.equal(result.chainIdMatches, true);
  assert.equal(result.latestBlockNumber, "123");
  assert.equal(result.latestBlockHash, HASH_A);
});

test("EVM report fails closed on an unexpected chain ID", () => {
  const result = evaluateEvmSnapshot(evmSnapshot({ chainId: 1n }));
  assert.equal(result.status, "fail");
  assert.equal(result.chainIdMatches, false);
  assert.equal(result.expectedChainId, "420420777");
  assert.equal(result.actualChainId, "1");
});

test("EVM report rejects block-number disagreement and malformed hashes", () => {
  assert.throws(
    () => evaluateEvmSnapshot(evmSnapshot({
      latestBlock: { ...evmSnapshot().latestBlock, number: "0x7a" },
    })),
    /disagree/,
  );
  assert.throws(
    () => evaluateEvmSnapshot(evmSnapshot({
      latestBlock: { ...evmSnapshot().latestBlock, hash: "0x1234" },
    })),
    /hash is invalid/,
  );
});

test("quantity parser rejects non-canonical and non-hex values", () => {
  assert.equal(parseQuantity("0x0", "q"), 0n);
  assert.equal(parseQuantity("0x7b", "q"), 123n);
  for (const bad of ["123", "0x", "0x00", "0xgg", null]) {
    assert.throws(() => parseQuantity(bad, "q"));
  }
});

test("Substrate report records pinned genesis, finalized block, runtime and health", () => {
  const result = evaluateSubstrateSnapshot(substrateSnapshot());
  assert.equal(result.status, "ok");
  assert.equal(result.genesisHashMatches, true);
  assert.equal(result.finalizedBlockNumber, "102646");
  assert.equal(result.runtime.specName, "portaldot-v3");
  assert.equal(result.runtime.specVersion, 3002);
  assert.equal(result.health.peers, 5);
});

test("Substrate genesis mismatch is a hard failure even with a healthy node", () => {
  const result = evaluateSubstrateSnapshot(substrateSnapshot({ genesisHash: HASH_B }));
  assert.equal(result.status, "fail");
  assert.equal(result.genesisHashMatches, false);
});

test("Substrate health warnings do not hide the observed runtime identity", () => {
  const result = evaluateSubstrateSnapshot(substrateSnapshot({
    health: { peers: 0, isSyncing: true },
  }));
  assert.equal(result.status, "warning");
  assert.deepEqual(result.warnings, ["node reports zero peers", "node reports that it is syncing"]);
});

test("Substrate malformed finalized block and incomplete runtime are rejected", () => {
  assert.throws(
    () => evaluateSubstrateSnapshot(substrateSnapshot({ finalizedHeader: { number: "latest" } })),
    /canonical hexadecimal quantity/,
  );
  assert.throws(
    () => evaluateSubstrateSnapshot(substrateSnapshot({ runtimeVersion: {} })),
    /incomplete/,
  );
});

test("public surfaces distinguish success, client-side denial, and server failure", () => {
  assert.equal(classifySurfaceHttp(200), "ok");
  assert.equal(classifySurfaceHttp(302), "ok");
  assert.equal(classifySurfaceHttp(403), "warning");
  assert.equal(classifySurfaceHttp(503), "fail");
  assert.equal(classifySurfaceHttp(0), "fail");
});

test("overall status and exit codes preserve warning vs failure distinction", () => {
  assert.equal(aggregateStatus([{ status: "ok" }, { status: "ok" }]), "PASS");
  assert.equal(aggregateStatus([{ status: "ok" }, { status: "warning" }]), "DEGRADED");
  assert.equal(aggregateStatus([{ status: "warning" }, { status: "fail" }]), "FAIL");
  assert.equal(exitCodeForReport({ overallStatus: "PASS" }), 0);
  assert.equal(exitCodeForReport({ overallStatus: "DEGRADED" }), 1);
  assert.equal(exitCodeForReport({ overallStatus: "FAIL" }), 2);
});

test("the report surface inventory includes the announced explorers, node console and bridge", () => {
  assert.deepEqual(PUBLIC_SURFACES.map(({ name }) => name), [
    "Mainnet V3 explorer",
    "Testnet V3 explorer",
    "PortalDot Node Console",
    "PortalDot bridge",
  ]);
  assert.equal(NETWORK.chainId.toString(), "420420777");
});

test("Mainnet EVM identity stays explicitly unconfigured until PortalDot publishes parameters", () => {
  assert.equal(MAINNET_EVM_IDENTITY.status, "not_configured");
  assert.equal(MAINNET_EVM_IDENTITY.rpcUrl, null);
  assert.equal(MAINNET_EVM_IDENTITY.chainId, null);
  assert.match(MAINNET_EVM_IDENTITY.reason, /not inferred/);
});
