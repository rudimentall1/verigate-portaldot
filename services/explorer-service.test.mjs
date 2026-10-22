import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  classifyLookup,
  quantityToInteger,
  initializeDatabase,
  persistBatch,
  createExplorerServer
} from "./explorer-service.mjs";

const hash = (digit) => "0x" + digit.repeat(64);
const address = (digit) => "0x" + digit.repeat(40);

function fakeBlock(number, blockHash, txHash, from = address("a"), to = address("b")) {
  return {
    number: "0x" + number.toString(16),
    hash: blockHash,
    parentHash: hash("0"),
    timestamp: "0x65",
    gasLimit: "0x100000",
    gasUsed: "0x5208",
    transactions: [{
      hash: txHash,
      transactionIndex: "0x0",
      from,
      to,
      value: "0x10",
      input: "0x",
      gas: "0x5208",
      nonce: "0x0"
    }]
  };
}

test("classifies EVM addresses, transaction hashes and decimal block numbers", () => {
  assert.deepEqual(classifyLookup(address("A")), { type: "address", value: address("a") });
  assert.deepEqual(classifyLookup(hash("B")), { type: "hash", value: hash("b") });
  assert.deepEqual(classifyLookup("116872"), { type: "block_number", value: 116872 });
  assert.equal(classifyLookup("0x1234").type, "invalid");
  assert.equal(classifyLookup("999999999999999999999999999").type, "invalid");
});

test("parses canonical JSON-RPC quantities and rejects malformed quantities", () => {
  assert.equal(quantityToInteger("0x0"), 0);
  assert.equal(quantityToInteger("0x190f1ca9"), 420420777);
  assert.throws(() => quantityToInteger("0x00"), /canonical hex quantity/);
  assert.throws(() => quantityToInteger("42"), /canonical hex quantity/);
});

test("persists blocks, transactions, logs and cursor atomically", () => {
  const db = new DatabaseSync(":memory:");
  try {
    initializeDatabase(db);
    const blockHash = hash("1");
    const txHash = hash("2");
    const topic0 = hash("3");
    const block = fakeBlock(1, blockHash, txHash);
    const log = {
      blockNumber: "0x1",
      blockHash,
      transactionHash: txHash,
      logIndex: "0x0",
      address: address("c"),
      topics: [topic0],
      data: "0x1234",
      removed: false
    };
    persistBatch(db, {
      blocks: [block], logs: [log], startBlock: 1, endBlock: 1,
      blockErrors: [], logsError: null, advanceCursor: true
    });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM blocks").get().n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM transactions").get().n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM logs").get().n, 1);
    assert.equal(db.prepare("SELECT state_value FROM indexer_state WHERE state_key='cursor'").get().state_value, "1");
    assert.equal(db.prepare("SELECT from_address FROM transactions WHERE tx_hash=?").get(txHash).from_address, address("a"));
    assert.equal(db.prepare("SELECT topic0 FROM logs WHERE tx_hash=?").get(txHash).topic0, topic0);
  } finally {
    db.close();
  }
});

test("replacing a block after a reorg removes stale transaction and log rows", () => {
  const db = new DatabaseSync(":memory:");
  try {
    initializeDatabase(db);
    const oldBlockHash = hash("1");
    const oldTxHash = hash("2");
    const oldLog = {
      blockNumber: "0x1", blockHash: oldBlockHash, transactionHash: oldTxHash,
      logIndex: "0x0", address: address("c"), topics: [hash("3")], data: "0x"
    };
    persistBatch(db, {
      blocks: [fakeBlock(1, oldBlockHash, oldTxHash)], logs: [oldLog],
      startBlock: 1, endBlock: 1, blockErrors: [], logsError: null
    });
    const newBlockHash = hash("4");
    const newTxHash = hash("5");
    persistBatch(db, {
      blocks: [fakeBlock(1, newBlockHash, newTxHash)], logs: [],
      startBlock: 1, endBlock: 1, blockErrors: [], logsError: null
    });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE tx_hash=?").get(oldTxHash).n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE tx_hash=?").get(newTxHash).n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM logs WHERE block_number=1").get().n, 0);
    assert.equal(db.prepare("SELECT block_hash FROM blocks WHERE block_number=1").get().block_hash, newBlockHash);
  } finally {
    db.close();
  }
});

test("read-only HTTP API exposes health and evidence, rejects non-GET writes", async () => {
  const db = new DatabaseSync(":memory:");
  initializeDatabase(db);
  const { server } = await createExplorerServer({ db, runtime: { lastRpcError: null, lastHead: null, stopping: false } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const health = await fetch(base + "/health");
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);

    const evidence = await fetch(base + "/api/known-evidence");
    assert.equal(evidence.status, 200);
    const items = await evidence.json();
    assert.equal(items.length, 2);
    assert.equal(items[0].recordedBlock, 116872);

    const write = await fetch(base + "/api/known-evidence", { method: "POST" });
    assert.equal(write.status, 405);

    const badOrigin = await fetch(base + "/api/known-evidence", { headers: { origin: "https://untrusted.invalid" } });
    assert.equal(badOrigin.status, 403);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  }
});
