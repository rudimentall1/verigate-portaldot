import { createRequire } from "node:module";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { decodeSs58AccountId } = require("./portaldot-address.js");

export const DEFAULT_SUBSTRATE_RPC_URL = "wss://test-node-v3.portaldot.dev";
export const EXPECTED_PORTALDOT_CHAIN_ID = 420420777n;

function fail(message) {
  throw new Error(message);
}

export function validateMappingInputs(h160, ss58Address) {
  if (typeof h160 !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(h160)) {
    fail("EVM mapping key must be 0x followed by exactly 40 hexadecimal characters.");
  }
  if (typeof ss58Address !== "string" || !ss58Address.trim()) {
    fail("Registered Substrate SS58 address is required.");
  }
  const decoded = decodeSs58AccountId(ss58Address.trim());
  return {
    h160: "0x" + h160.slice(2).toLowerCase(),
    ss58Address: ss58Address.trim(),
    ss58Prefix: decoded.ss58Prefix,
    accountIdHex: "0x" + decoded.accountId.toString("hex"),
    accountBytes: decoded.accountId
  };
}

export function parseDotJsonValue(stdout, label = "Polkadot CLI result") {
  const text = String(stdout ?? "").trim();
  if (!text) fail(`${label} is empty; cannot interpret an empty response as a missing mapping.`);
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail(`${label} was not valid JSON. Use polkadot-cli 0.7.0 with --output json; got: ${text.slice(0, 240)}`);
  }
  if (value && typeof value === "object" && !Array.isArray(value) && Object.hasOwn(value, "value")) {
    return value.value;
  }
  return value;
}

export function compareOriginalAccountMapping({ rawStorageValue, h160, ss58Address }) {
  const input = validateMappingInputs(h160, ss58Address);
  if (rawStorageValue === null || rawStorageValue === undefined) {
    return {
      status: "no_mapping_entry",
      storageItem: "Revive.OriginalAccount",
      keyH160: input.h160,
      registeredSubstrateAddress: input.ss58Address,
      registeredAccountIdHex: input.accountIdHex,
      mappingValueAccountIdHex: null,
      mappingMatchesRegisteredAccount: false,
      rpcReportedStateRead: true,
      independentNetworkAuthentication: false,
      transactionSubmitted: false,
      note: "The configured RPC returned no OriginalAccount value for this H160 at query time. This is not proof that another runtime version or account derivation does not exist."
    };
  }

  let mappedAccountBytes;
  let mappingValueAccountIdHex;
  if (typeof rawStorageValue === "string" && /^0x[a-fA-F0-9]{64}$/.test(rawStorageValue)) {
    mappedAccountBytes = Buffer.from(rawStorageValue.slice(2), "hex");
    mappingValueAccountIdHex = "0x" + mappedAccountBytes.toString("hex");
  } else if (typeof rawStorageValue === "string") {
    const decoded = decodeSs58AccountId(rawStorageValue);
    mappedAccountBytes = decoded.accountId;
    mappingValueAccountIdHex = "0x" + decoded.accountId.toString("hex");
  } else {
    fail("Revive.OriginalAccount value must be a 32-byte AccountId32 encoded as SS58 or 0x hex.");
  }

  const matches = mappedAccountBytes.equals(input.accountBytes);
  return {
    status: matches ? "mapping_matches" : "mapping_points_to_another_account",
    storageItem: "Revive.OriginalAccount",
    keyH160: input.h160,
    registeredSubstrateAddress: input.ss58Address,
    registeredAccountIdHex: input.accountIdHex,
    mappingValueAccountIdHex,
    mappingMatchesRegisteredAccount: matches,
    rpcReportedStateRead: true,
    independentNetworkAuthentication: false,
    transactionSubmitted: false,
    note: matches
      ? "The configured RPC returned an OriginalAccount value equal to the supplied SS58 AccountId32. Independently authenticate the RPC/runtime before relying on this result for funds movement."
      : "The configured RPC returned an OriginalAccount value different from the supplied SS58 AccountId32. Do not send funds or infer a cause until the wallet key, runtime and intended account mapping are reconciled."
  };
}

function runDot(dotArgs, env, label) {
  const result = spawnSync("dot", dotArgs, {
    env,
    encoding: "utf8",
    timeout: 45_000,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true
  });
  if (result.error?.code === "ENOENT") {
    fail("Polkadot CLI 'dot' is not installed. Install it with: npm install --global polkadot-cli@0.7.0");
  }
  if (result.error) {
    fail(`${label} could not run: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "").trim().slice(0, 600);
    fail(`${label} failed with exit code ${result.status}: ${detail}`);
  }
  return String(result.stdout ?? "").trim();
}

export function verifyOriginalAccountMapping({ h160, ss58Address, rpcUrl = DEFAULT_SUBSTRATE_RPC_URL }) {
  const input = validateMappingInputs(h160, ss58Address);
  let url;
  try {
    url = new URL(rpcUrl);
  } catch {
    fail("Substrate RPC URL must be a valid absolute WebSocket URL.");
  }
  if (url.username || url.password) fail("Substrate RPC URL must not embed credentials.");
  const isLoopback = new Set(["localhost", "127.0.0.1", "[::1]").has(url.hostname.toLowerCase());
  if (url.protocol !== "wss:" && !(url.protocol === "ws:" && isLoopback)) {
    fail("Substrate RPC must use WSS; plain WS is allowed only on loopback.");
  }

  const dotHome = mkdtempSync(join(tmpdir(), "portaldot-mapping-readonly-"));
  const env = {
    ...process.env,
    DOT_HOME: dotHome,
    DOT_NO_UPDATE_CHECK: "1"
  };

  try {
    runDot(["chain", "add", "portaldot-v3", "--rpc", url.toString()], env, "Adding temporary PortalDot CLI endpoint");
    runDot(["chain", "update", "portaldot-v3"], env, "Fetching PortalDot runtime metadata");

    const chainIdOutput = runDot(
      ["const", "Revive.ChainId", "--chain", "portaldot-v3", "--output", "json"],
      env,
      "Reading Revive.ChainId"
    );
    const chainIdValue = parseDotJsonValue(chainIdOutput, "Revive.ChainId");
    let actualChainId;
    try {
      actualChainId = BigInt(chainIdValue);
    } catch {
      fail(`Revive.ChainId was not an integer: ${String(chainIdValue)}`);
    }
    if (actualChainId !== EXPECTED_PORTALDOT_CHAIN_ID) {
      fail(`Refusing mapping comparison: live Revive.ChainId is ${actualChainId}, expected ${EXPECTED_PORTALDOT_CHAIN_ID}.`);
    }

    const storageOutput = runDot(
      ["query", "Revive.OriginalAccount", input.h160, "--chain", "portaldot-v3", "--output", "json"],
      env,
      "Querying the single Revive.OriginalAccount entry"
    );
    const storageValue = parseDotJsonValue(storageOutput, "Revive.OriginalAccount query");
    const result = compareOriginalAccountMapping({
      rawStorageValue: storageValue,
      h160: input.h160,
      ss58Address: input.ss58Address
    });
    return {
      ...result,
      checkedAt: new Date().toISOString(),
      rpcOrigin: url.origin,
      reportedChainId: actualChainId.toString(),
      queryScope: "one H160 key only",
      usedTemporaryCliHome: true
    };
  } finally {
    rmSync(dotHome, { recursive: true, force: true });
  }
}

function main(args = process.argv.slice(2)) {
  if (args.length < 2 || args.length > 3) {
    fail("Usage: npm run verify:account-mapping -- <candidate-H160> <registered-SS58-AccountId32> [wss://rpc]");
  }
  const result = verifyOriginalAccountMapping({
    h160: args[0],
    ss58Address: args[1],
    rpcUrl: args[2] || DEFAULT_SUBSTRATE_RPC_URL
  });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`Account mapping verification stopped: ${error.message}\n`);
    process.exitCode = 1;
  }
}
