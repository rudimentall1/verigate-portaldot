import crypto from "node:crypto";

export const DEFAULT_SUBSTRATE_RPC_URL = "wss://test-node-v3.portaldot.dev";
const RPC_TIMEOUT_MS = 10_000;
const ALLOWED_METHODS = new Set([
  "system_chain",
  "system_name",
  "system_version",
  "chain_getFinalizedHead",
  "chain_getBlockHash",
  "chain_getHeader",
  "state_getRuntimeVersion",
  "state_getMetadata"
]);

function fail(message) {
  throw new Error(message);
}

export function validateSubstrateRpcUrl(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    fail("PORTALDOT_SUBSTRATE_RPC_URL must be a valid absolute WebSocket URL.");
  }
  if (url.username || url.password) {
    fail("PORTALDOT_SUBSTRATE_RPC_URL must not embed credentials.");
  }
  const isLoopback = new Set(["localhost", "127.0.0.1", "[::1]"]).has(url.hostname.toLowerCase());
  if (url.protocol !== "wss:" && !(url.protocol === "ws:" && isLoopback)) {
    fail("Substrate RPC must use WSS; plain WS is allowed only for local loopback development.");
  }
  return { url: url.toString(), origin: url.origin };
}

export function parseCanonicalHexNumber(value, label = "RPC quantity") {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)) {
    fail(`${label} must be a canonical hexadecimal quantity.`);
  }
  return BigInt(value);
}

export function summarizeRuntimeMetadata(metadataHex) {
  if (typeof metadataHex !== "string" || !/^0x(?:[a-fA-F0-9]{2})+$/.test(metadataHex)) {
    fail("state_getMetadata must return a non-empty even-length hexadecimal byte string.");
  }
  const metadata = Buffer.from(metadataHex.slice(2), "hex");
  const contains = (name) => metadata.includes(Buffer.from(name, "utf8"));
  return {
    metadataBytes: metadata.length,
    metadataSha256: crypto.createHash("sha256").update(metadata).digest("hex"),
    palletOrStorageNameHints: {
      revive: contains("Revive"),
      addressSuffix: contains("AddressSuffix"),
      originalAccount: contains("OriginalAccount")
    },
    note: "Name presence is only a byte-level hint, not a decoded storage definition. Inspect runtime metadata types before querying mapping state."
  };
}

function rpcErrorText(error) {
  if (error && typeof error.message === "string") return error.message.slice(0, 500);
  return "unknown WebSocket RPC error";
}

function openWebSocket(url, WebSocketImpl, timeoutMs) {
  return new Promise((resolve, reject) => {
    let socket;
    try {
      socket = new WebSocketImpl(url);
    } catch (error) {
      reject(new Error(`Could not create Substrate WebSocket: ${rpcErrorText(error)}`));
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { socket.close(); } catch {}
      reject(new Error("Timed out connecting to the Substrate WebSocket endpoint."));
    }, timeoutMs);

    socket.addEventListener("open", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(socket);
    }, { once: true });
    socket.addEventListener("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error("Substrate WebSocket connection failed or endpoint rejected the upgrade."));
    }, { once: true });
  });
}

function createRpcClient(socket, WebSocketImpl, timeoutMs = RPC_TIMEOUT_MS) {
  let nextId = 0;
  const pending = new Map();
  let closed = false;

  socket.addEventListener("message", (event) => {
    let response;
    try {
      response = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (!response || typeof response !== "object" || Array.isArray(response)) return;
    const entry = pending.get(response.id);
    if (!entry) return;
    pending.delete(response.id);
    clearTimeout(entry.timer);

    if (response.jsonrpc !== "2.0" || response.id !== entry.id) {
      entry.reject(new Error(`${entry.method}: malformed JSON-RPC response envelope.`));
    } else if (response.error !== undefined && response.error !== null) {
      const message = typeof response.error.message === "string"
        ? response.error.message
        : JSON.stringify(response.error);
      entry.reject(new Error(`${entry.method}: JSON-RPC error: ${message}`));
    } else if (!Object.hasOwn(response, "result")) {
      entry.reject(new Error(`${entry.method}: JSON-RPC response has no result field.`));
    } else {
      entry.resolve(response.result);
    }
  });

  socket.addEventListener("close", () => {
    closed = true;
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error(`${entry.method}: WebSocket closed before response arrived.`));
    }
    pending.clear();
  });

  return {
    call(method, params = []) {
      if (!ALLOWED_METHODS.has(method)) {
        return Promise.reject(new Error(`RPC method not allowed by read-only inspector: ${method}`));
      }
      if (closed || socket.readyState !== WebSocketImpl.OPEN) {
        return Promise.reject(new Error("Substrate WebSocket is not open."));
      }
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`${method}: timed out waiting for JSON-RPC response.`));
        }, timeoutMs);
        pending.set(id, { id, method, resolve, reject, timer });
        try {
          socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
        } catch (error) {
          clearTimeout(timer);
          pending.delete(id);
          reject(new Error(`${method}: failed to send read-only request: ${rpcErrorText(error)}`));
        }
      });
    }
  };
}

function validateBlockHash(value, label) {
  if (typeof value !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(value)) {
    fail(`${label} must be a 32-byte block hash.`);
  }
  return value.toLowerCase();
}

export async function inspectSubstrateRuntime(options = {}) {
  const { url, origin } = validateSubstrateRpcUrl(
    options.rpcUrl ?? process.env.PORTALDOT_SUBSTRATE_RPC_URL ?? DEFAULT_SUBSTRATE_RPC_URL
  );
  const WebSocketImpl = options.WebSocketImpl ?? globalThis.WebSocket;
  if (typeof WebSocketImpl !== "function") {
    fail("This command requires Node.js 22 or newer with the built-in WebSocket implementation.");
  }
  const timeoutMs = options.timeoutMs ?? RPC_TIMEOUT_MS;
  const socket = await openWebSocket(url, WebSocketImpl, timeoutMs);
  const rpc = createRpcClient(socket, WebSocketImpl, timeoutMs);

  try {
    const [chainName, nodeName, nodeVersion, finalizedHead, genesisHash] = await Promise.all([
      rpc.call("system_chain"),
      rpc.call("system_name"),
      rpc.call("system_version"),
      rpc.call("chain_getFinalizedHead"),
      rpc.call("chain_getBlockHash", [0])
    ]);
    const finalizedHash = validateBlockHash(finalizedHead, "chain_getFinalizedHead result");
    const genesis = validateBlockHash(genesisHash, "chain_getBlockHash(0) result");
    const [header, runtimeVersion, metadataHex] = await Promise.all([
      rpc.call("chain_getHeader", [finalizedHash]),
      rpc.call("state_getRuntimeVersion", [finalizedHash]),
      rpc.call("state_getMetadata", [finalizedHash])
    ]);
    if (!header || typeof header !== "object" || Array.isArray(header)) {
      fail("chain_getHeader did not return a header object.");
    }
    if (!runtimeVersion || typeof runtimeVersion !== "object" || Array.isArray(runtimeVersion)) {
      fail("state_getRuntimeVersion did not return an object.");
    }
    const blockNumber = parseCanonicalHexNumber(header.number, "Finalized block number");
    const metadata = summarizeRuntimeMetadata(metadataHex);

    return {
      status: "ok",
      checkedAt: new Date().toISOString(),
      rpcOrigin: origin,
      chainName: typeof chainName === "string" ? chainName : null,
      nodeName: typeof nodeName === "string" ? nodeName : null,
      nodeVersion: typeof nodeVersion === "string" ? nodeVersion : null,
      genesisHash: genesis,
      finalizedHead: finalizedHash,
      finalizedBlockNumber: blockNumber.toString(),
      runtimeVersion: {
        specName: runtimeVersion.specName ?? null,
        specVersion: runtimeVersion.specVersion ?? null,
        implName: runtimeVersion.implName ?? null,
        implVersion: runtimeVersion.implVersion ?? null,
        transactionVersion: runtimeVersion.transactionVersion ?? null
      },
      metadata,
      runtimeMappingConfirmed: false,
      performedOnlyReadOnlyRpc: true,
      rpcMethods: [
        "system_chain",
        "system_name",
        "system_version",
        "chain_getFinalizedHead",
        "chain_getBlockHash",
        "chain_getHeader",
        "state_getRuntimeVersion",
        "state_getMetadata"
      ],
      note: "This fingerprints the endpoint's reported runtime and metadata at the finalized head. It does not verify a particular SS58/H160 mapping, and a single RPC endpoint is not independent network authentication."
    };
  } finally {
    try { socket.close(); } catch {}
  }
}

async function main() {
  const { origin } = validateSubstrateRpcUrl(
    process.env.PORTALDOT_SUBSTRATE_RPC_URL ?? DEFAULT_SUBSTRATE_RPC_URL
  );
  try {
    const result = await inspectSubstrateRuntime();
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch (error) {
    process.stdout.write(JSON.stringify({
      status: "error",
      checkedAt: new Date().toISOString(),
      rpcOrigin: origin,
      runtimeMappingConfirmed: false,
      performedOnlyReadOnlyRpc: true,
      error: rpcErrorText(error),
      note: "No transaction or extrinsic was submitted."
    }, null, 2) + "\n");
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`Substrate runtime inspection failed: ${rpcErrorText(error)}\n`);
    process.exitCode = 1;
  });
}
