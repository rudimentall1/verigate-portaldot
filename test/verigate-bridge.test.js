import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { expect } = require("chai");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const hre = (await import("hardhat")).default;
const { ethers } = await hre.network.create();
const { validateAuthorizationBinding, verifyLocally, actionDigest, canonicalJson, signAuthorization, verifyWithVerigate, verifyGuardDeployment } = require("../adapter/verigate-bridge");

describe("Verigate bridge binding", function () {
  let recipient;
  let other;
  let issuerPrivateKey;
  let testKeyDir;
  let publicKeyFile;
  let originalPublicKeyFile;

  before(function () {
    originalPublicKeyFile = process.env.VERIGATE_PUBLIC_KEY_FILE;
    const pair = crypto.generateKeyPairSync("ed25519");
    issuerPrivateKey = pair.privateKey;
    testKeyDir = fs.mkdtempSync(path.join(os.tmpdir(), "verigate-portaldot-tests-"));
    publicKeyFile = path.join(testKeyDir, "issuer.pub");
    fs.writeFileSync(publicKeyFile, pair.publicKey.export({ type: "spki", format: "pem" }));
    process.env.VERIGATE_PUBLIC_KEY_FILE = publicKeyFile;
  });

  after(function () {
    if (originalPublicKeyFile === undefined) delete process.env.VERIGATE_PUBLIC_KEY_FILE;
    else process.env.VERIGATE_PUBLIC_KEY_FILE = originalPublicKeyFile;
    fs.rmSync(testKeyDir, { recursive: true, force: true });
  });

  function signPayload(payload) {
    return crypto.sign(null, Buffer.from(canonicalJson(payload), "utf8"), issuerPrivateKey).toString("base64");
  }

  beforeEach(async function () {
    // Explicit fixture configuration; production code must not assume a chain ID.
    process.env.PORTALDOT_CHAIN_ID = "420420777";
    [, recipient, other] = await ethers.getSigners();
  });

  function response(now, overrides = {}) {
    const target = recipient.address;
    const action = {
      intent_id: "test-intent-001",
      agent_id: "test-agent",
      action_type: "portaldot.native_transfer",
      target,
      amount_exact: "1000000",
      asset: "tPOTv3",
      network: "portaldot-v3",
      metadata: {
        portaldot_v3: {
          chain_id: 420420777,
          recipient: target,
          amount_base_units: "1000000"
        }
      }
    };
    const intent = structuredClone(action);
    const policySha256 = "a".repeat(64);
    const decisionReceipt = {
      algorithm: "Ed25519",
      signature: "",
      payload: {
        intent,
        decision: { decision: "ALLOW", intent_id: intent.intent_id, agent_id: intent.agent_id },
        policy_sha256: policySha256
      }
    };
    decisionReceipt.signature = signPayload(decisionReceipt.payload);
    const authorizationNonce = intent.intent_id;
    const authorizationId = crypto
      .createHash("sha256")
      .update(decisionReceipt.signature + authorizationNonce, "utf8")
      .digest("hex");
    const executionAuthorization = {
      algorithm: "Ed25519",
      signature: "",
      payload: {
        authorization_id: authorizationId,
        action_sha256: actionDigest(action),
        nonce: authorizationNonce,
        policy_sha256: policySha256,
        intent_id: intent.intent_id,
        agent_id: intent.agent_id,
        issued_at: now - 1,
        expires_at: now + 240,
        action
      }
    };
    executionAuthorization.signature = signPayload(executionAuthorization.payload);
    return {
      decision_receipt: decisionReceipt,
      execution_authorization: executionAuthorization,
      ...overrides
    };
  }

  it("verifies both signed artifacts locally against the pinned Ed25519 key", function () {
    const item = response(Math.floor(Date.now() / 1000));
    expect(verifyLocally(item.decision_receipt)).to.equal(true);
    expect(verifyLocally(item.execution_authorization)).to.equal(true);
  });

  it("refuses a forged artifact locally even if the remote verifier might approve it", async function () {
    const originalFetch = global.fetch;
    const item = response(Math.floor(Date.now() / 1000));
    item.execution_authorization.signature = Buffer.alloc(64, 7).toString("base64");
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => ({ valid: true }) };
    };
    try {
      let error;
      try {
        await signAuthorization(item);
      } catch (caught) {
        error = caught;
      }
      expect(error).to.be.instanceOf(Error);
      expect(error.message).to.match(/Local Ed25519 signature verification failed/);
      expect(calls).to.equal(0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("fails closed if no pinned Verigate public key path is configured", async function () {
    const originalPublicKey = process.env.VERIGATE_PUBLIC_KEY_FILE;
    const originalFetch = global.fetch;
    let calls = 0;
    delete process.env.VERIGATE_PUBLIC_KEY_FILE;
    global.fetch = async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => ({ valid: true }) };
    };
    try {
      let error;
      try {
        await signAuthorization(response(Math.floor(Date.now() / 1000)));
      } catch (caught) {
        error = caught;
      }
      expect(error).to.be.instanceOf(Error);
      expect(error.message).to.match(/VERIGATE_PUBLIC_KEY_FILE must point to a pinned/);
      expect(calls).to.equal(0);
    } finally {
      if (originalPublicKey === undefined) delete process.env.VERIGATE_PUBLIC_KEY_FILE;
      else process.env.VERIGATE_PUBLIC_KEY_FILE = originalPublicKey;
      global.fetch = originalFetch;
    }
  });

  it("refuses to sign when Verigate does not verify the decision receipt", async function () {
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return { ok: true, json: async () => ({ valid: false, reason: "invalid signature" }) };
    };
    try {
      let error;
      try {
        await signAuthorization(response(Math.floor(Date.now() / 1000)));
      } catch (caught) {
        error = caught;
      }
      expect(error).to.be.instanceOf(Error);
      expect(error.message).to.match(/signature was not validated/);
      expect(calls).to.equal(1);
    } finally {
      global.fetch = originalFetch;
    }
  });


  it("refuses to sign when the execution authorization fails verification after the receipt passes", async function () {
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = async (_url, options) => {
      calls += 1;
      const body = JSON.parse(options.body);
      expect(body.signature).to.match(/^[A-Za-z0-9+/]+={0,2}$/);
      return {
        ok: true,
        status: 200,
        json: async () => calls === 1
          ? { valid: true }
          : { valid: false, reason: "authorization signature invalid" }
      };
    };
    try {
      let error;
      try {
        await signAuthorization(response(Math.floor(Date.now() / 1000)));
      } catch (caught) {
        error = caught;
      }
      expect(error).to.be.instanceOf(Error);
      expect(error.message).to.match(/signature was not validated: authorization signature invalid/);
      expect(calls).to.equal(2);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("refuses to sign when the Verigate verification endpoint is unreachable", async function () {
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      throw new Error("network unreachable");
    };
    try {
      let error;
      try {
        await signAuthorization(response(Math.floor(Date.now() / 1000)));
      } catch (caught) {
        error = caught;
      }
      expect(error).to.be.instanceOf(Error);
      expect(error.message).to.equal("network unreachable");
      expect(calls).to.equal(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("refuses to sign when Verigate verification times out", async function () {
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = async (_url, options) => {
      calls += 1;
      expect(options.signal).to.be.instanceOf(AbortSignal);
      expect(options.signal.aborted).to.equal(false);
      throw new DOMException("The operation timed out", "TimeoutError");
    };
    try {
      let error;
      try {
        await signAuthorization(response(Math.floor(Date.now() / 1000)));
      } catch (caught) {
        error = caught;
      }
      expect(error).to.be.instanceOf(DOMException);
      expect(error.name).to.equal("TimeoutError");
      expect(calls).to.equal(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("refuses to sign when the Verigate verification endpoint returns HTTP 503", async function () {
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = async (_url, options) => {
      calls += 1;
      expect(options.redirect).to.equal("error");
      return { ok: false, status: 503 };
    };
    try {
      let error;
      try {
        await signAuthorization(response(Math.floor(Date.now() / 1000)));
      } catch (caught) {
        error = caught;
      }
      expect(error).to.be.instanceOf(Error);
      expect(error.message).to.match(/returned HTTP 503/);
      expect(calls).to.equal(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("refuses to sign when the Verigate verification endpoint returns malformed JSON", async function () {
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        json: async () => { throw new SyntaxError("invalid JSON"); }
      };
    };
    try {
      let error;
      try {
        await signAuthorization(response(Math.floor(Date.now() / 1000)));
      } catch (caught) {
        error = caught;
      }
      expect(error).to.be.instanceOf(SyntaxError);
      expect(error.message).to.equal("invalid JSON");
      expect(calls).to.equal(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("refuses to send verifier requests to remote HTTP endpoints", async function () {
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => ({ valid: true }) };
    };
    try {
      await expect(verifyWithVerigate(
        "http://verigate.example",
        { algorithm: "Ed25519", signature: "fixture", payload: { id: "test" } },
        "fixture-api-key"
      )).to.be.rejectedWith(/must use HTTPS except for loopback/);
      expect(calls).to.equal(0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("allows HTTP only for loopback verifier development", async function () {
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = async (url) => {
      calls += 1;
      expect(url.toString()).to.equal("http://127.0.0.1:8000/v1/verify");
      return { ok: true, status: 200, json: async () => ({ valid: true }) };
    };
    try {
      await verifyWithVerigate(
        "http://127.0.0.1:8000",
        { algorithm: "Ed25519", signature: "fixture", payload: { id: "test" } },
        ""
      );
      expect(calls).to.equal(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("refuses credentials embedded in the verifier URL", async function () {
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => ({ valid: true }) };
    };
    try {
      let error;
      try {
        await verifyWithVerigate(
          "https://user:password@verigate.example",
          { algorithm: "Ed25519", signature: "fixture", payload: { id: "test" } },
          ""
        );
      } catch (caught) {
        error = caught;
      }
      expect(error).to.be.instanceOf(Error);
      expect(error.message).to.match(/must not embed credentials/);
      expect(calls).to.equal(0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("sends the exact signed artifact to the configured Verigate verifier", async function () {
    const originalFetch = global.fetch;
    const attestation = {
      algorithm: "Ed25519",
      signature: "fixture-signature",
      payload: { artifact_id: "fixture-artifact", decision: "ALLOW" }
    };
    let calls = 0;
    global.fetch = async (url, options) => {
      calls += 1;
      expect(url.toString()).to.equal("https://verigate.example/v1/verify");
      expect(options.method).to.equal("POST");
      expect(options.redirect).to.equal("error");
      expect(options.headers).to.deep.equal({
        "content-type": "application/json",
        "x-api-key": "fixture-api-key"
      });
      expect(options.signal).to.be.instanceOf(AbortSignal);
      expect(JSON.parse(options.body)).to.deep.equal({
        payload: attestation.payload,
        signature: attestation.signature,
        algorithm: attestation.algorithm
      });
      return { ok: true, status: 200, json: async () => ({ valid: true }) };
    };
    try {
      await verifyWithVerigate("https://verigate.example/base/path", attestation, "fixture-api-key");
      expect(calls).to.equal(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("matches Verigate's compact sorted-key UTF-8 canonical JSON", function () {
    const sample = { z: 2, "é": "café", a: { "β": true, a: null }, items: [1, "x"] };
    expect(canonicalJson(sample)).to.equal('{"a":{"a":null,"β":true},"items":[1,"x"],"z":2,"é":"café"}');
    expect(actionDigest(sample)).to.equal("0cffd54445698991ce85b4a3c73496ca3994791c6105a5eca67ad5bbb4931609");
  });

  it("maps a valid ALLOW to an exact bounded transfer", function () {
    const now = 2000000000;
    const item = response(now);
    const result = validateAuthorizationBinding(item, { now, expectedChainId: 420420777 });
    expect(result.recipient).to.equal(ethers.getAddress(recipient.address));
    expect(result.amount).to.equal(1000000n);
    expect(result.nonce).to.equal(BigInt("0x" + crypto.createHash("sha256")
      .update(item.decision_receipt.signature + item.execution_authorization.payload.nonce, "utf8")
      .digest("hex")));
    expect(result.deadline).to.equal(BigInt(now + 120));
    expect(result.actionId).to.equal(ethers.keccak256(ethers.toUtf8Bytes("test-intent-001")));
  });

  it("refuses an action whose canonical digest no longer matches", function () {
    const item = response(2000000000);
    item.execution_authorization.payload.action.metadata.unreviewed_change = true;
    expect(() => validateAuthorizationBinding(item, { now: 2000000000, expectedChainId: 420420777 }))
      .to.throw(/action digest does not match/);
  });

  it("refuses an authorization action that differs from the receipt intent", function () {
    const item = response(2000000000);
    item.decision_receipt.payload.intent.metadata.extra_receipt_field = "different";
    expect(() => validateAuthorizationBinding(item, { now: 2000000000, expectedChainId: 420420777 }))
      .to.throw(/does not exactly match the signed decision receipt intent/);
  });

  it("refuses BLOCK even when no execution authorization is present", function () {
    const item = response(2000000000);
    item.decision_receipt.payload.decision.decision = "BLOCK";
    delete item.execution_authorization;
    expect(() => validateAuthorizationBinding(item, { now: 2000000000, expectedChainId: 420420777 }))
      .to.throw(/not ALLOW/);
  });

  it("refuses WARN and BLOCK", function () {
    for (const decision of ["WARN", "BLOCK"]) {
      const item = response(2000000000);
      item.decision_receipt.payload.decision.decision = decision;
      expect(() => validateAuthorizationBinding(item, { now: 2000000000, expectedChainId: 420420777 }))
        .to.throw(/not ALLOW/);
    }
  });

  it("refuses a changed recipient mapping", function () {
    const item = response(2000000000);
    item.execution_authorization.payload.action.metadata.portaldot_v3.recipient = other.address;
    expect(() => validateAuthorizationBinding(item, { now: 2000000000, expectedChainId: 420420777 }))
      .to.throw(/do not match/);
  });

  it("refuses a changed amount mapping", function () {
    const item = response(2000000000);
    item.execution_authorization.payload.action.metadata.portaldot_v3.amount_base_units = "2000000";
    expect(() => validateAuthorizationBinding(item, { now: 2000000000, expectedChainId: 420420777 }))
      .to.throw(/amount_exact must equal/);
  });

  it("refuses a wrong chain and expired authorization", function () {
    const now = 2000000000;
    expect(() => validateAuthorizationBinding(response(now), { now, expectedChainId: 1 }))
      .to.throw(/chain ID/);

    const item = response(now);
    item.execution_authorization.payload.expires_at = now;
    expect(() => validateAuthorizationBinding(item, { now, expectedChainId: 420420777 }))
      .to.throw(/expired/);
  });

  it("refuses future-issued and overlong execution authorizations", function () {
    const now = 2000000000;

    const futureIssued = response(now);
    futureIssued.execution_authorization.payload.issued_at = now + 16;
    futureIssued.execution_authorization.payload.expires_at = now + 240;
    expect(() => validateAuthorizationBinding(futureIssued, { now, expectedChainId: 420420777 }))
      .to.throw(/invalid issue time or exceeds Verigate's five-minute TTL/);

    const overlong = response(now);
    overlong.execution_authorization.payload.issued_at = now - 1;
    overlong.execution_authorization.payload.expires_at = now + 301;
    expect(() => validateAuthorizationBinding(overlong, { now, expectedChainId: 420420777 }))
      .to.throw(/invalid issue time or exceeds Verigate's five-minute TTL/);
  });

  it("refuses timestamps outside JavaScript's safe integer range", function () {
    const now = 2000000000;
    const unsafeIssuedAt = response(now);
    unsafeIssuedAt.execution_authorization.payload.issued_at = Number.MAX_SAFE_INTEGER + 1;
    expect(() => validateAuthorizationBinding(unsafeIssuedAt, { now, expectedChainId: 420420777 }))
      .to.throw(/expired or has invalid timestamps/);

    const unsafeExpiresAt = response(now);
    unsafeExpiresAt.execution_authorization.payload.expires_at = Number.MAX_SAFE_INTEGER + 1;
    expect(() => validateAuthorizationBinding(unsafeExpiresAt, { now, expectedChainId: 420420777 }))
      .to.throw(/expired or has invalid timestamps/);
  });

  it("refuses to assume a chain ID when none is configured", function () {
    const configured = process.env.PORTALDOT_CHAIN_ID;
    delete process.env.PORTALDOT_CHAIN_ID;
    try {
      expect(() => validateAuthorizationBinding(response(2000000000), { now: 2000000000 }))
        .to.throw(/PORTALDOT_CHAIN_ID must be explicitly configured/);
    } finally {
      if (configured === undefined) delete process.env.PORTALDOT_CHAIN_ID;
      else process.env.PORTALDOT_CHAIN_ID = configured;
    }
  });

  it("refuses an invalid expected chain ID", function () {
    expect(() => validateAuthorizationBinding(response(2000000000), { now: 2000000000, expectedChainId: Number.MAX_SAFE_INTEGER + 1 }))
      .to.throw(/positive safe integer/);
    expect(() => validateAuthorizationBinding(response(2000000000), { now: 2000000000, expectedChainId: 0 }))
      .to.throw(/positive safe integer/);
  });

  it("refuses non-canonical chain ID encodings", function () {
    const now = 2000000000;
    for (const chainId of ["0420420777", "420420777.0", "4.20420777e8", 420420777.5]) {
      const item = response(now);
      item.execution_authorization.payload.action.metadata.portaldot_v3.chain_id = chainId;
      item.decision_receipt.payload.intent.metadata.portaldot_v3.chain_id = chainId;
      item.execution_authorization.payload.action_sha256 = actionDigest(item.execution_authorization.payload.action);
      expect(() => validateAuthorizationBinding(item, { now, expectedChainId: 420420777 }))
        .to.throw(/chain ID/);
    }
  });

  it("refuses a transfer amount above the EVM uint256 limit", function () {
    const item = response(2000000000);
    const tooLarge = ((1n << 256n)).toString();
    item.decision_receipt.payload.intent.amount_exact = tooLarge;
    item.decision_receipt.payload.intent.metadata.portaldot_v3.amount_base_units = tooLarge;
    item.execution_authorization.payload.action.amount_exact = tooLarge;
    item.execution_authorization.payload.action.metadata.portaldot_v3.amount_base_units = tooLarge;
    item.execution_authorization.payload.action_sha256 = actionDigest(item.execution_authorization.payload.action);
    expect(() => validateAuthorizationBinding(item, { now: 2000000000, expectedChainId: 420420777 }))
      .to.throw(/uint256 limit/);
  });

  it("refuses an authorization ID not derived from the receipt signature and nonce", function () {
    const item = response(2000000000);
    item.execution_authorization.payload.authorization_id = "b".repeat(64);
    expect(() => validateAuthorizationBinding(item, { now: 2000000000, expectedChainId: 420420777 }))
      .to.throw(/authorization ID does not match/);
  });

  it("refuses a nonce that differs from the receipt intent", function () {
    const item = response(2000000000);
    item.execution_authorization.payload.nonce = "different-intent";
    expect(() => validateAuthorizationBinding(item, { now: 2000000000, expectedChainId: 420420777 }))
      .to.throw(/nonce must match/);
  });

  it("refuses a policy digest mismatch", function () {
    const item = response(2000000000);
    item.execution_authorization.payload.policy_sha256 = "d".repeat(64);
    expect(() => validateAuthorizationBinding(item, { now: 2000000000, expectedChainId: 420420777 }))
      .to.throw(/policy digest does not match/);
  });

  it("accepts the exact uint256 maximum without numeric coercion", function () {
    const now = 2000000000;
    const item = response(now);
    const max = ((1n << 256n) - 1n).toString();
    item.decision_receipt.payload.intent.amount_exact = max;
    item.decision_receipt.payload.intent.metadata.portaldot_v3.amount_base_units = max;
    item.execution_authorization.payload.action.amount_exact = max;
    item.execution_authorization.payload.action.metadata.portaldot_v3.amount_base_units = max;
    item.execution_authorization.payload.action_sha256 = actionDigest(item.execution_authorization.payload.action);

    const result = validateAuthorizationBinding(item, { now, expectedChainId: 420420777 });
    expect(result.amount).to.equal((1n << 256n) - 1n);
  });

  it("refuses zero and non-integer transfer amounts", function () {
    for (const amount of ["0", "01", "-1", "1.5", "1e6", ""]) {
      const item = response(2000000000);
      item.decision_receipt.payload.intent.amount_exact = amount;
      item.decision_receipt.payload.intent.metadata.portaldot_v3.amount_base_units = amount;
      item.execution_authorization.payload.action.amount_exact = amount;
      item.execution_authorization.payload.action.metadata.portaldot_v3.amount_base_units = amount;
      item.execution_authorization.payload.action_sha256 = actionDigest(item.execution_authorization.payload.action);

      expect(() => validateAuthorizationBinding(item, { now: 2000000000, expectedChainId: 420420777 }))
        .to.throw(/positive base-unit integer/);
    }
  });


  it("executes an end-to-end Verigate ALLOW through bridge EIP-712 signing into the guard on a local chain", async function () {
    const envKeys = [
      "PORTALDOT_CHAIN_ID",
      "PORTALDOT_RPC_URL",
      "VERIGATE_BASE_URL",
      "VERIGATE_API_KEY",
      "VERIGATE_PUBLIC_KEY_FILE",
      "BRIDGE_SIGNER_PRIVATE_KEY",
      "AUTHORITY_SIGNER_ADDRESS",
      "PORTALDOT_GUARD_ADDRESS",
      "PORTALDOT_GUARD_CODE_HASH"
    ];
    const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    const originalFetch = global.fetch;
    let verifierCalls = 0;

    try {
      const [deployer, , relayer] = await ethers.getSigners();
      const chainId = (await ethers.provider.getNetwork()).chainId;
      const now = Math.floor(Date.now() / 1000);
      const item = response(now);
      const intent = item.decision_receipt.payload.intent;
      const action = item.execution_authorization.payload.action;

      // Re-sign the fixtures for the actual local EVM chain so the EIP-712
      // domain checked by the contract and the bridge uses the same chain ID.
      intent.metadata.portaldot_v3.chain_id = Number(chainId);
      action.metadata.portaldot_v3.chain_id = Number(chainId);
      item.decision_receipt.signature = signPayload(item.decision_receipt.payload);

      const executionPayload = item.execution_authorization.payload;
      executionPayload.authorization_id = crypto
        .createHash("sha256")
        .update(item.decision_receipt.signature + String(executionPayload.nonce), "utf8")
        .digest("hex");
      executionPayload.action_sha256 = actionDigest(action);
      item.execution_authorization.signature = signPayload(executionPayload);

      const bridgeWallet = ethers.Wallet.createRandom();
      const factory = await ethers.getContractFactory("PortalDotAgentGuard");
      const guard = await factory.deploy(bridgeWallet.address);
      await guard.waitForDeployment();
      const guardAddress = await guard.getAddress();
      await deployer.sendTransaction({ to: guardAddress, value: ethers.parseEther("1") });

      process.env.PORTALDOT_CHAIN_ID = chainId.toString();
      process.env.PORTALDOT_RPC_URL = "http://127.0.0.1:8545";
      process.env.VERIGATE_BASE_URL = "https://verigate.example";
      process.env.VERIGATE_API_KEY = "disposable-test-api-key";
      process.env.BRIDGE_SIGNER_PRIVATE_KEY = bridgeWallet.privateKey;
      process.env.AUTHORITY_SIGNER_ADDRESS = bridgeWallet.address;
      process.env.PORTALDOT_GUARD_ADDRESS = guardAddress;
      process.env.PORTALDOT_GUARD_CODE_HASH = ethers.keccak256(await ethers.provider.getCode(guardAddress));
      // The suite's before hook writes this temporary issuer public key.
      process.env.VERIGATE_PUBLIC_KEY_FILE = publicKeyFile;
      global.fetch = async (url, options) => {
        verifierCalls += 1;
        expect(String(url)).to.equal("https://verigate.example/v1/verify");
        expect(options.method).to.equal("POST");
        expect(options.redirect).to.equal("error");
        return { ok: true, status: 200, json: async () => ({ valid: true }) };
      };

      const signed = await signAuthorization(item, { providerFactory: () => ethers.provider });
      expect(signed.domain.chainId).to.equal(chainId);
      expect(signed.domain.verifyingContract).to.equal(guardAddress);
      expect(signed.authoritySigner).to.equal(bridgeWallet.address);
      expect(verifierCalls).to.equal(2);

      const transfer = signed.transfer;
      const nonce = BigInt(transfer.nonce);
      const amount = BigInt(transfer.amount);
      const recipientBefore = await ethers.provider.getBalance(transfer.recipient);

      await expect(guard.connect(relayer).executeTransfer(
        transfer.recipient,
        amount,
        nonce,
        BigInt(transfer.deadline),
        transfer.actionId,
        signed.signature
      )).to.emit(guard, "TransferExecuted")
        .withArgs(transfer.actionId, transfer.recipient, amount, nonce);

      expect(await ethers.provider.getBalance(transfer.recipient)).to.equal(recipientBefore + amount);
      expect(await guard.usedNonces(nonce)).to.equal(true);
    } finally {
      global.fetch = originalFetch;
      for (const key of envKeys) {
        if (originalEnv[key] === undefined) delete process.env[key];
        else process.env[key] = originalEnv[key];
      }
    }
  });

});


describe("On-chain PortalDot guard verification before signing", function () {
  const rpcUrl = "https://rpc.example.invalid";
  const guardAddress = "0x1111111111111111111111111111111111111111";
  const expectedAuthority = "0x2222222222222222222222222222222222222222";
  const otherAuthority = "0x3333333333333333333333333333333333333333";
  const expectedCodeHash = ethers.keccak256("0x6000");

  function mockProvider({ chainId = 420420777n, code = "0x6000" } = {}) {
    return {
      getNetwork: async () => ({ chainId }),
      getCode: async () => code
    };
  }

  async function capturedError(promise) {
    try {
      await promise;
    } catch (error) {
      return error;
    }
    throw new Error("Expected guard verification to fail closed.");
  }

  it("rejects a guard RPC connected to a different chain", async function () {
    const error = await capturedError(verifyGuardDeployment({
      rpcUrl,
      expectedChainId: "420420777",
      guardAddress,
      authoritySigner: expectedAuthority,
      guardCodeHash: expectedCodeHash,
      providerFactory: async () => mockProvider({ chainId: 1n }),
      contractFactory: () => ({ authoritySigner: async () => expectedAuthority })
    }));
    expect(error.message).to.match(/expected 420420777; refusing to sign/);
  });

  it("rejects an address with no deployed contract bytecode", async function () {
    const error = await capturedError(verifyGuardDeployment({
      rpcUrl,
      expectedChainId: "420420777",
      guardAddress,
      authoritySigner: expectedAuthority,
      guardCodeHash: expectedCodeHash,
      providerFactory: async () => mockProvider({ code: "0x" }),
      contractFactory: () => {
        throw new Error("authoritySigner must not be called when no bytecode exists");
      }
    }));
    expect(error.message).to.match(/No deployed contract bytecode/);
  });

  it("rejects a deployed guard whose authority signer differs from configuration", async function () {
    const error = await capturedError(verifyGuardDeployment({
      rpcUrl,
      expectedChainId: "420420777",
      guardAddress,
      authoritySigner: expectedAuthority,
      guardCodeHash: expectedCodeHash,
      providerFactory: async () => mockProvider(),
      contractFactory: () => ({ authoritySigner: async () => otherAuthority })
    }));
    expect(error.message).to.match(/does not match AUTHORITY_SIGNER_ADDRESS/);
  });

  it("rejects remote RPC over plain HTTP before making any request", async function () {
    let calls = 0;
    const error = await capturedError(verifyGuardDeployment({
      rpcUrl: "http://rpc.example.invalid",
      expectedChainId: "420420777",
      guardAddress,
      authoritySigner: expectedAuthority,
      guardCodeHash: expectedCodeHash,
      providerFactory: async () => {
        calls += 1;
        return mockProvider();
      }
    }));
    expect(error.message).to.match(/Remote RPC endpoints must use HTTPS/);
    expect(calls).to.equal(0);
  });
});


describe("PortalDot RPC preflight configuration", function () {
  const { requiredNetworkConfig, safeRpcOrigin } = require("../scripts/preflight");
  const keys = ["PORTALDOT_RPC_URL", "PORTALDOT_CHAIN_ID"];
  let originalEnv;

  beforeEach(function () {
    originalEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    for (const key of keys) delete process.env[key];
  });

  afterEach(function () {
    for (const key of keys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it("fails closed when the RPC URL is missing", function () {
    process.env.PORTALDOT_CHAIN_ID = "420420777";
    expect(() => requiredNetworkConfig()).to.throw(/PORTALDOT_RPC_URL is required/);
  });

  it("fails closed when the chain ID is missing", function () {
    process.env.PORTALDOT_RPC_URL = "https://rpc.example";
    expect(() => requiredNetworkConfig()).to.throw(/PORTALDOT_CHAIN_ID must be explicitly set/);
  });

  it("rejects non-canonical or non-positive chain IDs", function () {
    process.env.PORTALDOT_RPC_URL = "https://rpc.example";
    for (const value of ["0", "-1", "0x1", "420420777x"]) {
      process.env.PORTALDOT_CHAIN_ID = value;
      expect(() => requiredNetworkConfig()).to.throw(/PORTALDOT_CHAIN_ID must be explicitly set/);
    }
  });

  it("rejects malformed RPC URLs", function () {
    process.env.PORTALDOT_RPC_URL = "not a URL";
    process.env.PORTALDOT_CHAIN_ID = "420420777";
    expect(() => requiredNetworkConfig()).to.throw(/valid absolute URL/);
  });

  it("rejects non-HTTP RPC URLs", function () {
    process.env.PORTALDOT_RPC_URL = "wss://rpc.example";
    process.env.PORTALDOT_CHAIN_ID = "420420777";
    expect(() => requiredNetworkConfig()).to.throw(/must use HTTP or HTTPS/);
  });

  it("rejects remote RPC endpoints over plain HTTP", function () {
    process.env.PORTALDOT_RPC_URL = "http://rpc.example/path";
    process.env.PORTALDOT_CHAIN_ID = "420420777";
    expect(() => requiredNetworkConfig()).to.throw(/Remote RPC endpoints must use HTTPS/);
  });

  it("allows HTTP only for loopback development endpoints", function () {
    process.env.PORTALDOT_RPC_URL = "http://127.0.0.1:8545";
    process.env.PORTALDOT_CHAIN_ID = "31337";
    expect(requiredNetworkConfig()).to.deep.equal({
      rpcUrl: "http://127.0.0.1:8545",
      expectedChainId: 31337n
    });
  });

  it("accepts explicit HTTP(S) configuration and parses chain ID exactly", function () {
    process.env.PORTALDOT_RPC_URL = "https://rpc.example/path";
    process.env.PORTALDOT_CHAIN_ID = "420420777";
    expect(requiredNetworkConfig()).to.deep.equal({
      rpcUrl: "https://rpc.example/path",
      expectedChainId: 420420777n
    });
  });

  it("redacts credentials, endpoint paths, and query tokens from the logged RPC origin", function () {
    const endpoint = "https://user:password@rpc.example:8443/v1/private-token?api_key=secret";
    expect(safeRpcOrigin(endpoint)).to.equal("https://rpc.example:8443");
    expect(safeRpcOrigin(endpoint)).not.to.include("password");
    expect(safeRpcOrigin(endpoint)).not.to.include("private-token");
    expect(safeRpcOrigin(endpoint)).not.to.include("secret");
  });

  it("preserves Python float spellings in signed payloads", async function () {
    const source = '{"algorithm":"Ed25519","signature":"fixture-signature","payload":{"small":1e-06,"integer":1,"float":1.0}}';
    const artifact = require("../adapter/verigate-bridge").parseJsonPreservingNumbers(source);
    const canonical = '{"float":1.0,"integer":1,"small":1e-06}';
    expect(canonicalJson(artifact.payload)).to.equal(canonical);
    expect(actionDigest(artifact.payload)).to.equal(
      crypto.createHash("sha256").update(canonical, "utf8").digest("hex")
    );
  });

  it("preserves Python float spellings when sending the signed payload to Verigate", async function () {
    const originalFetch = global.fetch;
    const source = '{"algorithm":"Ed25519","signature":"fixture-signature","payload":{"integral_float":1.0,"integer":1,"small_float":1e-06}}';
    const artifact = require("../adapter/verigate-bridge").parseJsonPreservingNumbers(source);
    global.fetch = async (_url, options) => {
      expect(options.body).to.include('"integral_float":1.0');
      expect(options.body).to.include('"small_float":1e-06');
      expect(JSON.parse(options.body)).to.deep.equal({
        payload: { integral_float: 1, integer: 1, small_float: 0.000001 },
        signature: "fixture-signature",
        algorithm: "Ed25519"
      });
      return { ok: true, status: 200, json: async () => ({ valid: true }) };
    };
    try {
      await verifyWithVerigate("https://verigate.example", artifact, "");
    } finally {
      global.fetch = originalFetch;
    }
  });

});
