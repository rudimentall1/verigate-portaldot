const EXPECTED_GENESIS = "0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd";

class MockSubstrateWebSocket {
  constructor(url) {
    this.url = url;
    this.listeners = new Map();
    this.closed = false;
    queueMicrotask(() => this.dispatch("open", {}));
  }

  addEventListener(type, callback, options = {}) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push({ callback, once: Boolean(options.once) });
    this.listeners.set(type, listeners);
  }

  dispatch(type, event) {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(type, listeners.filter((item) => !item.once));
    for (const item of listeners) item.callback(event);
  }

  send(raw) {
    let request;
    try {
      request = JSON.parse(raw);
    } catch {
      queueMicrotask(() => this.dispatch("message", { data: "not-json" }));
      return;
    }

    const response = request.method === "chain_getBlockHash" && request.params?.[0] === 0
      ? { jsonrpc: "2.0", id: request.id, result: EXPECTED_GENESIS }
      : { jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Unsupported mock method" } };
    queueMicrotask(() => this.dispatch("message", { data: JSON.stringify(response) }));
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    queueMicrotask(() => this.dispatch("close", {}));
  }
}

Object.defineProperty(globalThis, "WebSocket", {
  configurable: true,
  writable: true,
  value: MockSubstrateWebSocket
});
