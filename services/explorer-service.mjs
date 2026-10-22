import http from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Interface } from "ethers";
import { ApiPromise, WsProvider } from "@polkadot/api";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const RPC_URL = (process.env.PORTALDOT_RPC_URL || "https://test-evm-rpc-v3.portaldot.dev").trim();
const EXPECTED_CHAIN_ID = BigInt((process.env.PORTALDOT_CHAIN_ID || "420420777").trim());
const PORT = Number(process.env.PORT || "10000");
const DB_PATH = resolve(process.env.EXPLORER_DB_PATH || resolve(ROOT, "data/portal-dot-explorer.sqlite"));
const START_BLOCK_ENV = (process.env.EXPLORER_START_BLOCK || "").trim();
const BACKFILL_BLOCKS = positiveInteger(process.env.EXPLORER_BACKFILL_BLOCKS, 30000, 1, 2000000);
const BATCH_BLOCKS = positiveInteger(process.env.EXPLORER_BATCH_BLOCKS, 20, 1, 100);
const POLL_MS = positiveInteger(process.env.EXPLORER_POLL_MS, 6000, 1000, 120000);
const CONFIRMATIONS = positiveInteger(process.env.EXPLORER_CONFIRMATIONS, 6, 0, 1000);
const GAP_RETRY_CYCLES = positiveInteger(process.env.EXPLORER_GAP_RETRY_CYCLES, 20, 1, 10000);
const ALLOWED_ORIGINS = new Set(
  (process.env.EXPLORER_ALLOWED_ORIGINS || "https://rudimentall1.github.io,http://localhost:4173,http://127.0.0.1:4173")
    .split(",").map((item) => item.trim()).filter(Boolean)
);
const DEPLOY_TX = "0xb1cf9cca75bb029b0a723f13c398479d2c18704c1138c02c6d92a02c1fcdce3c";
const TRANSFER_TX = "0x21acff99d30652161f7e4ba6e1d76e6b6b67e8b9e02b09edd64d8bd7f2d5dd9c";
const GUARD = "0x3f2f484484fbE6e224d058fDfDB6B5A14F09655b";
const KNOWN_EVIDENCE = [
  {
    transactionHash: DEPLOY_TX,
    label: "PortalDotAgentGuard V1 deployment",
    recordedBlock: 116872,
    contractAddress: GUARD,
    provenance: "Project deployment record; saved receipt was successful when queried. The current RPC may no longer serve this historical transaction."
  },
  {
    transactionHash: TRANSFER_TX,
    label: "PortalDotAgentGuard V1 TransferExecuted",
    recordedBlock: 132475,
    eventName: "TransferExecuted",
    receiptStatus: "0x1",
    provenance: "Project record of a successful 0.1 POT testnet transfer and matching event. A later RPC lookup did not return the historical receipt."
  }
];

function positiveInteger(value, fallback, min, max) {
  if (value == null || value === "") return fallback;
  if (!/^[0-9]+$/.test(String(value))) throw new Error("Expected a positive integer configuration value.");
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error("Integer configuration value is outside its allowed range.");
  return n;
}

function rpcOrigin(value) {
  const url = new URL(value);
  if (url.username || url.password) throw new Error("RPC URL must not contain credentials.");
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("RPC URL must use HTTPS or HTTP.");
  if (url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("Remote RPC endpoints must use HTTPS.");
  }
  return url.origin;
}

const RPC_ORIGIN = rpcOrigin(RPC_URL);
const SUBSTRATE_WS_URL = (process.env.PORTALDOT_SUBSTRATE_RPC_URL || "wss://test-node-v3.portaldot.dev").trim();
const EXPECTED_SUBSTRATE_GENESIS_HASH = (process.env.PORTALDOT_SUBSTRATE_GENESIS_HASH || "").trim().toLowerCase();
const SUBSTRATE_START_BLOCK_ENV = (process.env.SUBSTRATE_START_BLOCK || "").trim();
const SUBSTRATE_BACKFILL_BLOCKS = positiveInteger(process.env.SUBSTRATE_BACKFILL_BLOCKS, 30000, 1, 2000000);
const SUBSTRATE_BATCH_BLOCKS = positiveInteger(process.env.SUBSTRATE_BATCH_BLOCKS, 10, 1, 50);
const SUBSTRATE_ACCOUNT_RE = /^[1-9A-HJ-NP-Za-km-z]{46,50}$/;

export function classifyLookup(input) {
  const value = String(input || "").trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(value)) return { type: "address", value: value.toLowerCase() };
  if (SUBSTRATE_ACCOUNT_RE.test(value)) return { type: "substrate_address", value };
  if (/^0x[0-9a-fA-F]{64}$/.test(value)) return { type: "hash", value: value.toLowerCase() };
  if (/^(0|[1-9][0-9]*)$/.test(value)) {
    const number = Number(value);
    if (Number.isSafeInteger(number)) return { type: "block_number", value: number };
  }
  return { type: "invalid", value };
}

export function quantityToInteger(value) {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)) {
    throw new Error("Expected a canonical hex quantity.");
  }
  const n = BigInt(value);
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Quantity exceeds the safe integer range.");
  return Number(n);
}

export function initializeDatabase(db) {
  db.exec(
    "PRAGMA journal_mode = WAL;\n" +
    "PRAGMA synchronous = NORMAL;\n" +
    "PRAGMA foreign_keys = ON;\n" +
    "CREATE TABLE IF NOT EXISTS blocks (block_number INTEGER PRIMARY KEY,block_hash TEXT NOT NULL,parent_hash TEXT,block_timestamp INTEGER,transaction_count INTEGER NOT NULL DEFAULT 0,raw_json TEXT NOT NULL,indexed_at TEXT NOT NULL);\n" +
    "CREATE UNIQUE INDEX IF NOT EXISTS blocks_hash_idx ON blocks(block_hash);\n" +
    "CREATE TABLE IF NOT EXISTS transactions (tx_hash TEXT PRIMARY KEY,block_number INTEGER NOT NULL,tx_index INTEGER,from_address TEXT,to_address TEXT,value_hex TEXT,input_data TEXT,raw_json TEXT NOT NULL,indexed_at TEXT NOT NULL);\n" +
    "CREATE INDEX IF NOT EXISTS transactions_block_idx ON transactions(block_number, tx_index);\n" +
    "CREATE INDEX IF NOT EXISTS transactions_from_idx ON transactions(from_address, block_number DESC);\n" +
    "CREATE INDEX IF NOT EXISTS transactions_to_idx ON transactions(to_address, block_number DESC);\n" +
    "CREATE TABLE IF NOT EXISTS logs (block_number INTEGER NOT NULL,log_index INTEGER NOT NULL,tx_hash TEXT,contract_address TEXT,topic0 TEXT,topic1 TEXT,topic2 TEXT,topic3 TEXT,data TEXT,raw_json TEXT NOT NULL,indexed_at TEXT NOT NULL,PRIMARY KEY(block_number,log_index));\n" +
    "CREATE INDEX IF NOT EXISTS logs_tx_idx ON logs(tx_hash);\n" +
    "CREATE INDEX IF NOT EXISTS logs_address_idx ON logs(contract_address, block_number DESC);\n" +
    "CREATE INDEX IF NOT EXISTS logs_topic0_idx ON logs(topic0, block_number DESC);\n" +
    "CREATE TABLE IF NOT EXISTS registered_contracts (slug TEXT PRIMARY KEY,address TEXT NOT NULL,name TEXT,abi_json TEXT NOT NULL,manager_token_hash TEXT NOT NULL,registered_at TEXT NOT NULL,indexed_from_block INTEGER,last_decoded_block INTEGER,event_count INTEGER NOT NULL DEFAULT 0,decode_error TEXT);\n" +
    "CREATE INDEX IF NOT EXISTS registered_contracts_address_idx ON registered_contracts(address);\n" +
    "CREATE TABLE IF NOT EXISTS decoded_contract_events (slug TEXT NOT NULL,block_number INTEGER NOT NULL,log_index INTEGER NOT NULL,tx_hash TEXT,event_name TEXT NOT NULL,event_signature TEXT NOT NULL,args_json TEXT NOT NULL,raw_json TEXT NOT NULL,decoded_at TEXT NOT NULL,PRIMARY KEY(slug,block_number,log_index));\n" +
    "CREATE INDEX IF NOT EXISTS decoded_events_name_idx ON decoded_contract_events(slug,event_name,block_number DESC);\n" +
    "CREATE INDEX IF NOT EXISTS decoded_events_tx_idx ON decoded_contract_events(tx_hash);\n" +
    "CREATE TABLE IF NOT EXISTS indexer_state (state_key TEXT PRIMARY KEY,state_value TEXT NOT NULL,updated_at TEXT NOT NULL);\n" +
    "CREATE TABLE IF NOT EXISTS indexer_gaps (component TEXT NOT NULL,start_block INTEGER NOT NULL,end_block INTEGER NOT NULL,error_message TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL,PRIMARY KEY(component,start_block,end_block));" +
    "CREATE TABLE IF NOT EXISTS substrate_blocks (block_number INTEGER PRIMARY KEY,block_hash TEXT NOT NULL,parent_hash TEXT,state_root TEXT,extrinsics_root TEXT,timestamp_ms TEXT,extrinsic_count INTEGER NOT NULL DEFAULT 0,event_count INTEGER NOT NULL DEFAULT 0,raw_json TEXT NOT NULL,indexed_at TEXT NOT NULL);" +
    "CREATE UNIQUE INDEX IF NOT EXISTS substrate_blocks_hash_idx ON substrate_blocks(block_hash);" +
    "CREATE TABLE IF NOT EXISTS substrate_extrinsics (block_number INTEGER NOT NULL,extrinsic_index INTEGER NOT NULL,extrinsic_hash TEXT NOT NULL,section TEXT,method TEXT,signer TEXT,raw_json TEXT NOT NULL,indexed_at TEXT NOT NULL,PRIMARY KEY(block_number,extrinsic_index));" +
    "CREATE INDEX IF NOT EXISTS substrate_extrinsics_hash_idx ON substrate_extrinsics(extrinsic_hash);" +
    "CREATE INDEX IF NOT EXISTS substrate_extrinsics_signer_idx ON substrate_extrinsics(signer,block_number DESC);" +
    "CREATE TABLE IF NOT EXISTS substrate_events (block_number INTEGER NOT NULL,event_index INTEGER NOT NULL,extrinsic_index INTEGER,section TEXT NOT NULL,method TEXT NOT NULL,data_json TEXT NOT NULL,raw_json TEXT NOT NULL,indexed_at TEXT NOT NULL,PRIMARY KEY(block_number,event_index));" +
    "CREATE INDEX IF NOT EXISTS substrate_events_section_idx ON substrate_events(section,block_number DESC,event_index DESC);" +
    "CREATE INDEX IF NOT EXISTS substrate_events_method_idx ON substrate_events(method,block_number DESC,event_index DESC);" +
    "CREATE TABLE IF NOT EXISTS substrate_event_accounts (block_number INTEGER NOT NULL,event_index INTEGER NOT NULL,address TEXT NOT NULL,PRIMARY KEY(block_number,event_index,address));" +
    "CREATE INDEX IF NOT EXISTS substrate_event_accounts_address_idx ON substrate_event_accounts(address,block_number DESC,event_index DESC);"
  );
}

function upsertState(db, key, value) {
  db.prepare("INSERT INTO indexer_state(state_key,state_value,updated_at) VALUES(?,?,?) ON CONFLICT(state_key) DO UPDATE SET state_value=excluded.state_value,updated_at=excluded.updated_at")
    .run(key, String(value), new Date().toISOString());
}

function readState(db, key) {
  return db.prepare("SELECT state_value FROM indexer_state WHERE state_key=?").get(key)?.state_value ?? null;
}

function addGap(db, component, start, end, error) {
  db.prepare(
    "INSERT INTO indexer_gaps(component,start_block,end_block,error_message,attempts,updated_at) VALUES(?,?,?,?,1,?) " +
    "ON CONFLICT(component,start_block,end_block) DO UPDATE SET error_message=excluded.error_message,attempts=indexer_gaps.attempts+1,updated_at=excluded.updated_at"
  ).run(component, start, end, String(error).slice(0, 800), new Date().toISOString());
}

function deleteGap(db, component, start, end) {
  db.prepare("DELETE FROM indexer_gaps WHERE component=? AND start_block=? AND end_block=?").run(component, start, end);
}

function blockNumberFromHex(hex) {
  return quantityToInteger(hex);
}

function toOptionalInteger(hex) {
  if (typeof hex !== "string" || !/^0x[0-9a-fA-F]+$/.test(hex)) return null;
  const n = BigInt(hex);
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(n);
}

function normaliseAddress(value) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) ? value.toLowerCase() : null;
}

function normaliseHash(value) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value) ? value.toLowerCase() : null;
}

function blockStorageRecord(block) {
  return {
    number: block.number, hash: block.hash, parentHash: block.parentHash, nonce: block.nonce,
    sha3Uncles: block.sha3Uncles, logsBloom: block.logsBloom, transactionsRoot: block.transactionsRoot,
    stateRoot: block.stateRoot, receiptsRoot: block.receiptsRoot, miner: block.miner,
    difficulty: block.difficulty, totalDifficulty: block.totalDifficulty, extraData: block.extraData,
    size: block.size, gasLimit: block.gasLimit, gasUsed: block.gasUsed, timestamp: block.timestamp,
    mixHash: block.mixHash, baseFeePerGas: block.baseFeePerGas, blobGasUsed: block.blobGasUsed,
    excessBlobGas: block.excessBlobGas
  };
}

export function persistBatch(db, { blocks, logs, startBlock, endBlock, blockErrors = [], logsError = null, advanceCursor = true }) {
  const now = new Date().toISOString();
  const insertBlock = db.prepare(
    "INSERT INTO blocks(block_number,block_hash,parent_hash,block_timestamp,transaction_count,raw_json,indexed_at) VALUES(?,?,?,?,?,?,?) " +
    "ON CONFLICT(block_number) DO UPDATE SET block_hash=excluded.block_hash,parent_hash=excluded.parent_hash,block_timestamp=excluded.block_timestamp,transaction_count=excluded.transaction_count,raw_json=excluded.raw_json,indexed_at=excluded.indexed_at"
  );
  const insertTx = db.prepare(
    "INSERT INTO transactions(tx_hash,block_number,tx_index,from_address,to_address,value_hex,input_data,raw_json,indexed_at) VALUES(?,?,?,?,?,?,?,?,?) " +
    "ON CONFLICT(tx_hash) DO UPDATE SET block_number=excluded.block_number,tx_index=excluded.tx_index,from_address=excluded.from_address,to_address=excluded.to_address,value_hex=excluded.value_hex,input_data=excluded.input_data,raw_json=excluded.raw_json,indexed_at=excluded.indexed_at"
  );
  const insertLog = db.prepare(
    "INSERT INTO logs(block_number,log_index,tx_hash,contract_address,topic0,topic1,topic2,topic3,data,raw_json,indexed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) " +
    "ON CONFLICT(block_number,log_index) DO UPDATE SET tx_hash=excluded.tx_hash,contract_address=excluded.contract_address,topic0=excluded.topic0,topic1=excluded.topic1,topic2=excluded.topic2,topic3=excluded.topic3,data=excluded.data,raw_json=excluded.raw_json,indexed_at=excluded.indexed_at"
  );
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const block of blocks) {
      if (!block || !normaliseHash(block.hash)) continue;
      const number = blockNumberFromHex(block.number);
      const txs = Array.isArray(block.transactions) ? block.transactions : [];
      const existing = db.prepare("SELECT block_hash FROM blocks WHERE block_number=?").get(number);
      if (existing && existing.block_hash !== block.hash.toLowerCase()) {
        db.prepare("DELETE FROM transactions WHERE block_number=?").run(number);
        db.prepare("DELETE FROM logs WHERE block_number=?").run(number);
      }
      insertBlock.run(number, block.hash.toLowerCase(), block.parentHash?.toLowerCase() || null,
        toOptionalInteger(block.timestamp), txs.length, JSON.stringify(blockStorageRecord(block)), now);
      for (let i = 0; i < txs.length; i++) {
        const tx = txs[i];
        if (!tx || typeof tx !== "object" || !normaliseHash(tx.hash)) continue;
        const txIndex = toOptionalInteger(tx.transactionIndex) ?? i;
        insertTx.run(tx.hash.toLowerCase(), number, txIndex, normaliseAddress(tx.from),
          normaliseAddress(tx.to), typeof tx.value === "string" ? tx.value : null,
          typeof tx.input === "string" ? tx.input : null, JSON.stringify(tx), now);
      }
      deleteGap(db, "blocks", number, number);
    }
    for (const log of logs) {
      if (!log || !normaliseHash(log.blockHash) || !normaliseHash(log.transactionHash)) continue;
      const number = toOptionalInteger(log.blockNumber);
      const index = toOptionalInteger(log.logIndex);
      if (number == null || index == null) continue;
      const topics = Array.isArray(log.topics) ? log.topics : [];
      insertLog.run(number, index, log.transactionHash.toLowerCase(), normaliseAddress(log.address),
        topics[0]?.toLowerCase() || null, topics[1]?.toLowerCase() || null,
        topics[2]?.toLowerCase() || null, topics[3]?.toLowerCase() || null, log.data || "0x",
        JSON.stringify(log), now);
    }
    for (const gap of blockErrors) addGap(db, "blocks", gap.block, gap.block, gap.error);
    if (logsError) addGap(db, "logs", startBlock, endBlock, logsError);
    else deleteGap(db, "logs", startBlock, endBlock);
    if (advanceCursor) upsertState(db, "cursor", endBlock);
    upsertState(db, "last_batch_at", now);
    upsertState(db, "last_batch_start", startBlock);
    upsertState(db, "last_batch_end", endBlock);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function extractSubstrateAccounts(value, result = new Set(), seen = new Set()) {
  if (typeof value === "string") {
    if (SUBSTRATE_ACCOUNT_RE.test(value)) result.add(value);
    return [...result];
  }
  if (!value || typeof value !== "object" || seen.has(value)) return [...result];
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) extractSubstrateAccounts(item, result, seen);
  } else {
    for (const item of Object.values(value)) extractSubstrateAccounts(item, result, seen);
  }
  return [...result];
}

function cleanSubstrateAccount(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return SUBSTRATE_ACCOUNT_RE.test(normalized) ? normalized : null;
}

function deleteSubstrateBlockRows(db, blockNumber) {
  db.prepare("DELETE FROM substrate_event_accounts WHERE block_number=?").run(blockNumber);
  db.prepare("DELETE FROM substrate_events WHERE block_number=?").run(blockNumber);
  db.prepare("DELETE FROM substrate_extrinsics WHERE block_number=?").run(blockNumber);
}

export function persistSubstrateBatch(db, { blocks, blockErrors = [], eventErrors = [], startBlock, endBlock, advanceCursor = true }) {
  const now = new Date().toISOString();
  const insertBlock = db.prepare(
    "INSERT INTO substrate_blocks(block_number,block_hash,parent_hash,state_root,extrinsics_root,timestamp_ms,extrinsic_count,event_count,raw_json,indexed_at) VALUES(?,?,?,?,?,?,?,?,?,?) " +
    "ON CONFLICT(block_number) DO UPDATE SET block_hash=excluded.block_hash,parent_hash=excluded.parent_hash,state_root=excluded.state_root,extrinsics_root=excluded.extrinsics_root,timestamp_ms=excluded.timestamp_ms,extrinsic_count=excluded.extrinsic_count,event_count=excluded.event_count,raw_json=excluded.raw_json,indexed_at=excluded.indexed_at"
  );
  const insertExtrinsic = db.prepare(
    "INSERT INTO substrate_extrinsics(block_number,extrinsic_index,extrinsic_hash,section,method,signer,raw_json,indexed_at) VALUES(?,?,?,?,?,?,?,?) " +
    "ON CONFLICT(block_number,extrinsic_index) DO UPDATE SET extrinsic_hash=excluded.extrinsic_hash,section=excluded.section,method=excluded.method,signer=excluded.signer,raw_json=excluded.raw_json,indexed_at=excluded.indexed_at"
  );
  const insertEvent = db.prepare(
    "INSERT INTO substrate_events(block_number,event_index,extrinsic_index,section,method,data_json,raw_json,indexed_at) VALUES(?,?,?,?,?,?,?,?) " +
    "ON CONFLICT(block_number,event_index) DO UPDATE SET extrinsic_index=excluded.extrinsic_index,section=excluded.section,method=excluded.method,data_json=excluded.data_json,raw_json=excluded.raw_json,indexed_at=excluded.indexed_at"
  );
  const insertAccount = db.prepare(
    "INSERT OR IGNORE INTO substrate_event_accounts(block_number,event_index,address) VALUES(?,?,?)"
  );
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const block of blocks) {
      if (!block || !Number.isSafeInteger(block.number) || block.number < 0 || !normaliseHash(block.hash)) continue;
      const existing = db.prepare("SELECT block_hash FROM substrate_blocks WHERE block_number=?").get(block.number);
      if (existing && existing.block_hash !== block.hash.toLowerCase()) deleteSubstrateBlockRows(db, block.number);

      insertBlock.run(
        block.number,
        block.hash.toLowerCase(),
        normaliseHash(block.parentHash) || null,
        normaliseHash(block.stateRoot) || null,
        normaliseHash(block.extrinsicsRoot) || null,
        block.timestampMs == null ? null : String(block.timestampMs),
        Array.isArray(block.extrinsics) ? block.extrinsics.length : 0,
        Array.isArray(block.events) ? block.events.length : 0,
        JSON.stringify(block.raw || {}),
        now
      );

      for (const extrinsic of block.extrinsics || []) {
        if (!Number.isSafeInteger(extrinsic.index) || extrinsic.index < 0 || typeof extrinsic.hash !== "string") continue;
        insertExtrinsic.run(
          block.number, extrinsic.index, extrinsic.hash.toLowerCase(),
          typeof extrinsic.section === "string" ? extrinsic.section : null,
          typeof extrinsic.method === "string" ? extrinsic.method : null,
          cleanSubstrateAccount(extrinsic.signer),
          JSON.stringify(extrinsic.raw || {}), now
        );
      }

      for (const event of block.events || []) {
        if (!Number.isSafeInteger(event.index) || event.index < 0 ||
            typeof event.section !== "string" || typeof event.method !== "string") continue;
        insertEvent.run(
          block.number, event.index,
          Number.isSafeInteger(event.extrinsicIndex) ? event.extrinsicIndex : null,
          event.section, event.method, JSON.stringify(event.data ?? []),
          JSON.stringify(event.raw || {}), now
        );
        const found = new Set([
          ...extractSubstrateAccounts(event.data ?? []),
          ...extractSubstrateAccounts(event.raw || {})
        ]);
        for (const address of found) insertAccount.run(block.number, event.index, address);
      }

      deleteGap(db, "substrate_blocks", block.number, block.number);
      if (block.eventsComplete !== false) deleteGap(db, "substrate_events", block.number, block.number);
    }

    for (const item of blockErrors) addGap(db, "substrate_blocks", item.block, item.block, item.error);
    for (const item of eventErrors) addGap(db, "substrate_events", item.block, item.block, item.error);

    if (advanceCursor) upsertState(db, "substrate_cursor", endBlock);
    upsertState(db, "substrate_last_batch_at", now);
    upsertState(db, "substrate_last_batch_start", startBlock);
    upsertState(db, "substrate_last_batch_end", endBlock);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getSubstrateIndexerStatus(db, runtime = {}) {
  const cursorText = readState(db, "substrate_cursor");
  const startedText = readState(db, "substrate_started_from");
  const cursor = cursorText == null ? null : Number(cursorText);
  const started = startedText == null ? null : Number(startedText);
  const gapCount = db.prepare("SELECT COUNT(*) AS count FROM indexer_gaps WHERE component IN ('substrate_blocks','substrate_events')").get().count;
  const firstGap = db.prepare("SELECT MIN(start_block) AS n FROM indexer_gaps WHERE component IN ('substrate_blocks','substrate_events')").get().n;
  const contiguousThrough = cursor == null ? null : firstGap == null ? cursor : Math.min(cursor, firstGap - 1);
  const count = (table) => db.prepare("SELECT COUNT(*) AS count FROM " + table).get().count;
  return {
    connected: runtime.substrateConnected === true,
    websocketOrigin: (() => { try { return new URL(SUBSTRATE_WS_URL).origin; } catch { return null; } })(),
    expectedGenesisHash: EXPECTED_SUBSTRATE_GENESIS_HASH || null,
    actualGenesisHash: runtime.substrateGenesisHash || null,
    latestFinalized: runtime.substrateLatestFinalized ?? null,
    indexedThrough: contiguousThrough == null || (started != null && contiguousThrough < started) ? null : contiguousThrough,
    processedThrough: cursor,
    startedFrom: started,
    blocksStored: count("substrate_blocks"),
    extrinsicsStored: count("substrate_extrinsics"),
    eventsStored: count("substrate_events"),
    gapCount,
    lastBatchAt: readState(db, "substrate_last_batch_at"),
    gaps: db.prepare("SELECT component,start_block AS startBlock,end_block AS endBlock,error_message AS error,attempts,updated_at AS updatedAt FROM indexer_gaps WHERE component IN ('substrate_blocks','substrate_events') ORDER BY updated_at LIMIT 100").all(),
    error: runtime.substrateError || null
  };
}

function readSubstrateBlock(db, ref) {
  let block;
  if (/^(0|[1-9][0-9]*)$/.test(String(ref))) {
    const number = Number(ref);
    if (!Number.isSafeInteger(number)) return null;
    block = db.prepare("SELECT * FROM substrate_blocks WHERE block_number=?").get(number);
  } else {
    const hash = normaliseHash(ref);
    if (!hash) return null;
    block = db.prepare("SELECT * FROM substrate_blocks WHERE block_hash=?").get(hash);
  }
  if (!block) return null;
  const extrinsics = db.prepare("SELECT extrinsic_index,extrinsic_hash,section,method,signer,raw_json FROM substrate_extrinsics WHERE block_number=? ORDER BY extrinsic_index").all(block.block_number).map(row => ({
    extrinsicIndex: row.extrinsic_index, hash: row.extrinsic_hash, section: row.section, method: row.method,
    signer: row.signer, extrinsic: JSON.parse(row.raw_json)
  }));
  const events = db.prepare("SELECT event_index,extrinsic_index,section,method,data_json,raw_json FROM substrate_events WHERE block_number=? ORDER BY event_index LIMIT 1000").all(block.block_number).map(row => ({
    eventIndex: row.event_index, extrinsicIndex: row.extrinsic_index, section: row.section, method: row.method,
    data: JSON.parse(row.data_json), event: JSON.parse(row.raw_json)
  }));
  const gaps = db.prepare("SELECT component,error_message AS error,attempts,updated_at AS updatedAt FROM indexer_gaps WHERE component IN ('substrate_blocks','substrate_events') AND start_block<=? AND end_block>=?").all(block.block_number, block.block_number);
  return {
    source: "substrate_indexer", block: JSON.parse(block.raw_json), blockNumber: block.block_number,
    blockHash: block.block_hash, extrinsics, events, gaps, historyComplete: gaps.length === 0
  };
}

function parseSubstrateExtrinsic(extrinsic, index) {
  const signerText = (() => { try { return extrinsic.isSigned ? extrinsic.signer.toString() : null; } catch { return null; } })();
  const signer = cleanSubstrateAccount(signerText);
  const method = extrinsic.method;
  let raw = {};
  try { raw = extrinsic.toJSON(); } catch {}
  return {
    index,
    hash: typeof extrinsic.hash?.toHex === "function" ? extrinsic.hash.toHex().toLowerCase() : null,
    section: method?.section || null,
    method: method?.method || null,
    signer,
    raw
  };
}

function parseSubstrateEvent(record, index) {
  const event = record.event;
  let extrinsicIndex = null;
  try {
    if (record.phase?.isApplyExtrinsic) extrinsicIndex = record.phase.asApplyExtrinsic.toNumber();
  } catch {}
  let data = [];
  try { data = event.data.toJSON(); } catch {}
  let phase = null;
  try { phase = record.phase.toJSON(); } catch {}
  const raw = {
    phase,
    section: event.section,
    method: event.method,
    data,
    topics: (record.topics || []).map((topic) => topic.toHex())
  };
  return {
    index,
    extrinsicIndex,
    section: event.section || "unknown",
    method: event.method || "unknown",
    data,
    raw
  };
}

export async function persistSubstrateBlock(db, block) {
  persistSubstrateBatch(db, {
    blocks: [block],
    blockErrors: [],
    eventErrors: block.eventsComplete === false
      ? [{ block: block.number, error: block.eventsError || "Substrate events were not available for this block." }]
      : [],
    startBlock: block.number,
    endBlock: block.number,
    advanceCursor: false
  });
}

async function withTimeout(promise, timeoutMs, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
        timer.unref?.();
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function ensureSubstrateApi(runtime) {
  if (runtime.substrateApi && runtime.substrateConnected === true) return runtime.substrateApi;
  if (runtime.substrateConnectPromise) return runtime.substrateConnectPromise;
  const connectPromise = (async () => {
    runtime.substrateConnected = false;
    let provider;
    let api;
    try {
      const wsUrl = new URL(SUBSTRATE_WS_URL);
      if (!["wss:", "ws:"].includes(wsUrl.protocol)) throw new Error("Substrate RPC URL must use WebSocket.");
      if (wsUrl.protocol === "ws:" && !["localhost", "127.0.0.1", "[::1]"].includes(wsUrl.hostname)) {
        throw new Error("Remote Substrate endpoints must use WSS.");
      }
      if (wsUrl.username || wsUrl.password) throw new Error("Substrate RPC URL must not contain credentials.");
      provider = new WsProvider(SUBSTRATE_WS_URL);
      api = await ApiPromise.create({ provider, noInitWarn: true });
      await withTimeout(api.isReady, 20000, "Substrate RPC connection timed out.");
      const genesisHash = (await api.rpc.chain.getBlockHash(0)).toHex().toLowerCase();
      if (EXPECTED_SUBSTRATE_GENESIS_HASH && genesisHash !== EXPECTED_SUBSTRATE_GENESIS_HASH) {
        throw new Error("Substrate genesis hash mismatch. Refusing to index the unexpected chain.");
      }
      runtime.substrateApi = api;
      runtime.substrateConnected = true;
      runtime.substrateGenesisHash = genesisHash;
      runtime.substrateError = null;
      api.on("disconnected", () => {
        runtime.substrateConnected = false;
        runtime.substrateError = "Substrate WebSocket disconnected.";
      });
      api.on("error", (error) => {
        runtime.substrateError = error?.message || "Substrate API error.";
      });
      return api;
    } catch (error) {
      runtime.substrateConnected = false;
      runtime.substrateError = error?.message || String(error);
      try { if (api) await api.disconnect(); else if (provider) await provider.disconnect(); } catch {}
      throw error;
    }
  })();
  runtime.substrateConnectPromise = connectPromise;
  try {
    return await connectPromise;
  } finally {
    if (runtime.substrateConnectPromise === connectPromise) runtime.substrateConnectPromise = null;
  }
}

async function indexSubstrateRange(db, runtime, startBlock, endBlock, advanceCursor = true) {
  const api = await ensureSubstrateApi(runtime);
  const numbers = [];
  for (let n = startBlock; n <= endBlock; n++) {
    if (runtime.stopping) break;
    numbers.push(n);
  }
  const blockErrors = [];
  const eventErrors = [];
  const blocks = [];
  const hashes = await Promise.all(numbers.map(async (number) => {
    try {
      const hash = await api.rpc.chain.getBlockHash(number);
      if (!hash || hash.isEmpty) throw new Error("The node returned no block hash.");
      return { number, hash };
    } catch (error) {
      blockErrors.push({ block: number, error: error?.message || String(error) });
      return null;
    }
  }));
  const signedBlocks = await Promise.all(hashes.map(async (item) => {
    if (!item) return null;
    try {
      const result = await api.rpc.chain.getBlock(item.hash);
      return { ...item, block: result.block };
    } catch (error) {
      blockErrors.push({ block: item.number, error: error?.message || String(error) });
      return null;
    }
  }));
  const hydrated = await Promise.all(signedBlocks.map(async (item) => {
    if (!item) return null;
    const { number, hash, block } = item;
    const extrinsics = (block.extrinsics || []).map((extrinsic, index) => parseSubstrateExtrinsic(extrinsic, index));
    let events = [];
    let eventsComplete = true;
    let eventsError = null;
    let timestampMs = null;
    const eventPromise = (async () => {
      try {
        const records = await api.query.system.events.at(hash);
        events = records.map((record, index) => parseSubstrateEvent(record, index));
      } catch (error) {
        eventsComplete = false;
        eventsError = error?.message || String(error);
        eventErrors.push({ block: number, error: eventsError });
      }
    })();
    const timestampPromise = (async () => {
      try {
        const timestamp = await api.query.timestamp.now.at(hash);
        const numeric = BigInt(timestamp.toString());
        if (numeric >= 0n && numeric <= BigInt(Number.MAX_SAFE_INTEGER)) timestampMs = Number(numeric);
      } catch {
        // Timestamp is optional metadata; a missing timestamp is not a block/event indexing gap.
      }
    })();
    await Promise.all([eventPromise, timestampPromise]);
    const header = block.header;
    const blockHash = hash.toHex().toLowerCase();
    const parentHash = header.parentHash?.toHex().toLowerCase() || null;
    const stateRoot = header.stateRoot?.toHex().toLowerCase() || null;
    const extrinsicsRoot = header.extrinsicsRoot?.toHex().toLowerCase() || null;
    return {
      number, hash: blockHash, parentHash, stateRoot, extrinsicsRoot,
      timestampMs, extrinsics, events, eventsComplete, eventsError,
      raw: {
        number, hash: blockHash, parentHash, stateRoot, extrinsicsRoot, timestampMs,
        extrinsicCount: extrinsics.length, eventCount: events.length,
        digest: header.digest?.toJSON?.() || null
      }
    };
  }));
  for (const block of hydrated) if (block) blocks.push(block);
  persistSubstrateBatch(db, { blocks, blockErrors, eventErrors, startBlock, endBlock, advanceCursor });
  return { indexedBlocks: blocks.length, missingBlocks: blockErrors.length, eventGaps: eventErrors.length };
}

async function retryOneSubstrateGap(db, runtime) {
  const gap = db.prepare(
    "SELECT component,start_block,end_block FROM indexer_gaps WHERE component IN ('substrate_blocks','substrate_events') ORDER BY updated_at ASC LIMIT 1"
  ).get();
  if (!gap) return;
  const from = gap.start_block;
  const to = Math.min(gap.end_block, from + SUBSTRATE_BATCH_BLOCKS - 1);
  await indexSubstrateRange(db, runtime, from, to, false);
  if (to < gap.end_block) {
    const remaining = db.prepare("SELECT 1 FROM indexer_gaps WHERE component=? AND start_block=? AND end_block=?").get(gap.component, from, gap.end_block);
    if (remaining) {
      db.prepare("DELETE FROM indexer_gaps WHERE component=? AND start_block=? AND end_block=?").run(gap.component, from, gap.end_block);
      addGap(db, gap.component, to + 1, gap.end_block, "Remaining portion of a previously recorded Substrate indexing gap.");
    }
  }
}

export async function resolveSubstrateAddress(db, runtime, address) {
  const normalized = cleanSubstrateAccount(address);
  if (!normalized) return { source: "invalid", error: "Address must be a valid-looking SS58 address (5…)." };
  const api = await ensureSubstrateApi(runtime);
  const current = await api.query.system.account(normalized);
  const account = current.toJSON();
  const eventRows = db.prepare(
    "SELECT e.block_number,e.event_index,e.section,e.method,e.data_json,e.raw_json FROM substrate_events e " +
    "JOIN substrate_event_accounts a ON a.block_number=e.block_number AND a.event_index=e.event_index " +
    "WHERE a.address=? ORDER BY e.block_number DESC,e.event_index DESC LIMIT 50"
  ).all(normalized);
  const extrinsicRows = db.prepare(
    "SELECT block_number,extrinsic_index,extrinsic_hash,section,method,signer,raw_json FROM substrate_extrinsics " +
    "WHERE signer=? ORDER BY block_number DESC,extrinsic_index DESC LIMIT 50"
  ).all(normalized);
  const totalEvents = db.prepare(
    "SELECT COUNT(*) AS count FROM substrate_event_accounts WHERE address=?"
  ).get(normalized).count;
  const totalExtrinsics = db.prepare(
    "SELECT COUNT(*) AS count FROM substrate_extrinsics WHERE signer=?"
  ).get(normalized).count;
  return {
    source: "substrate_indexer+live_rpc",
    address: normalized,
    currentAccount: account,
    indexedEventsCount: totalEvents,
    indexedExtrinsicsCount: totalExtrinsics,
    recentEvents: eventRows.map((row) => ({
      blockNumber: row.block_number,
      eventIndex: row.event_index,
      section: row.section,
      method: row.method,
      data: JSON.parse(row.data_json),
      event: JSON.parse(row.raw_json)
    })),
    recentExtrinsics: extrinsicRows.map((row) => ({
      blockNumber: row.block_number,
      extrinsicIndex: row.extrinsic_index,
      hash: row.extrinsic_hash,
      section: row.section,
      method: row.method,
      signer: row.signer,
      extrinsic: JSON.parse(row.raw_json)
    })),
    coverage: {
      startedFrom: readState(db, "substrate_started_from") == null ? null : Number(readState(db, "substrate_started_from")),
      indexedThrough: getSubstrateIndexerStatus(db, runtime).indexedThrough,
      note: "Historical activity only covers the indexed range. Current account state is read from the live Substrate node."
    }
  };
}

function readSubstrateExtrinsic(db, hash) {
  const normalized = normaliseHash(hash);
  if (!normalized) return null;
  const row = db.prepare(
    "SELECT block_number,extrinsic_index,extrinsic_hash,section,method,signer,raw_json FROM substrate_extrinsics WHERE extrinsic_hash=? ORDER BY block_number DESC LIMIT 1"
  ).get(normalized);
  if (!row) return null;
  const eventRows = db.prepare(
    "SELECT raw_json FROM substrate_events WHERE block_number=? AND extrinsic_index=? ORDER BY event_index LIMIT 500"
  ).all(row.block_number, row.extrinsic_index);
  return {
    source: "substrate_indexer",
    blockNumber: row.block_number,
    extrinsicIndex: row.extrinsic_index,
    hash: row.extrinsic_hash,
    section: row.section,
    method: row.method,
    signer: row.signer,
    extrinsic: JSON.parse(row.raw_json),
    events: eventRows.map((item) => JSON.parse(item.raw_json))
  };
}

async function runSubstrateIndexer(db, runtime) {
  let cycles = 0;
  while (!runtime.stopping) {
    try {
      const api = await ensureSubstrateApi(runtime);
      const finalizedHash = await api.rpc.chain.getFinalizedHead();
      const finalizedHeader = await api.rpc.chain.getHeader(finalizedHash);
      const finalizedText = finalizedHeader.number.toString();
      const finalizedBig = BigInt(finalizedText);
      if (finalizedBig > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Finalized block exceeds the safe database integer range.");
      const finalized = Number(finalizedBig);
      runtime.substrateLatestFinalized = finalized;
      let cursorText = readState(db, "substrate_cursor");
      if (cursorText == null) {
        let firstBlock;
        if (SUBSTRATE_START_BLOCK_ENV) {
          if (!/^(0|[1-9][0-9]*)$/.test(SUBSTRATE_START_BLOCK_ENV)) throw new Error("SUBSTRATE_START_BLOCK must be a decimal block number.");
          firstBlock = Number(SUBSTRATE_START_BLOCK_ENV);
          if (!Number.isSafeInteger(firstBlock) || firstBlock < 0) throw new Error("SUBSTRATE_START_BLOCK is outside the supported range.");
        } else {
          firstBlock = Math.max(0, finalized - SUBSTRATE_BACKFILL_BLOCKS + 1);
        }
        upsertState(db, "substrate_started_from", firstBlock);
        upsertState(db, "substrate_cursor", firstBlock - 1);
        cursorText = String(firstBlock - 1);
      }
      const cursor = Number(cursorText);
      if (cursor < finalized) {
        const start = cursor + 1;
        const end = Math.min(finalized, start + SUBSTRATE_BATCH_BLOCKS - 1);
        await indexSubstrateRange(db, runtime, start, end, true);
      } else {
        cycles++;
        if (cycles % GAP_RETRY_CYCLES === 0) await retryOneSubstrateGap(db, runtime);
        else await sleep(POLL_MS);
      }
      runtime.substrateError = null;
    } catch (error) {
      runtime.substrateConnected = false;
      runtime.substrateError = error?.message || String(error);
      try {
        if (runtime.substrateApi) await runtime.substrateApi.disconnect();
      } catch {}
      runtime.substrateApi = null;
      await sleep(Math.max(POLL_MS, 8000));
    }
  }
}

export function openExplorerDatabase(path = DB_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  initializeDatabase(db);
  return db;
}

async function rpc(method, params = []) {
  const response = await fetch(RPC_URL, {
    method: "POST", redirect: "error",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(method + ": HTTP " + response.status);
  const data = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data) || data.jsonrpc !== "2.0" || data.id !== 1) {
    throw new Error(method + ": invalid JSON-RPC response envelope");
  }
  if (data.error) throw new Error(method + ": " + (data.error.message || JSON.stringify(data.error)));
  return data.result;
}

async function rpcBatch(requests) {
  const payload = requests.map((item, index) => ({ jsonrpc: "2.0", id: index + 1, method: item.method, params: item.params }));
  try {
    const response = await fetch(RPC_URL, {
      method: "POST", redirect: "error",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const data = await response.json();
    if (Array.isArray(data)) {
      const byId = new Map(data.map((item) => [item.id, item]));
      return payload.map((entry) => {
        const item = byId.get(entry.id);
        if (!item) return { error: new Error(entry.method + ": missing batch response") };
        if (item.error) return { error: new Error(item.error.message || JSON.stringify(item.error)) };
        return { result: item.result };
      });
    }
  } catch {
    // Providers that disable JSON-RPC batching are retried through bounded single requests.
  }
  return Promise.all(requests.map(async (item) => {
    try { return { result: await rpc(item.method, item.params) }; }
    catch (error) { return { error }; }
  }));
}

function getCount(db, table) {
  const allowed = new Set(["blocks", "transactions", "logs"]);
  if (!allowed.has(table)) throw new Error("Invalid table.");
  return db.prepare("SELECT COUNT(*) AS count FROM " + table).get().count;
}

function getIndexerStatus(db) {
  const cursor = readState(db, "cursor");
  const started = readState(db, "started_from");
  const cursorNumber = cursor == null ? null : Number(cursor);
  const startedNumber = started == null ? null : Number(started);
  const gapCount = db.prepare("SELECT COUNT(*) AS count FROM indexer_gaps WHERE component IN ('blocks','logs')").get().count;
  return {
    indexedThrough: cursorNumber == null || (startedNumber != null && cursorNumber < startedNumber) ? null : cursorNumber,
    startedFrom: startedNumber,
    gapCount,
    lastBatchAt: readState(db, "last_batch_at"),
    lastBatchStart: readState(db, "last_batch_start") == null ? null : Number(readState(db, "last_batch_start")),
    lastBatchEnd: readState(db, "last_batch_end") == null ? null : Number(readState(db, "last_batch_end")),
    blocksStored: getCount(db, "blocks"),
    transactionsStored: getCount(db, "transactions"),
    logsStored: getCount(db, "logs"),
    gaps: db.prepare("SELECT component,start_block AS startBlock,end_block AS endBlock,error_message AS error,attempts,updated_at AS updatedAt FROM indexer_gaps WHERE component IN ('blocks','logs') ORDER BY start_block LIMIT 200").all()
  };
}

function readIndexedBlock(db, ref) {
  let block;
  if (/^(0|[1-9][0-9]*)$/.test(String(ref))) {
    const n = Number(ref);
    if (!Number.isSafeInteger(n)) return null;
    block = db.prepare("SELECT * FROM blocks WHERE block_number=?").get(n);
  } else {
    const hash = normaliseHash(ref);
    if (!hash) return null;
    block = db.prepare("SELECT * FROM blocks WHERE block_hash=?").get(hash);
  }
  if (!block) return null;
  const transactions = db.prepare("SELECT raw_json FROM transactions WHERE block_number=? ORDER BY tx_index LIMIT 200").all(block.block_number).map((row) => JSON.parse(row.raw_json));
  const logs = db.prepare("SELECT raw_json FROM logs WHERE block_number=? ORDER BY log_index LIMIT 500").all(block.block_number).map((row) => JSON.parse(row.raw_json));
  return { source: "indexer", block: JSON.parse(block.raw_json), blockNumber: block.block_number, transactions, logs };
}

function readIndexedTransaction(db, hash) {
  const row = db.prepare("SELECT * FROM transactions WHERE tx_hash=?").get(hash.toLowerCase());
  if (!row) return null;
  const logs = db.prepare("SELECT raw_json FROM logs WHERE tx_hash=? ORDER BY block_number,log_index LIMIT 500").all(hash.toLowerCase()).map((item) => JSON.parse(item.raw_json));
  return { source: "indexer", transaction: JSON.parse(row.raw_json), indexedAt: row.indexed_at, logs };
}

async function resolveTransaction(db, hash) {
  const saved = readIndexedTransaction(db, hash);
  if (saved) {
    let receipt = null;
    let receiptError = null;
    try { receipt = await rpc("eth_getTransactionReceipt", [hash]); }
    catch (error) { receiptError = error.message; }
    return {
      ...saved, receipt, receiptSource: receipt ? "live_rpc" : "unavailable",
      receiptNote: receipt ? "Receipt returned by the current RPC." : "Transaction is indexed, but the current RPC did not return its receipt" + (receiptError ? ": " + receiptError : ".")
    };
  }
  let transaction = null;
  let receipt = null;
  let transactionError = null;
  try {
    transaction = await rpc("eth_getTransactionByHash", [hash]);
    if (transaction) receipt = await rpc("eth_getTransactionReceipt", [hash]);
  } catch (error) { transactionError = error.message; }
  if (transaction) {
    return {
      source: "live_rpc", transaction, receipt, receiptSource: receipt ? "live_rpc" : "unavailable",
      receiptNote: receipt ? "Receipt returned by the current RPC." : "Transaction found, receipt unavailable from current RPC."
    };
  }
  const known = KNOWN_EVIDENCE.find((item) => item.transactionHash.toLowerCase() === hash.toLowerCase()) || null;
  return {
    source: "not_found", transaction: null, receipt: null, knownEvidence: known,
    rpcNote: transactionError || "Current RPC returned no transaction for this hash. A null response does not prove that it never existed."
  };
}

async function resolveBlock(db, ref) {
  const indexed = readIndexedBlock(db, ref);
  if (indexed) return indexed;
  let block = null;
  try {
    if (/^(0|[1-9][0-9]*)$/.test(String(ref))) block = await rpc("eth_getBlockByNumber", ["0x" + BigInt(ref).toString(16), true]);
    else {
      const hash = normaliseHash(ref);
      if (!hash) return { source: "invalid", error: "Block reference must be a decimal number or a 32-byte hash." };
      block = await rpc("eth_getBlockByHash", [hash, true]);
    }
  } catch (error) {
    return { source: "rpc_error", error: error.message };
  }
  return block ? { source: "live_rpc", block } : { source: "not_found", block: null, note: "The current RPC did not return this block. Historical availability is inconclusive." };
}

async function resolveAddress(db, address) {
  const normalized = normaliseAddress(address);
  if (!normalized) return { source: "invalid", error: "Address must be a 20-byte EVM address." };
  const [balance, nonce, code] = await Promise.all([
    rpc("eth_getBalance", [normalized, "latest"]),
    rpc("eth_getTransactionCount", [normalized, "latest"]),
    rpc("eth_getCode", [normalized, "latest"])
  ]);
  const txRows = db.prepare("SELECT raw_json FROM transactions WHERE from_address=? OR to_address=? ORDER BY block_number DESC,tx_index DESC LIMIT 50").all(normalized, normalized);
  const counts = db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE from_address=? OR to_address=?").get(normalized, normalized).count;
  return {
    source: "live_rpc", address: normalized, balance, nonce, code,
    codeBytes: code && code !== "0x" ? Math.max(0, (code.length - 2) / 2) : 0,
    indexedTransactionCount: counts, indexedTransactions: txRows.map((row) => JSON.parse(row.raw_json))
  };
}

function safeAbiValue(value, param = null) {
  if (typeof value === "bigint") return value.toString();
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(param?.components) && value && typeof value.length === "number") {
    return Object.fromEntries(param.components.map((component, index) => [
      component.name || String(index),
      safeAbiValue(value[index], component)
    ]));
  }
  if (Array.isArray(value)) return value.map((item, index) => safeAbiValue(item, param?.arrayChildren || null));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, safeAbiValue(item)]));
  }
  return String(value);
}

function parseContractAbi(input) {
  const abi = Array.isArray(input) ? input : input && Array.isArray(input.abi) ? input.abi : null;
  if (!abi || abi.length === 0 || abi.length > 1000) {
    const error = new Error("abi must be a non-empty Solidity ABI array (max 1000 entries) or artifact with an abi array.");
    error.statusCode = 400;
    throw error;
  }
  let abiJson;
  try { abiJson = JSON.stringify(abi); }
  catch {
    const error = new Error("abi must be valid JSON data.");
    error.statusCode = 400;
    throw error;
  }
  if (Buffer.byteLength(abiJson, "utf8") > 256 * 1024) {
    const error = new Error("abi exceeds the 256 KiB size limit.");
    error.statusCode = 413;
    throw error;
  }
  let iface;
  try { iface = new Interface(abi); }
  catch (error) {
    const failure = new Error("Invalid Solidity ABI: " + (error?.message || String(error)));
    failure.statusCode = 400;
    throw failure;
  }
  const eventFragments = iface.fragments.filter((fragment) => fragment.type === "event");
  if (eventFragments.length === 0) {
    const error = new Error("The ABI must contain at least one event fragment.");
    error.statusCode = 400;
    throw error;
  }
  return { abi, abiJson, iface, eventCount: eventFragments.length };
}

function makeContractSlug(name) {
  const base = String(name || "contract").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36) || "contract";
  return base + "-" + randomBytes(4).toString("hex");
}

function hashManagerToken(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function hasManagerAccess(req, storedHash) {
  const header = String(req.headers.authorization || "");
  const match = /^Bearer ([a-fA-F0-9]{64})$/.exec(header);
  if (!match || !storedHash) return false;
  const provided = Buffer.from(hashManagerToken(match[1]), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

async function readJsonBody(req, maxBytes = 1024 * 1024) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    const error = new Error("Content-Type must be application/json.");
    error.statusCode = 415;
    throw error;
  }
  const declaredLength = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    const error = new Error("Request body exceeds the size limit.");
    error.statusCode = 413;
    throw error;
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > maxBytes) {
      const error = new Error("Request body exceeds the size limit.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (length === 0) {
    const error = new Error("Request body must contain a JSON object.");
    error.statusCode = 400;
    throw error;
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch {
    const error = new Error("Malformed JSON request body.");
    error.statusCode = 400;
    throw error;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    const error = new Error("Request body must be a JSON object.");
    error.statusCode = 400;
    throw error;
  }
  return body;
}

function decodeOneContractLog(iface, rawLog) {
  try {
    const topics = Array.isArray(rawLog.topics) ? rawLog.topics : [];
    const parsed = iface.parseLog({ topics, data: rawLog.data || "0x" });
    if (!parsed) return null;
    const args = {};
    parsed.fragment.inputs.forEach((input, index) => {
      args[input.name || String(index)] = safeAbiValue(parsed.args[index], input);
    });
    return {
      eventName: parsed.name,
      eventSignature: parsed.signature || parsed.fragment.format(),
      args
    };
  } catch {
    // A registered ABI can describe only a subset of logs for an address.
    return null;
  }
}

export function decodeContractLogsForSlug(db, slug, startBlock, endBlock) {
  const contract = db.prepare("SELECT slug,address,abi_json FROM registered_contracts WHERE slug=?").get(slug);
  if (!contract) return 0;
  if (!Number.isSafeInteger(startBlock) || !Number.isSafeInteger(endBlock) || endBlock < startBlock) return 0;
  const iface = new Interface(JSON.parse(contract.abi_json));
  const rows = db.prepare(
    "SELECT block_number,log_index,tx_hash,raw_json FROM logs WHERE contract_address=? AND block_number BETWEEN ? AND ? ORDER BY block_number,log_index"
  ).all(contract.address, startBlock, endBlock);
  const insert = db.prepare(
    "INSERT INTO decoded_contract_events(slug,block_number,log_index,tx_hash,event_name,event_signature,args_json,raw_json,decoded_at) VALUES(?,?,?,?,?,?,?,?,?) " +
    "ON CONFLICT(slug,block_number,log_index) DO UPDATE SET tx_hash=excluded.tx_hash,event_name=excluded.event_name,event_signature=excluded.event_signature,args_json=excluded.args_json,raw_json=excluded.raw_json,decoded_at=excluded.decoded_at"
  );
  db.exec("BEGIN IMMEDIATE");
  try {
    // Re-decode this exact range to keep the projection consistent after log replacement or a resync.
    db.prepare("DELETE FROM decoded_contract_events WHERE slug=? AND block_number BETWEEN ? AND ?").run(slug, startBlock, endBlock);
    let decoded = 0;
    for (const row of rows) {
      const rawLog = JSON.parse(row.raw_json);
      const parsed = decodeOneContractLog(iface, rawLog);
      if (!parsed) continue;
      insert.run(
        slug, row.block_number, row.log_index, row.tx_hash,
        parsed.eventName, parsed.eventSignature, JSON.stringify(parsed.args),
        JSON.stringify(rawLog), new Date().toISOString()
      );
      decoded++;
    }
    const count = db.prepare("SELECT COUNT(*) AS count FROM decoded_contract_events WHERE slug=?").get(slug).count;
    const last = db.prepare("SELECT MAX(block_number) AS n FROM logs WHERE contract_address=? AND block_number<=?").get(contract.address, endBlock).n;
    const first = db.prepare("SELECT MIN(block_number) AS n FROM logs WHERE contract_address=?").get(contract.address).n;
    const currentFrom = db.prepare("SELECT indexed_from_block FROM registered_contracts WHERE slug=?").get(slug)?.indexed_from_block;
    db.prepare(
      "UPDATE registered_contracts SET event_count=?,last_decoded_block=?,indexed_from_block=COALESCE(indexed_from_block,?),decode_error=NULL WHERE slug=?"
    ).run(count, endBlock, first ?? (currentFrom ?? null), slug);
    db.exec("COMMIT");
    return decoded;
  } catch (error) {
    db.exec("ROLLBACK");
    db.prepare("UPDATE registered_contracts SET decode_error=? WHERE slug=?").run(String(error?.message || error).slice(0, 800), slug);
    throw error;
  }
}

export function decodeRegisteredContractLogs(db, startBlock, endBlock) {
  const contracts = db.prepare("SELECT slug FROM registered_contracts ORDER BY registered_at").all();
  let decoded = 0;
  for (const contract of contracts) {
    try { decoded += decodeContractLogsForSlug(db, contract.slug, startBlock, endBlock); }
    catch (error) {
      console.error("Contract event decoding failed for " + contract.slug + ":", error?.message || String(error));
    }
  }
  return decoded;
}

function registerContract(db, address, name, parsedAbi) {
  const total = db.prepare("SELECT COUNT(*) AS count FROM registered_contracts").get().count;
  if (total >= 200) {
    const error = new Error("The contract registry is full (200 contracts).");
    error.statusCode = 429;
    throw error;
  }
  const existing = db.prepare("SELECT slug FROM registered_contracts WHERE address=?").get(address);
  if (existing) {
    const error = new Error("This address is already registered as slug " + existing.slug + ". Use its manage token to resync or delete it.");
    error.statusCode = 409;
    throw error;
  }
  const slug = makeContractSlug(name || ("contract-" + address.slice(2, 8)));
  const manageToken = randomBytes(32).toString("hex");
  const cursor = readState(db, "cursor");
  const firstExistingLog = db.prepare("SELECT MIN(block_number) AS n FROM logs WHERE contract_address=?").get(address).n;
  const indexedFrom = firstExistingLog ?? (cursor == null ? null : Number(cursor) + 1);
  db.prepare(
    "INSERT INTO registered_contracts(slug,address,name,abi_json,manager_token_hash,registered_at,indexed_from_block,last_decoded_block,event_count,decode_error) VALUES(?,?,?,?,?,?,?,?,0,NULL)"
  ).run(slug, address, name || null, parsedAbi.abiJson, hashManagerToken(manageToken), new Date().toISOString(), indexedFrom, cursor == null ? null : Number(cursor));
  if (cursor != null && Number(cursor) >= 0) {
    try { decodeContractLogsForSlug(db, slug, 0, Number(cursor)); }
    catch (error) {
      db.prepare("UPDATE registered_contracts SET decode_error=? WHERE slug=?").run(String(error?.message || error).slice(0, 800), slug);
    }
  }
  const record = db.prepare(
    "SELECT slug,address,name,registered_at,indexed_from_block,last_decoded_block,event_count,decode_error FROM registered_contracts WHERE slug=?"
  ).get(slug);
  return {
    slug: record.slug,
    address: record.address,
    name: record.name,
    url: "/api/contracts/" + record.slug,
    events_url: "/api/contracts/" + record.slug + "/events",
    manage_token: manageToken,
    indexed_from_block: record.indexed_from_block,
    event_count: record.event_count,
    note: "Save manage_token now. It is shown only once and is required for resync or delete."
  };
}

function getRegisteredContract(db, slug) {
  return db.prepare(
    "SELECT slug,address,name,abi_json,manager_token_hash,registered_at,indexed_from_block,last_decoded_block,event_count,decode_error FROM registered_contracts WHERE slug=?"
  ).get(slug);
}

function publicContractRecord(row) {
  if (!row) return null;
  return {
    slug: row.slug,
    address: row.address,
    name: row.name,
    registered_at: row.registered_at,
    indexed_from_block: row.indexed_from_block,
    last_decoded_block: row.last_decoded_block,
    event_count: row.event_count,
    decode_error: row.decode_error || null
  };
}

function boundedLimit(value, fallback = 30, max = 100) {
  if (value == null || value === "") return fallback;
  if (!/^[0-9]+$/.test(String(value))) throw new Error("limit must be an integer.");
  return Math.min(max, Math.max(1, Number(value)));
}

async function handleSearch(db, q, runtime) {
  const parsed = classifyLookup(q);
  if (parsed.type === "address") return resolveAddress(db, parsed.value);
  if (parsed.type === "substrate_address") return resolveSubstrateAddress(db, runtime, parsed.value);
  if (parsed.type === "block_number") return resolveBlock(db, String(parsed.value));
  if (parsed.type === "hash") {
    const tx = await resolveTransaction(db, parsed.value);
    if (tx.source !== "not_found") return tx;
    const substrateExtrinsic = readSubstrateExtrinsic(db, parsed.value);
    if (substrateExtrinsic) return substrateExtrinsic;
    const substrateBlock = readSubstrateBlock(db, parsed.value);
    if (substrateBlock) return substrateBlock;
    const block = await resolveBlock(db, parsed.value);
    if (block.source === "live_rpc" || block.source === "indexer") return block;
    return tx;
  }
  return { source: "invalid", error: "Enter a transaction or block hash, decimal block number, or 20-byte EVM address." };
}

function jsonResponse(res, statusCode, value, origin = null) {
  const headers = {
    "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
    "x-content-type-options": "nosniff", "vary": "Origin"
  };
  if (origin) headers["access-control-allow-origin"] = origin;
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(value));
}

function htmlResponse(res, statusCode, content) {
  res.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8", "cache-control": "no-cache",
    "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin"
  });
  res.end(content);
}

function allowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return null;
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  const host = req.headers.host;
  if (host) {
    const scheme = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
    try {
      const parsed = new URL(origin);
      if (parsed.host === host && parsed.protocol.slice(0, -1) === scheme) return origin;
    } catch {}
  }
  return false;
}

function queryInteger(url, key, fallback, max) {
  const raw = url.searchParams.get(key);
  if (raw == null) return fallback;
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) throw new Error(key + " must be a decimal integer.");
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n > max) throw new Error(key + " is outside the allowed range.");
  return n;
}

async function apiRoute(req, res, url, db, runtime) {
  if (req.method === "OPTIONS") {
    const origin = allowedOrigin(req);
    if (origin === false) return jsonResponse(res, 403, { error: "Origin not allowed." });
    const headers = {
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type", "access-control-max-age": "600", "vary": "Origin"
    };
    if (origin) headers["access-control-allow-origin"] = origin;
    res.writeHead(204, headers);
    return res.end();
  }
  if (req.method !== "GET") return jsonResponse(res, 405, { error: "Read-only API; only GET is supported." });
  const origin = allowedOrigin(req);
  if (origin === false) return jsonResponse(res, 403, { error: "Origin not allowed." }, null);
  const path = url.pathname;
  try {
    if (path === "/health") return jsonResponse(res, 200, { ok: true, service: "portal-dot-explorer" }, origin);
    if (path === "/api/status") {
      let live = { connected: false, chainId: null, latestBlock: null, error: runtime.lastRpcError };
      try {
        const [chain, head] = await Promise.all([rpc("eth_chainId"), rpc("eth_blockNumber")]);
        live = { connected: true, chainId: BigInt(chain).toString(), latestBlock: blockNumberFromHex(head), error: null };
        runtime.lastRpcError = null;
      } catch (error) { live.error = error.message; runtime.lastRpcError = error.message; }
      return jsonResponse(res, 200, {
        service: "portal-dot-explorer", network: "PortalDot V3 EVM testnet", rpcOrigin: RPC_ORIGIN,
        expectedChainId: EXPECTED_CHAIN_ID.toString(),
        chainMatches: live.chainId != null && live.chainId === EXPECTED_CHAIN_ID.toString(),
        live,
        indexer: getIndexerStatus(db),
        substrate: getSubstrateIndexerStatus(db, runtime),
        knownEvidence: KNOWN_EVIDENCE
      }, origin);
    }
    if (path === "/api/known-evidence") return jsonResponse(res, 200, KNOWN_EVIDENCE, origin);
    if (path === "/api/substrate/status") {
      return jsonResponse(res, 200, getSubstrateIndexerStatus(db, runtime), origin);
    }
    if (path === "/api/substrate/blocks") {
      const limit = boundedLimit(url.searchParams.get("limit"), 30);
      const rows = db.prepare(
        "SELECT block_number,block_hash,parent_hash,state_root,extrinsics_root,timestamp_ms,extrinsic_count,event_count,raw_json,indexed_at FROM substrate_blocks ORDER BY block_number DESC LIMIT ?"
      ).all(limit);
      return jsonResponse(res, 200, {
        source: "substrate_indexer",
        indexedThrough: getSubstrateIndexerStatus(db, runtime).indexedThrough,
        items: rows.map((row) => ({
          blockNumber: row.block_number, blockHash: row.block_hash, parentHash: row.parent_hash,
          stateRoot: row.state_root, extrinsicsRoot: row.extrinsics_root, timestampMs: row.timestamp_ms,
          extrinsicCount: row.extrinsic_count, eventCount: row.event_count,
          block: JSON.parse(row.raw_json), indexedAt: row.indexed_at
        }))
      }, origin);
    }
    if (path === "/api/substrate/extrinsics") {
      const limit = boundedLimit(url.searchParams.get("limit"), 30);
      const section = url.searchParams.get("section");
      const method = url.searchParams.get("method");
      const signer = url.searchParams.get("signer");
      if (signer && !cleanSubstrateAccount(signer)) return jsonResponse(res, 400, { error: "signer must be an SS58 address." }, origin);
      let sql = "SELECT block_number,extrinsic_index,extrinsic_hash,section,method,signer,raw_json FROM substrate_extrinsics WHERE 1=1";
      const args = [];
      if (section) { sql += " AND section=?"; args.push(section.slice(0,100)); }
      if (method) { sql += " AND method=?"; args.push(method.slice(0,100)); }
      if (signer) { sql += " AND signer=?"; args.push(signer); }
      sql += " ORDER BY block_number DESC,extrinsic_index DESC LIMIT ?";
      args.push(limit);
      return jsonResponse(res, 200, {
        source: "substrate_indexer",
        items: db.prepare(sql).all(...args).map((row) => ({
          blockNumber: row.block_number, extrinsicIndex: row.extrinsic_index, hash: row.extrinsic_hash,
          section: row.section, method: row.method, signer: row.signer, extrinsic: JSON.parse(row.raw_json)
        }))
      }, origin);
    }
    if (path === "/api/substrate/events") {
      const limit = boundedLimit(url.searchParams.get("limit"), 50);
      const cursor = Number(readState(db, "substrate_cursor") || 0);
      const started = Number(readState(db, "substrate_started_from") || 0);
      const fromBlock = queryInteger(url, "fromBlock", Math.max(0, cursor - 1000), Number.MAX_SAFE_INTEGER);
      const toBlock = queryInteger(url, "toBlock", cursor, Number.MAX_SAFE_INTEGER);
      if (toBlock < fromBlock || toBlock - fromBlock > 10000) return jsonResponse(res, 400, { error: "Invalid Substrate event range; maximum range is 10000 blocks." }, origin);
      const section = url.searchParams.get("section");
      const method = url.searchParams.get("method");
      const address = url.searchParams.get("address");
      if (address && !cleanSubstrateAccount(address)) return jsonResponse(res, 400, { error: "address must be an SS58 address." }, origin);
      let sql = "SELECT e.block_number,e.event_index,e.extrinsic_index,e.section,e.method,e.data_json,e.raw_json FROM substrate_events e WHERE e.block_number BETWEEN ? AND ?";
      const args = [fromBlock, toBlock];
      if (section) { sql += " AND e.section=?"; args.push(section.slice(0,100)); }
      if (method) { sql += " AND e.method=?"; args.push(method.slice(0,100)); }
      if (address) {
        sql += " AND EXISTS (SELECT 1 FROM substrate_event_accounts a WHERE a.block_number=e.block_number AND a.event_index=e.event_index AND a.address=?)";
        args.push(address);
      }
      sql += " ORDER BY e.block_number DESC,e.event_index DESC LIMIT ?";
      args.push(limit);
      return jsonResponse(res, 200, {
        source: "substrate_indexer", indexedThrough: getSubstrateIndexerStatus(db, runtime).indexedThrough,
        fromBlock, toBlock,
        items: db.prepare(sql).all(...args).map((row) => ({
          blockNumber: row.block_number, eventIndex: row.event_index, extrinsicIndex: row.extrinsic_index,
          section: row.section, method: row.method, data: JSON.parse(row.data_json), event: JSON.parse(row.raw_json)
        }))
      }, origin);
    }
    if (path.startsWith("/api/substrate/block/")) {
      const ref = decodeURIComponent(path.slice("/api/substrate/block/".length));
      if (!/^(0|[1-9][0-9]*)$/.test(ref) && !normaliseHash(ref)) return jsonResponse(res, 400, { error: "Block reference must be a decimal number or 32-byte hash." }, origin);
      const block = readSubstrateBlock(db, ref);
      return jsonResponse(res, 200, block || {
        source: "not_found",
        note: "This Substrate block is not in the indexed range or its history could not be read.",
        indexer: getSubstrateIndexerStatus(db, runtime)
      }, origin);
    }
    if (path.startsWith("/api/substrate/extrinsic/")) {
      const hash = decodeURIComponent(path.slice("/api/substrate/extrinsic/".length));
      if (!normaliseHash(hash)) return jsonResponse(res, 400, { error: "Extrinsic hash must be 32 bytes." }, origin);
      return jsonResponse(res, 200, readSubstrateExtrinsic(db, hash) || { source: "not_found" }, origin);
    }
    if (path.startsWith("/api/substrate/address/")) {
      const address = decodeURIComponent(path.slice("/api/substrate/address/".length));
      if (!cleanSubstrateAccount(address)) return jsonResponse(res, 400, { error: "Address must be an SS58 address." }, origin);
      try { return jsonResponse(res, 200, await resolveSubstrateAddress(db, runtime, address), origin); }
      catch (error) { return jsonResponse(res, 502, { error: error.message || "Substrate RPC error." }, origin); }
    }
    if (path === "/api/search") {
      const q = (url.searchParams.get("q") || "").trim();
      if (!q || q.length > 256) return jsonResponse(res, 400, { error: "Supply q (max 256 characters)." }, origin);
      return jsonResponse(res, 200, await handleSearch(db, q, runtime), origin);
    }
    if (path.startsWith("/api/tx/")) {
      const hash = normaliseHash(decodeURIComponent(path.slice("/api/tx/".length)));
      if (!hash) return jsonResponse(res, 400, { error: "Transaction hash must be 32 bytes." }, origin);
      return jsonResponse(res, 200, await resolveTransaction(db, hash), origin);
    }
    if (path.startsWith("/api/block/")) {
      const ref = decodeURIComponent(path.slice("/api/block/".length));
      if (!/^(0|[1-9][0-9]*)$/.test(ref) && !normaliseHash(ref)) return jsonResponse(res, 400, { error: "Block reference must be a decimal number or 32-byte hash." }, origin);
      return jsonResponse(res, 200, await resolveBlock(db, ref), origin);
    }
    if (path.startsWith("/api/address/")) {
      const address = normaliseAddress(decodeURIComponent(path.slice("/api/address/".length)));
      if (!address) return jsonResponse(res, 400, { error: "Address must be 20 bytes." }, origin);
      try { return jsonResponse(res, 200, await resolveAddress(db, address), origin); }
      catch (error) { return jsonResponse(res, 502, { error: error.message }, origin); }
    }
    if (path === "/api/blocks") {
      const limit = boundedLimit(url.searchParams.get("limit"));
      const rows = db.prepare("SELECT block_number,block_hash,parent_hash,block_timestamp,transaction_count,raw_json,indexed_at FROM blocks ORDER BY block_number DESC LIMIT ?").all(limit);
      return jsonResponse(res, 200, { source: "indexer", items: rows.map((row) => ({
        blockNumber: row.block_number, blockHash: row.block_hash, parentHash: row.parent_hash,
        timestamp: row.block_timestamp, transactionCount: row.transaction_count,
        block: JSON.parse(row.raw_json), indexedAt: row.indexed_at
      })) }, origin);
    }
    if (path === "/api/transactions") {
      const limit = boundedLimit(url.searchParams.get("limit"), 30);
      const rows = db.prepare("SELECT tx_hash,block_number,tx_index,from_address,to_address,value_hex,raw_json,indexed_at FROM transactions ORDER BY block_number DESC,tx_index DESC LIMIT ?").all(limit);
      return jsonResponse(res, 200, { source: "indexer", items: rows.map((row) => ({
        hash: row.tx_hash, blockNumber: row.block_number, transactionIndex: row.tx_index,
        from: row.from_address, to: row.to_address, value: row.value_hex,
        transaction: JSON.parse(row.raw_json), indexedAt: row.indexed_at
      })) }, origin);
    }
    if (path === "/api/logs") {
      const cursor = Number(readState(db, "cursor") || 0);
      const fromBlock = queryInteger(url, "fromBlock", Math.max(0, cursor - 1000), Number.MAX_SAFE_INTEGER);
      const toBlock = queryInteger(url, "toBlock", cursor, Number.MAX_SAFE_INTEGER);
      if (toBlock < fromBlock || toBlock - fromBlock > 10000) return jsonResponse(res, 400, { error: "Invalid log range; maximum range is 10000 blocks." }, origin);
      const address = url.searchParams.get("address");
      const topic = url.searchParams.get("topic0");
      if (address && !normaliseAddress(address)) return jsonResponse(res, 400, { error: "address must be a 20-byte EVM address." }, origin);
      if (topic && !normaliseHash(topic)) return jsonResponse(res, 400, { error: "topic0 must be a 32-byte hash." }, origin);
      const limit = boundedLimit(url.searchParams.get("limit"), 100);
      let sql = "SELECT raw_json FROM logs WHERE block_number BETWEEN ? AND ?";
      const args = [fromBlock, toBlock];
      if (address) { sql += " AND contract_address=?"; args.push(address.toLowerCase()); }
      if (topic) { sql += " AND topic0=?"; args.push(topic.toLowerCase()); }
      sql += " ORDER BY block_number DESC,log_index DESC LIMIT ?";
      args.push(limit);
      return jsonResponse(res, 200, {
        source: "indexer", indexedThrough: readState(db, "cursor"), fromBlock, toBlock,
        items: db.prepare(sql).all(...args).map((row) => JSON.parse(row.raw_json))
      }, origin);
    }
    return jsonResponse(res, 404, { error: "API route not found." }, origin);
  } catch (error) {
    const code = error instanceof URIError ? 400 : 500;
    return jsonResponse(res, code, { error: error.message || "Internal error." }, origin);
  }
}

function saveKnownEvidence(db) {
  // Reference metadata only; this does not assert that the live RPC can still return a receipt.
  upsertState(db, "known_evidence_count", KNOWN_EVIDENCE.length);
}

async function indexRange(db, startBlock, endBlock, advanceCursor = true) {
  const requests = [];
  for (let number = startBlock; number <= endBlock; number++) {
    requests.push({ method: "eth_getBlockByNumber", params: ["0x" + number.toString(16), true] });
  }
  const results = await rpcBatch(requests);
  const blocks = [];
  const blockErrors = [];
  for (let i = 0; i < results.length; i++) {
    const number = startBlock + i;
    const result = results[i];
    if (result && result.result && normaliseHash(result.result.hash)) {
      blocks.push(result.result);
    } else {
      let reason = result?.error?.message || "RPC returned null for this block.";
      try {
        const retry = await rpc("eth_getBlockByNumber", ["0x" + number.toString(16), true]);
        if (retry && normaliseHash(retry.hash)) blocks.push(retry);
        else blockErrors.push({ block: number, error: reason });
      } catch (error) {
        reason = error.message || reason;
        blockErrors.push({ block: number, error: reason });
      }
    }
  }
  let logs = [];
  let logsError = null;
  try {
    const result = await rpc("eth_getLogs", [{
      fromBlock: "0x" + startBlock.toString(16), toBlock: "0x" + endBlock.toString(16)
    }]);
    if (!Array.isArray(result)) throw new Error("eth_getLogs returned a non-array result.");
    logs = result;
  } catch (error) { logsError = error.message; }
  persistBatch(db, { blocks, logs, startBlock, endBlock, blockErrors, logsError, advanceCursor });
  decodeRegisteredContractLogs(db, startBlock, endBlock);
  return { blocks: blocks.length, missingBlocks: blockErrors.length, logs: logs.length, logsError };
}

async function retryOneGap(db) {
  const gap = db.prepare("SELECT component,start_block,end_block FROM indexer_gaps WHERE component IN ('blocks','logs') ORDER BY updated_at ASC LIMIT 1").get();
  if (!gap) return;
  const from = gap.start_block;
  const to = gap.end_block;
  if (to - from + 1 > BATCH_BLOCKS) {
    const chunkEnd = from + BATCH_BLOCKS - 1;
    await indexRange(db, from, chunkEnd, false);
    if (!db.prepare("SELECT 1 FROM indexer_gaps WHERE component=? AND start_block=? AND end_block=?").get(gap.component, from, to)) return;
    db.prepare("DELETE FROM indexer_gaps WHERE component=? AND start_block=? AND end_block=?").run(gap.component, from, to);
    addGap(db, gap.component, chunkEnd + 1, to, "Remaining portion of a previously recorded gap.");
    return;
  }
  await indexRange(db, from, to, false);
}

async function runIndexer(db, runtime) {
  let cycles = 0;
  while (!runtime.stopping) {
    try {
      const [chainHex, headHex] = await Promise.all([rpc("eth_chainId"), rpc("eth_blockNumber")]);
      const chainId = BigInt(chainHex);
      const head = blockNumberFromHex(headHex);
      runtime.lastRpcError = null;
      runtime.lastHead = head;
      if (chainId !== EXPECTED_CHAIN_ID) throw new Error("Chain ID mismatch: expected " + EXPECTED_CHAIN_ID + ", received " + chainId + ".");
      let cursorText = readState(db, "cursor");
      if (cursorText == null) {
        let firstBlock;
        if (START_BLOCK_ENV !== "") {
          if (!/^(0|[1-9][0-9]*)$/.test(START_BLOCK_ENV)) throw new Error("EXPLORER_START_BLOCK must be a decimal block number.");
          firstBlock = Number(START_BLOCK_ENV);
          if (!Number.isSafeInteger(firstBlock) || firstBlock < 0) throw new Error("EXPLORER_START_BLOCK is outside the supported range.");
        } else {
          firstBlock = Math.max(0, head - BACKFILL_BLOCKS + 1);
        }
        upsertState(db, "started_from", firstBlock);
        upsertState(db, "cursor", firstBlock - 1);
        cursorText = String(firstBlock - 1);
      }
      const targetHead = Math.max(0, head - CONFIRMATIONS);
      const cursor = Number(cursorText);
      if (cursor < targetHead) {
        const start = cursor + 1;
        const end = Math.min(targetHead, start + BATCH_BLOCKS - 1);
        await indexRange(db, start, end, true);
      } else {
        cycles++;
        if (cycles % GAP_RETRY_CYCLES === 0) await retryOneGap(db);
        else await sleep(POLL_MS);
      }
    } catch (error) {
      runtime.lastRpcError = error.message || String(error);
      await sleep(Math.max(POLL_MS, 8000));
    }
  }
}

function sleep(ms) { return new Promise((resolvePromise) => setTimeout(resolvePromise, ms)); }

async function readStaticFile(pathname) {
  const files = {
    "/": resolve(ROOT, "web3-dapp/explorer/index.html"),
    "/explorer": resolve(ROOT, "web3-dapp/explorer/index.html"),
    "/explorer/": resolve(ROOT, "web3-dapp/explorer/index.html"),
    "/dashboard": resolve(ROOT, "web3-dapp/index.html"),
    "/dashboard/": resolve(ROOT, "web3-dapp/index.html"),
    "/dashboard/explorer": resolve(ROOT, "web3-dapp/explorer/index.html"),
    "/dashboard/explorer/": resolve(ROOT, "web3-dapp/explorer/index.html")
  };
  const filePath = files[pathname];
  if (!filePath || !existsSync(filePath)) return null;
  return readFile(filePath, "utf8");
}

export async function createExplorerServer({ db, runtime = { lastRpcError: null, lastHead: null, stopping: false } }) {
  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url || req.url.length > 2048) return jsonResponse(res, 414, { error: "Request URL is too long." });
      const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
      if (url.pathname === "/health" || url.pathname.startsWith("/api/")) {
        return await apiRoute(req, res, url, db, runtime);
      }
      if (req.method !== "GET" && req.method !== "HEAD") return jsonResponse(res, 405, { error: "Only GET is supported." });
      const content = await readStaticFile(url.pathname);
      if (content != null) {
        if (req.method === "HEAD") {
          res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
          return res.end();
        }
        return htmlResponse(res, 200, content);
      }
      return jsonResponse(res, 404, { error: "Not found." });
    } catch (error) {
      if (!res.headersSent) jsonResponse(res, 500, { error: error.message || "Internal error." });
      else res.end();
    }
  });
  return { server, runtime };
}

async function main() {
  const db = openExplorerDatabase(DB_PATH);
  saveKnownEvidence(db);
  const runtime = {
    lastRpcError: null, lastHead: null, stopping: false,
    substrateApi: null, substrateConnected: false, substrateGenesisHash: null,
    substrateLatestFinalized: null, substrateError: null
  };
  const { server } = await createExplorerServer({ db, runtime });
  server.listen(PORT, "0.0.0.0", () => {
    console.log("PortalDot Explorer API listening on 0.0.0.0:" + PORT);
    console.log("EVM RPC origin: " + RPC_ORIGIN);
    console.log("Substrate WS origin: " + new URL(SUBSTRATE_WS_URL).origin);
    console.log("SQLite database: " + DB_PATH);
    console.log("EVM indexer: start block " + (START_BLOCK_ENV || ("latest - " + BACKFILL_BLOCKS)) + ", batch " + BATCH_BLOCKS + ", confirmations " + CONFIRMATIONS);
    console.log("Substrate indexer: start block " + (SUBSTRATE_START_BLOCK_ENV || ("finalized - " + SUBSTRATE_BACKFILL_BLOCKS)) + ", batch " + SUBSTRATE_BATCH_BLOCKS);
  });
  runIndexer(db, runtime).catch((error) => {
    runtime.lastRpcError = error.message || String(error);
    console.error("EVM indexer stopped unexpectedly:", runtime.lastRpcError);
  });
  runSubstrateIndexer(db, runtime).catch((error) => {
    runtime.substrateError = error.message || String(error);
    console.error("Substrate indexer stopped unexpectedly:", runtime.substrateError);
  });
  const shutdown = () => {
    runtime.stopping = true;
    Promise.resolve(runtime.substrateApi?.disconnect()).catch(() => {});
    server.close(() => {
      try { db.close(); } catch {}
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
