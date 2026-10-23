#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = path.join(root, "web3-dapp", "index.html");
const html = readFileSync(htmlPath, "utf8");

const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(([, attributes, source]) => !/\bsrc\s*=/.test(attributes) && source.trim());
assert.equal(scripts.length, 1, "Expected exactly one non-empty inline dashboard script.");
const inlineScript = scripts[0][2];

const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "verigate-dapp-check-"));
try {
  const jsPath = path.join(temporaryDirectory, "dashboard-inline.mjs");
  writeFileSync(jsPath, inlineScript, "utf8");
  const syntax = spawnSync(process.execPath, ["--check", jsPath], { encoding: "utf8" });
  assert.equal(
    syntax.status,
    0,
    "Dashboard inline JavaScript syntax check failed:\n" + syntax.stdout + syntax.stderr
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

const lookupModulePath = path.join(root, "web3-dapp", "receipt-lookup.mjs");
const lookupModule = readFileSync(lookupModulePath, "utf8");
const moduleSyntax = spawnSync(process.execPath, ["--check", lookupModulePath], { encoding: "utf8" });
assert.equal(
  moduleSyntax.status,
  0,
  "Receipt lookup module syntax check failed:\\n" + moduleSyntax.stdout + moduleSyntax.stderr
);

const ids = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]));
const referencedIds = [...inlineScript.matchAll(/\bel\(["']([^"']+)["']\)/g)].map((match) => match[1]);
const missingIds = [...new Set(referencedIds)].filter((id) => !ids.has(id));
assert.deepEqual(missingIds, [], "JavaScript refers to missing DOM IDs: " + missingIds.join(", "));

for (const marker of [
  'id="receiptLookup"',
  'id="receiptTxHash"',
  'id="receiptResult"',
  "eth_getTransactionReceipt",
  "eth_getTransactionByHash",
  "eth_getBlockByHash",
  'import("./receipt-lookup.mjs")',
  "TransferExecuted",
  "does not prove the transaction never existed",
  "does not prove a Verigate ALLOW decision"
]) {
  assert.ok(html.includes(marker), "Missing dashboard requirement: " + marker);
}
assert.ok(lookupModule.includes("evaluateReceiptResponse"), "Reusable receipt validator must be present.");
assert.ok(lookupModule.includes("findTransferExecutedLogs"), "Reusable event filter must be present.");
assert.ok(!html.includes("HISTORICAL_TX"), "Receipt lookup must not be hardwired to the saved transaction.");
assert.ok(!html.includes("V2_TRANSFER_TX"), "Receipt lookup must not be hardwired to the saved transaction.");
assert.ok(
  !/\beth_(?:sendTransaction|sendRawTransaction|signTransaction)\b/.test(html),
  "Read-only dashboard must not add transaction-broadcast/signing methods."
);

console.log(
  "DApp validation passed: inline JavaScript parses, " +
  new Set(referencedIds).size + " referenced DOM IDs exist, arbitrary receipt lookup is present, and no transaction-broadcast method was found."
);
