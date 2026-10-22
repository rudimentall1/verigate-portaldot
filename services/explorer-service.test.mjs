import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Interface } from "ethers";
import {
  classifyLookup,
  quantityToInteger,
  initializeDatabase,
  persistBatch,
  persistSubstrateBatch,
  extractSubstrateAccounts,
  getSubstrateIndexerStatus,
  persistStateSnapshot,
  getLatestStateSnapshot,
  resolveSubstrateMapping,
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


const ss58 = "5" + "A".repeat(46);

function fakeSubstrateBlock(number, blockHash, extrinsicHash, eventAddress = ss58) {
  return {
    number,
    hash: blockHash,
    parentHash: hash("0"),
    stateRoot: hash("1"),
    extrinsicsRoot: hash("2"),
    timestampMs: 1710000000000,
    extrinsics: [{
      index: 0,
      hash: extrinsicHash,
      section: "balances",
      method: "transferKeepAlive",
      signer: eventAddress,
      raw: { method: { section: "balances", method: "transferKeepAlive" }, signer: eventAddress }
    }],
    events: [{
      index: 0,
      extrinsicIndex: 0,
      section: "balances",
      method: "Transfer",
      data: { from: eventAddress, to: "5" + "B".repeat(46), amount: "123" },
      raw: { phase: { applyExtrinsic: 0 }, section: "balances", method: "Transfer" }
    }],
    eventsComplete: true,
    raw: { number, hash: blockHash, timestampMs: 1710000000000, extrinsicCount: 1, eventCount: 1 }
  };
}

test("classifies an SS58-looking address separately from EVM input", () => {
  assert.deepEqual(classifyLookup(ss58), { type: "substrate_address", value: ss58 });
});

test("extracts SS58 account references from nested Substrate event data", () => {
  const other = "5" + "B".repeat(46);
  const found = extractSubstrateAccounts({ from: ss58, nested: [{ to: other }, { text: "not-an-account" }] });
  assert.deepEqual(found.sort(), [ss58, other].sort());
});

test("persists Substrate blocks, extrinsics, events, SS58 references and cursor atomically", () => {
  const db = new DatabaseSync(":memory:");
  try {
    initializeDatabase(db);
    const block = fakeSubstrateBlock(110000, hash("4"), hash("5"));
    persistSubstrateBatch(db, {
      blocks: [block], startBlock: 110000, endBlock: 110000,
      blockErrors: [], eventErrors: [], advanceCursor: true
    });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM substrate_blocks").get().n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM substrate_extrinsics").get().n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM substrate_events").get().n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM substrate_event_accounts WHERE address=?").get(ss58).n, 1);
    assert.equal(db.prepare("SELECT state_value FROM indexer_state WHERE state_key='substrate_cursor'").get().state_value, "110000");
    assert.equal(getSubstrateIndexerStatus(db, {}).indexedThrough, 110000);
  } finally {
    db.close();
  }
});

test("Substrate block replacement removes stale extrinsics, events and address links", () => {
  const db = new DatabaseSync(":memory:");
  try {
    initializeDatabase(db);
    const oldHash = hash("4");
    const oldExtrinsic = hash("5");
    persistSubstrateBatch(db, {
      blocks: [fakeSubstrateBlock(110001, oldHash, oldExtrinsic)],
      startBlock: 110001, endBlock: 110001, blockErrors: [], eventErrors: []
    });
    const newHash = hash("6");
    const newExtrinsic = hash("7");
    const newAddress = "5" + "C".repeat(46);
    persistSubstrateBatch(db, {
      blocks: [fakeSubstrateBlock(110001, newHash, newExtrinsic, newAddress)],
      startBlock: 110001, endBlock: 110001, blockErrors: [], eventErrors: []
    });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM substrate_extrinsics WHERE extrinsic_hash=?").get(oldExtrinsic).n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM substrate_events WHERE block_number=110001").get().n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM substrate_event_accounts WHERE address=?").get(ss58).n, 0);
    assert.equal(db.prepare("SELECT block_hash FROM substrate_blocks WHERE block_number=110001").get().block_hash, newHash);
  } finally {
    db.close();
  }
});

test("records missing Substrate history as a gap and does not claim full coverage", () => {
  const db = new DatabaseSync(":memory:");
  try {
    initializeDatabase(db);
    db.prepare("INSERT INTO indexer_state(state_key,state_value,updated_at) VALUES(?,?,?)").run("substrate_started_from", "110002", new Date().toISOString());
    persistSubstrateBatch(db, {
      blocks: [], startBlock: 110002, endBlock: 110002,
      blockErrors: [{ block: 110002, error: "state pruned" }], eventErrors: [], advanceCursor: true
    });
    const state = getSubstrateIndexerStatus(db, {});
    assert.equal(state.processedThrough, 110002);
    assert.equal(state.indexedThrough, null);
    assert.equal(state.gapCount, 1);
    assert.match(state.gaps[0].error, /state pruned/);
  } finally {
    db.close();
  }
});


test("Substrate HTTP routes expose indexed blocks, extrinsics and events read-only", async () => {
  const db = new DatabaseSync(":memory:");
  initializeDatabase(db);
  db.prepare("INSERT INTO indexer_state(state_key,state_value,updated_at) VALUES(?,?,?)").run("substrate_started_from", "110000", new Date().toISOString());
  persistSubstrateBatch(db, {
    blocks: [fakeSubstrateBlock(110000, hash("8"), hash("9"))],
    startBlock: 110000, endBlock: 110000, blockErrors: [], eventErrors: []
  });
  const runtime = { lastRpcError: null, lastHead: null, stopping: false, substrateConnected: false };
  const { server } = await createExplorerServer({ db, runtime });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const statusResponse = await fetch(base + "/api/substrate/status");
    assert.equal(statusResponse.status, 200);
    const status = await statusResponse.json();
    assert.equal(status.indexedThrough, 110000);
    assert.equal(status.blocksStored, 1);

    const blockResponse = await fetch(base + "/api/substrate/block/110000");
    assert.equal(blockResponse.status, 200);
    const block = await blockResponse.json();
    assert.equal(block.source, "substrate_indexer");
    assert.equal(block.extrinsics[0].hash, hash("9"));
    assert.equal(block.events[0].method, "Transfer");

    const eventsResponse = await fetch(base + "/api/substrate/events?limit=5");
    assert.equal(eventsResponse.status, 200);
    const events = await eventsResponse.json();
    assert.equal(events.items.length, 1);
    assert.equal(events.items[0].section, "balances");

    const extrinsicResponse = await fetch(base + "/api/substrate/extrinsic/" + hash("9"));
    assert.equal(extrinsicResponse.status, 200);
    const extrinsic = await extrinsicResponse.json();
    assert.equal(extrinsic.source, "substrate_indexer");
    assert.equal(extrinsic.signer, ss58);

    const write = await fetch(base + "/api/substrate/events", { method: "POST" });
    assert.equal(write.status, 405);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  }
});


test("ABI registry decodes stored contract logs and protects resync/delete with one-time tokens", async () => {
  const db = new DatabaseSync(":memory:");
  initializeDatabase(db);
  const contractAddress = address("c");
  const fromAddress = address("a");
  const toAddress = address("b");
  const blockHash = hash("8");
  const txHash = hash("9");
  const abi = [{
    type: "event",
    name: "Transfer",
    anonymous: false,
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false }
    ]
  }];
  const iface = new Interface(abi);
  const encoded = iface.encodeEventLog(iface.getEvent("Transfer"), [fromAddress, toAddress, 123n]);
  const rawLog = {
    address: contractAddress,
    blockNumber: "0x1",
    blockHash,
    transactionHash: txHash,
    transactionIndex: "0x0",
    logIndex: "0x0",
    topics: encoded.topics,
    data: encoded.data,
    removed: false
  };
  persistBatch(db, {
    blocks: [fakeBlock(1, blockHash, txHash, fromAddress, toAddress)],
    logs: [rawLog], startBlock: 1, endBlock: 1, blockErrors: [], logsError: null
  });
  const runtime = { lastRpcError: null, lastHead: null, stopping: false, substrateConnected: false };
  const { server } = await createExplorerServer({ db, runtime });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  let managerToken = "";
  let slug = "";
  try {
    const registration = await fetch(base + "/api/contracts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Example Token", address: contractAddress, abi })
    });
    assert.equal(registration.status, 201);
    const created = await registration.json();
    assert.match(created.slug, /^example-token-/);
    assert.match(created.manage_token, /^[a-f0-9]{64}$/);
    managerToken = created.manage_token;
    slug = created.slug;

    const detailsResponse = await fetch(base + "/api/contracts/" + slug);
    assert.equal(detailsResponse.status, 200);
    const details = await detailsResponse.json();
    assert.equal(details.event_count, 1);
    assert.equal(details.events[0].name, "Transfer");

    const eventsResponse = await fetch(base + "/api/contracts/" + slug + "/events?name=Transfer");
    assert.equal(eventsResponse.status, 200);
    const events = await eventsResponse.json();
    assert.equal(events.items.length, 1);
    assert.equal(events.items[0].event_name, "Transfer");
    assert.equal(events.items[0].args.value, "123");
    assert.equal(events.items[0].args.from.toLowerCase(), fromAddress.toLowerCase());

    const noToken = await fetch(base + "/api/contracts/" + slug, { method: "DELETE" });
    assert.equal(noToken.status, 403);

    const resync = await fetch(base + "/api/contracts/" + slug + "/resync", {
      method: "POST",
      headers: { authorization: "Bearer " + managerToken }
    });
    assert.equal(resync.status, 200);
    const resyncResult = await resync.json();
    assert.equal(resyncResult.event_count, 1);

    const deleteResult = await fetch(base + "/api/contracts/" + slug, {
      method: "DELETE",
      headers: { authorization: "Bearer " + managerToken }
    });
    assert.equal(deleteResult.status, 200);
    assert.equal((await deleteResult.json()).deleted, true);
    const missing = await fetch(base + "/api/contracts/" + slug);
    assert.equal(missing.status, 404);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  }
});


test("finalized state snapshots persist native balances, asset holders, NFT owners and are served through read-only routes", async () => {
  const db = new DatabaseSync(":memory:");
  initializeDatabase(db);
  const now = new Date().toISOString();
  const rich = "5" + "A".repeat(46);
  const other = "5" + "B".repeat(46);
  persistStateSnapshot(db, {
    block: 120000,
    startedAt: now,
    capturedAt: now,
    nativeSymbol: "tPOT",
    nativeDecimals: 14,
    nativeBalances: [
      { address: rich, free: "900000000000000", reserved: "100", frozen: "0", nonce: "2", raw: { nonce: "2" } },
      { address: other, free: "90000000000000", reserved: "0", frozen: "0", nonce: "0", raw: { nonce: "0" } }
    ],
    assets: [
      { assetId: "7", name: "Example Asset", symbol: "EXA", decimals: 12, supply: "1000", owner: rich, raw: { symbol: "EXA" } }
    ],
    assetHolders: [
      { assetId: "7", address: rich, balance: "500", status: "Liquid", raw: { balance: "500" } },
      { assetId: "7", address: other, balance: "100", status: "Liquid", raw: { balance: "100" } }
    ],
    nftOwners: [
      { pallet: "nfts", collectionId: "4", itemId: "12", owner: rich, raw: { item: "12" } },
      { pallet: "uniques", collectionId: "2", itemId: "9", owner: other, raw: { item: "9" } }
    ]
  });
  const snapshot = getLatestStateSnapshot(db);
  assert.equal(snapshot.block, 120000);
  assert.equal(snapshot.nativeSymbol, "tPOT");
  assert.equal(snapshot.nativeAccounts, 2);
  assert.equal(snapshot.assetCount, 1);
  assert.equal(snapshot.assetHolderCount, 2);
  assert.equal(snapshot.nftCount, 2);

  const { server } = await createExplorerServer({
    db, runtime: { lastRpcError: null, lastHead: null, stopping: false, substrateConnected: false }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const balances = await (await fetch(base + "/api/substrate/balances?limit=5")).json();
    assert.equal(balances.snapshot.block, 120000);
    assert.equal(balances.items[0].address, rich);
    assert.equal(balances.items[0].free, "900000000000000");

    const assets = await (await fetch(base + "/api/substrate/assets")).json();
    assert.equal(assets.items.length, 1);
    assert.equal(assets.items[0].symbol, "EXA");

    const holders = await (await fetch(base + "/api/substrate/assets/7/holders")).json();
    assert.equal(holders.items.length, 2);
    assert.equal(holders.items[0].balance, "500");

    const nfts = await (await fetch(base + "/api/substrate/nfts?owner=" + rich)).json();
    assert.equal(nfts.items.length, 1);
    assert.equal(nfts.items[0].collectionId, "4");

    const snapshotStatus = await (await fetch(base + "/api/substrate/state-snapshot")).json();
    assert.equal(snapshotStatus.latest.block, 120000);
    assert.equal(snapshotStatus.latest.status, "complete");

    const mutation = await fetch(base + "/api/substrate/balances", { method: "POST" });
    assert.equal(mutation.status, 405);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  }
});


test("runtime address mapping uses reviveApi results and keeps a missing mapping explicit", async () => {
  const evm = address("e");
  const native = "5" + "D".repeat(46);
  const accountHex = "0x" + "a".repeat(64);
  const mappedAccount = { toString: () => native, toHex: () => accountHex };
  const mappedEvm = { toHex: () => evm };
  const runtime = {
    substrateConnected: true,
    substrateGenesisHash: hash("f"),
    substrateApi: {
      runtimeVersion: { specVersion: { toString: () => "3002" } },
      call: {
        reviveApi: {
          accountId: async (input) => ({ isNone: false, unwrap: () => mappedAccount }),
          address: async (input) => ({ isSome: true, unwrap: () => mappedEvm })
        }
      }
    }
  };
  const forward = await resolveSubstrateMapping(runtime, evm);
  assert.equal(forward.status, "mapped");
  assert.equal(forward.queryType, "evm_to_native");
  assert.equal(forward.evmAddress, evm);
  assert.equal(forward.ss58Address, native);
  assert.equal(forward.accountIdHex, accountHex);
  assert.equal(forward.runtimeMappingConfirmed, true);

  const reverse = await resolveSubstrateMapping(runtime, native);
  assert.equal(reverse.status, "mapped");
  assert.equal(reverse.queryType, "native_to_evm");
  assert.equal(reverse.evmAddress, evm);
  assert.equal(reverse.ss58Address, native);
  assert.equal(reverse.runtimeMappingConfirmed, true);

  runtime.substrateApi.call.reviveApi.accountId = async () => ({ isNone: true, unwrap: () => { throw new Error("None has no value"); } });
  const missing = await resolveSubstrateMapping(runtime, evm);
  assert.equal(missing.status, "not_found");
  assert.equal(missing.runtimeMappingConfirmed, false);
  assert.match(missing.note, /No offline-derived mapping/);
});

test("runtime address mapping HTTP route is read-only", async () => {
  const db = new DatabaseSync(":memory:");
  initializeDatabase(db);
  const evm = address("e");
  const native = "5" + "D".repeat(46);
  const runtime = {
    substrateConnected: true,
    substrateGenesisHash: hash("f"),
    substrateApi: {
      runtimeVersion: { specVersion: { toString: () => "3002" } },
      call: { reviveApi: { accountId: async () => ({ isSome: true, unwrap: () => ({ toString: () => native, toHex: () => "0x" + "a".repeat(64) }) }) } }
    }
  };
  const { server } = await createExplorerServer({ db, runtime });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const response = await fetch(base + "/api/substrate/mapping?q=" + evm);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.status, "mapped");
    assert.equal(result.ss58Address, native);
    const write = await fetch(base + "/api/substrate/mapping?q=" + evm, { method: "POST" });
    assert.equal(write.status, 405);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  }
});
