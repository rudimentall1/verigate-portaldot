#!/usr/bin/env python3
"""Prepare a distinct, recipient-scoped Verigate authorization for native Substrate dry-run.

This helper:
- never modifies the existing Verigate policy or the EVM capabilities;
- creates a sibling policy and one narrow native Substrate capability;
- starts a second verifier bound to 127.0.0.1:8003;
- uses the already-registered agent identity to request a fresh signed ALLOW;
- writes a mode-0600 authorization response locally.

It does not read the Substrate signing URI, sign a Substrate extrinsic, call
system_dryRun, or broadcast a transaction. Those remain separate steps.
"""
from __future__ import annotations

import base64
import copy
import hashlib
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from decimal import Decimal
from pathlib import Path

ISSUER_ROOT = Path("/opt/verigate-portaldot-issuer")
PLAN_PATH = ISSUER_ROOT / "live-e2e/plan-1ae14879503d.json"
EXPECTED_DB = ISSUER_ROOT / "data/verigate.db"
EXPECTED_AGENT = "portaldot-live-proof-agent-1ae14879503d"
EXPECTED_IDENTITY = "16eadfd3caaea2588729f535b532d2c99a8ec7ffc93fb95cdbdee5b23fd4db88"
OLD_PORT = 8001
NATIVE_PORT = 8003
NATIVE_BASE_URL = f"http://127.0.0.1:{NATIVE_PORT}"
GENESIS_HASH = "0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd"
ACTION_TYPE = "portaldot.substrate_transfer"
NETWORK = "portaldot-v3-substrate"
ASSET = "POT"
DEFAULT_AMOUNT_BASE_UNITS = "10000000000000"  # 0.1 POT at 14 decimals
DEFAULT_MAX_FEE_BASE_UNITS = "1000000000000"  # 0.01 POT; preflight ceiling, not an on-chain fee cap
MAX_AMOUNT = (1 << 128) - 1


def die(message: str) -> None:
    raise RuntimeError(message)


def dotenv_values(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        die(f"Project .env file not found: {path}")
    for line in path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        if s.startswith("export "):
            s = s[7:].lstrip()
        if "=" not in s:
            continue
        k, _, v = s.partition("=")
        v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in ("'", '"'):
            v = v[1:-1]
        values[k.strip()] = v
    return values


def http_json(url: str, payload: dict | None = None, api_key: str = "", timeout: float = 12.0):
    headers = {"Accept": "application/json"}
    data = None
    method = "GET"
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        headers["Content-Type"] = "application/json"
        method = "POST"
    if api_key:
        headers["x-api-key"] = api_key
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read()
            if "json" in response.headers.get("content-type", "").lower():
                return response.status, json.loads(raw.decode("utf-8"))
            return response.status, raw.decode("utf-8")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")[:1200]
        die(f"HTTP {exc.code} from {url}: {body}")
    except Exception as exc:
        die(f"Request to local verifier failed: {type(exc).__name__}: {exc}")


def read_proc_env(pid: int) -> dict[str, str]:
    raw = Path(f"/proc/{pid}/environ").read_bytes().split(b"\0")
    env: dict[str, str] = {}
    for item in raw:
        if b"=" in item:
            k, v = item.split(b"=", 1)
            env[os.fsdecode(k)] = os.fsdecode(v)
    return env


def read_proc_cmd(pid: int) -> list[str]:
    return [os.fsdecode(x) for x in Path(f"/proc/{pid}/cmdline").read_bytes().split(b"\0") if x]


def process_cwd(pid: int) -> Path:
    return Path(os.readlink(f"/proc/{pid}/cwd")).resolve()


def resolve_runtime_path(value: str, cwd: Path) -> Path:
    p = Path(value).expanduser()
    return p.resolve() if p.is_absolute() else (cwd / p).resolve()


def listener_pids(port: int) -> set[int]:
    proc = subprocess.run(
        ["ss", "-ltnp", f"sport = :{port}"],
        check=False, capture_output=True, text=True
    )
    if proc.returncode not in (0, 1):
        die(f"Could not inspect TCP port {port} with ss.")
    return {int(x) for x in re.findall(r"pid=(\d+)", proc.stdout)}


def load_ed25519_private_key(path: Path):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    raw = path.read_bytes()
    key = None
    for loader in (serialization.load_pem_private_key, serialization.load_der_private_key):
        try:
            key = loader(raw, password=None)
            break
        except (ValueError, TypeError):
            continue
    if key is None:
        material = raw.strip()
        candidates = []
        if len(material) == 32:
            candidates.append(material)
        try:
            decoded = base64.b64decode(material, validate=True)
            if len(decoded) == 32:
                candidates.append(decoded)
        except Exception:
            pass
        try:
            decoded = bytes.fromhex(material.decode("ascii"))
            if len(decoded) == 32:
                candidates.append(decoded)
        except Exception:
            pass
        if candidates:
            key = Ed25519PrivateKey.from_private_bytes(candidates[0])
    if not isinstance(key, Ed25519PrivateKey):
        die("The agent key referenced by the existing plan is not a supported Ed25519 key.")
    return key


def public_key_der(key) -> bytes:
    from cryptography.hazmat.primitives import serialization
    return key.public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )


def resolve_key_path(value: str, cwd: Path, client_root: Path) -> Path:
    p = Path(value).expanduser()
    if p.is_absolute():
        return p
    for candidate in (cwd / p, ISSUER_ROOT / p, client_root / p):
        if candidate.is_file():
            return candidate.resolve()
    return (cwd / p).resolve()


def validate_ss58(client_root: Path, address: str) -> None:
    code = (
        "import { decodeAddress, encodeAddress, cryptoWaitReady } from '@polkadot/util-crypto';"
        " await cryptoWaitReady(); const a=process.argv[1];"
        " try { const d=decodeAddress(a);"
        " if (!(d instanceof Uint8Array) || d.length!==32 || encodeAddress(d,42)!==a) process.exit(4);"
        " } catch { process.exit(4); }"
    )
    node = shutil.which("node")
    if not node:
        die("Node.js is required to validate the PortalDot SS58 recipient.")
    check = subprocess.run(
        [node, "--input-type=module", "-e", code, address],
        cwd=client_root, capture_output=True, text=True, timeout=15
    )
    if check.returncode != 0:
        die("PORTALDOT_SUBSTRATE_RECIPIENT_SS58 must be a valid PortalDot SS58 address (prefix 42).")


def check_public_key_binding(server_env: dict[str, str], server_cwd: Path,
                             client_env: dict[str, str], client_root: Path) -> None:
    from cryptography.hazmat.primitives import serialization

    public_path_value = client_env.get("VERIGATE_PUBLIC_KEY_FILE", "").strip()
    expected_fp = client_env.get("VERIGATE_PUBLIC_KEY_SHA256", "").strip().lower()
    if not public_path_value or not re.fullmatch(r"[a-f0-9]{64}", expected_fp):
        die("The project .env must pin VERIGATE_PUBLIC_KEY_FILE and VERIGATE_PUBLIC_KEY_SHA256.")
    public_path = resolve_key_path(public_path_value, server_cwd, client_root)
    if not public_path.is_file():
        die("The pinned Verigate public-key file does not exist.")
    client_key = serialization.load_pem_public_key(public_path.read_bytes())
    client_der = public_key_der(client_key)
    if hashlib.sha256(client_der).hexdigest() != expected_fp:
        die("The configured Verigate public-key fingerprint does not match the public-key file.")

    server_value = server_env.get("VERIGATE_PUBLIC_KEY", "").strip()
    if not server_value:
        die("The current Verigate process does not expose its configured public-key path.")
    server_path = resolve_runtime_path(server_value, server_cwd)
    if not server_path.is_file():
        die("The current Verigate public-key file does not exist.")
    server_key = serialization.load_pem_public_key(server_path.read_bytes())
    if public_key_der(server_key) != client_der:
        die("The running Verigate issuer key differs from the project's pinned public key.")


def verify_agent_key(server_cwd: Path, db_path: Path, plan: dict, agent_key) -> None:
    sys.path.insert(0, str(server_cwd))
    from core.storage import Storage

    storage = Storage(str(db_path))
    try:
        identity = storage.identity(EXPECTED_IDENTITY)
        if identity is None or identity.agent_id != EXPECTED_AGENT:
            die("The pre-existing live proof identity is missing or bound to a different agent.")
        if not storage.identity_is_active(EXPECTED_IDENTITY):
            die("The pre-existing live proof identity is not active.")
        from cryptography.hazmat.primitives import serialization
        registered = base64.b64decode(identity.public_key_b64, validate=True)
        derived = agent_key.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        if registered != derived:
            die("The agent private key referenced by the live plan does not match the registered identity.")
    finally:
        storage.close()


def ensure_capability(server_cwd: Path, db_path: Path, plan: dict, capability_id: str,
                      recipient: str, amount: int) -> str:
    sys.path.insert(0, str(server_cwd))
    from core.capabilities import CapabilityRegistry
    from core.models import Capability
    from core.storage import Storage

    storage = Storage(str(db_path))
    try:
        identity = storage.identity(EXPECTED_IDENTITY)
        if identity is None or identity.agent_id != EXPECTED_AGENT or not storage.identity_is_active(EXPECTED_IDENTITY):
            die("The registered identity is missing or inactive; no native capability created.")
        existing = storage.capability(capability_id)
        if existing is not None:
            status = storage.capability_status(capability_id)
            valid = (
                status == "ACTIVE"
                and existing.agent_id == EXPECTED_AGENT
                and existing.identity_id == EXPECTED_IDENTITY
                and tuple(existing.allowed_actions) == (ACTION_TYPE,)
                and tuple(existing.allowed_targets) == (recipient,)
                and tuple(existing.allowed_networks) == (NETWORK,)
                and tuple(existing.allowed_assets) == (ASSET,)
                and Decimal(str(existing.max_per_action.get(ASSET, "0"))) == Decimal(amount)
            )
            if not valid:
                die("The native capability ID already exists with different or inactive authority; refusing to overwrite.")
            return "reused-existing-active-capability"

        cap = Capability(
            capability_id=capability_id,
            agent_id=EXPECTED_AGENT,
            identity_id=EXPECTED_IDENTITY,
            allowed_actions=(ACTION_TYPE,),
            allowed_targets=(recipient,),
            allowed_networks=(NETWORK,),
            allowed_assets=(ASSET,),
            max_per_action={ASSET: amount},
            metadata={
                "purpose": "Native PortalDot Substrate testnet system_dryRun only; no broadcast performed by preparation helper",
                "recipient_ss58": recipient,
                "genesis_hash": GENESIS_HASH,
                "max_authorized_amount_base_units": str(amount),
            },
        )
        CapabilityRegistry(storage).register(cap)
        return "created-narrow-native-capability"
    finally:
        storage.close()


def main() -> int:
    client_root = Path(__file__).resolve().parent.parent
    client_env = dotenv_values(client_root / ".env")
    for key in ("VERIGATE_API_KEY", "VERIGATE_PUBLIC_KEY_FILE", "VERIGATE_PUBLIC_KEY_SHA256"):
        if not client_env.get(key):
            die(f"The project .env must have {key} configured.")
    if not PLAN_PATH.is_file():
        die(f"The existing agent identity plan was not found: {PLAN_PATH}")

    recipient = client_env.get("PORTALDOT_SUBSTRATE_RECIPIENT_SS58", "").strip()
    if not recipient:
        die("Set PORTALDOT_SUBSTRATE_RECIPIENT_SS58 in the local .env to an SS58 testnet recipient you control; no state was changed.")
    validate_ss58(client_root, recipient)

    amount_text = client_env.get("PORTALDOT_SUBSTRATE_AUTH_AMOUNT_BASE_UNITS", "").strip() or DEFAULT_AMOUNT_BASE_UNITS
    fee_text = client_env.get("PORTALDOT_SUBSTRATE_MAX_FEE_BASE_UNITS", "").strip() or DEFAULT_MAX_FEE_BASE_UNITS
    for label, value in (("PORTALDOT_SUBSTRATE_AUTH_AMOUNT_BASE_UNITS", amount_text),
                         ("PORTALDOT_SUBSTRATE_MAX_FEE_BASE_UNITS", fee_text)):
        if not re.fullmatch(r"[1-9][0-9]*", value) or int(value) > MAX_AMOUNT:
            die(f"{label} must be a canonical positive integer string within the native balance range.")
    amount = int(amount_text)
    max_fee = int(fee_text)
    signer_address = client_env.get("PORTALDOT_SUBSTRATE_SIGNER_ADDRESS", "").strip()
    if signer_address:
        validate_ss58(client_root, signer_address)
        if signer_address == recipient:
            die("Native sender and recipient must differ.")
    elif client_env.get("PORTALDOT_SUBSTRATE_SIGNER_URI", "").strip():
        die("PORTALDOT_SUBSTRATE_SIGNER_URI is configured without PORTALDOT_SUBSTRATE_SIGNER_ADDRESS; no state was changed.")

    plan = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
    if plan.get("agent_id") != EXPECTED_AGENT or plan.get("identity_id") != EXPECTED_IDENTITY:
        die("The existing agent plan is not the expected live proof identity; no state was changed.")
    agent_key_value = plan.get("private_key_path")
    if not isinstance(agent_key_value, str) or not agent_key_value.strip():
        die("The existing agent plan has no private-key path; no state was changed.")

    active_pids = listener_pids(OLD_PORT)
    if len(active_pids) != 1:
        die(f"Expected exactly one process listening on port {OLD_PORT}; found {len(active_pids)}.")
    old_pid = next(iter(active_pids))
    server_env = read_proc_env(old_pid)
    server_cmd = read_proc_cmd(old_pid)
    server_cwd = process_cwd(old_pid)

    if server_env.get("VERIGATE_TENANT_KEY_DIR"):
        die("Tenant-key mode is enabled; this helper refuses shared-database capability provisioning.")
    if server_env.get("VERIGATE_REQUIRE_GOVERNED_POLICY", "").strip().lower() in {"1", "true", "yes"}:
        die("Governed-policy mode is enabled; this helper refuses to bypass governance.")
    if not any("uvicorn" in item for item in server_cmd) or "api.main:app" not in server_cmd:
        die("The listener on port 8001 is not the expected Uvicorn Verigate API process.")
    if "--reload" in server_cmd:
        die("The current Verigate API uses reload mode; refusing to clone its process.")
    if not (server_cwd / "api/main.py").is_file():
        die("Could not locate api/main.py under the current Verigate working directory.")

    db_value = server_env.get("VERIGATE_DB", "").strip()
    policy_value = server_env.get("VERIGATE_POLICY", "").strip()
    if not db_value or not policy_value:
        die("The running Verigate process does not explicitly configure both policy and database paths.")
    db_path = resolve_runtime_path(db_value, server_cwd)
    source_policy_path = resolve_runtime_path(policy_value, server_cwd)
    if db_path.resolve() != EXPECTED_DB.resolve() or not db_path.is_file():
        die("The running verifier does not use the expected live proof database; no changes made.")
    if not source_policy_path.is_file():
        die("The active policy file could not be resolved; no changes made.")

    # Verify keys and agent identity before writing a profile, capability, or service.
    check_public_key_binding(server_env, server_cwd, client_env, client_root)
    agent_key_path = resolve_key_path(agent_key_value, server_cwd, client_root)
    if not agent_key_path.is_file():
        die("The agent signing key referenced by the existing plan does not exist; no state changed.")
    agent_key = load_ed25519_private_key(agent_key_path)
    verify_agent_key(server_cwd, db_path, plan, agent_key)

    capability_id = "portaldot-native-substrate-" + hashlib.sha256(recipient.encode()).hexdigest()[:16]
    profile_suffix = hashlib.sha256(recipient.encode()).hexdigest()[:12]
    policy_path = ISSUER_ROOT / f"policy-native-substrate-{profile_suffix}.yaml"
    LIVE_E2E_DIR = ISSUER_ROOT / "live-e2e"
    response_dir = LIVE_E2E_DIR
    response_dir.mkdir(parents=True, exist_ok=True, mode=0o750)

    # A minimal, explicit test profile. The running EVM profile is never edited.
    desired_policy = {
        "blocked_payees": [],
        "allowed_action_types": [ACTION_TYPE],
        "allowed_networks": [NETWORK],
        "allowed_assets": [ASSET],
        "allowed_targets": [recipient],
        # The action amount is deliberately expressed in native base units to
        # match the signed exact amount and capability ceiling in this test path.
        "per_tx_cap": {ASSET: amount},
        "rate_limit_per_minute": 10,
    }
    import yaml
    if policy_path.exists():
        existing_policy = yaml.safe_load(policy_path.read_text(encoding="utf-8")) or {}
        if existing_policy != desired_policy:
            die(f"{policy_path} exists with unexpected contents; refusing to overwrite it.")
    else:
        policy_path.write_text(yaml.safe_dump(desired_policy, sort_keys=False), encoding="utf-8")
        policy_path.chmod(0o640)

    native_pids = listener_pids(NATIVE_PORT)
    if len(native_pids) > 1:
        die(f"More than one process is listening on port {NATIVE_PORT}.")
    if native_pids:
        native_pid = next(iter(native_pids))
        native_env = read_proc_env(native_pid)
        native_cwd = process_cwd(native_pid)
        if (resolve_runtime_path(native_env.get("VERIGATE_POLICY", ""), native_cwd) != policy_path.resolve()
                or resolve_runtime_path(native_env.get("VERIGATE_DB", ""), native_cwd) != db_path.resolve()):
            die(f"Port {NATIVE_PORT} is occupied by a different service; no changes made.")
        native_url = NATIVE_BASE_URL
    else:
        command = list(server_cmd)
        replaced_port = False
        has_host = False
        index = 0
        while index < len(command):
            if command[index] == "--port" and index + 1 < len(command):
                if command[index + 1] != str(OLD_PORT):
                    die("Unexpected Uvicorn port argument; refusing to clone the process.")
                command[index + 1] = str(NATIVE_PORT)
                replaced_port = True
                index += 2
                continue
            if command[index].startswith("--port="):
                if command[index].split("=", 1)[1] != str(OLD_PORT):
                    die("Unexpected Uvicorn port argument; refusing to clone the process.")
                command[index] = f"--port={NATIVE_PORT}"
                replaced_port = True
            if command[index] == "--host" and index + 1 < len(command):
                has_host = True
                if command[index + 1] in ("0.0.0.0", "::"):
                    command[index + 1] = "127.0.0.1"
            elif command[index].startswith("--host="):
                has_host = True
                if command[index].split("=", 1)[1] in ("0.0.0.0", "::"):
                    command[index] = "--host=127.0.0.1"
            index += 1
        if not replaced_port:
            die("Could not safely replace the existing Uvicorn --port 8001 argument.")
        if not has_host:
            command.extend(["--host", "127.0.0.1"])
        LIVE_E2E_DIR.mkdir(parents=True, exist_ok=True)
        log_path = LIVE_E2E_DIR / "verigate-native-substrate-8003.log"
        with log_path.open("ab", buffering=0) as log:
            proc = subprocess.Popen(
                command,
                cwd=str(server_cwd),
                env={**server_env, "VERIGATE_POLICY": str(policy_path)},
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        ready = False
        last_error = ""
        for _ in range(40):
            if proc.poll() is not None:
                last_error = f"Native verifier exited with status {proc.returncode}"
                break
            try:
                status, health = http_json(f"{NATIVE_BASE_URL}/health", timeout=1.5)
                if status == 200 and isinstance(health, dict) and health.get("status") == "ok":
                    ready = True
                    break
            except Exception as exc:
                last_error = str(exc)
            time.sleep(0.25)
        if not ready:
            die("Native verifier on 127.0.0.1:8003 did not become healthy; port 8001 remains untouched. " + last_error)
        native_url = NATIVE_BASE_URL

    # Validate profile syntax before touching capability state.
    sys.path.insert(0, str(server_cwd))
    from core.policy import Policy
    Policy.load(str(policy_path))

    cap_status = ensure_capability(server_cwd, db_path, plan, capability_id, recipient, amount)

    # Verify the loopback verifier exposes the same pinned issuer key.
    from cryptography.hazmat.primitives import serialization
    status, remote_pem = http_json(f"{native_url}/v1/public-key")
    if status != 200 or not isinstance(remote_pem, str):
        die("Native verifier did not return an issuer public key.")
    pinned_path = resolve_key_path(client_env["VERIGATE_PUBLIC_KEY_FILE"], server_cwd, client_root)
    pinned_key = serialization.load_pem_public_key(pinned_path.read_bytes())
    remote_key = serialization.load_pem_public_key(remote_pem.encode("utf-8"))
    if public_key_der(remote_key) != public_key_der(pinned_key):
        die("Native verifier is not serving the pinned Verigate issuer key.")

    from core.identity import sign_action_intent
    from core.models import ActionIntent

    intent_id = f"portaldot-native-substrate-{uuid.uuid4().hex}"
    timestamp = time.time()
    metadata = {
        "portaldot_substrate_v3": {
            "genesis_hash": GENESIS_HASH,
            "recipient_ss58": recipient,
            "amount_base_units": amount_text,
            "max_fee_base_units": fee_text,
        }
    }
    action = ActionIntent(
        agent_id=EXPECTED_AGENT,
        action_type=ACTION_TYPE,
        target=recipient,
        resource="live-e2e/portal-dot-native-substrate-system-dry-run",
        amount=Decimal(amount_text),
        amount_exact=amount_text,
        asset=ASSET,
        network=NETWORK,
        purpose="PortalDot native Substrate authorized dry-run",
        requested_capability=capability_id,
        metadata=metadata,
        intent_id=intent_id,
        timestamp=timestamp,
    )
    agent_signature = sign_action_intent(action, EXPECTED_IDENTITY, agent_key)
    request_body = {
        "identity_id": EXPECTED_IDENTITY,
        "capability_id": capability_id,
        "agent_id": action.agent_id,
        "agent_signature": agent_signature,
        "intent_id": intent_id,
        "timestamp": timestamp,
        "action_type": action.action_type,
        "target": action.target,
        "resource": action.resource,
        "amount_exact": amount_text,
        "asset": ASSET,
        "network": NETWORK,
        "purpose": action.purpose,
        "declared_context": {},
        "parent_intent_id": None,
        "requested_capability": capability_id,
        "constraints": {},
        "metadata": metadata,
    }
    status, response = http_json(
        f"{native_url}/v1/actions/authorize",
        payload=request_body,
        api_key=client_env["VERIGATE_API_KEY"],
        timeout=20,
    )
    if status != 200 or not isinstance(response, dict):
        die("Verigate did not return a JSON authorization response.")

    response_path = response_dir / f"authorization-response-substrate-native-{intent_id}.json"
    response_path.write_text(json.dumps(response, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    response_path.chmod(0o600)

    receipt_payload = (response.get("decision_receipt") or {}).get("payload") or {}
    decision_payload = receipt_payload.get("decision") or {}
    decision = decision_payload.get("decision")
    execution = response.get("execution_authorization")
    matched_rules = decision_payload.get("matched_rules") or []
    safe_rules = []
    for item in matched_rules:
        if isinstance(item, dict):
            safe_rules.append({"rule": item.get("rule"), "severity": item.get("severity"), "message": item.get("message")})

    result = {
        "profile": str(policy_path),
        "existingVerifierPreserved": "http://127.0.0.1:8001",
        "nativeVerifier": native_url,
        "capabilityStatus": cap_status,
        "capabilityId": capability_id,
        "identityId": EXPECTED_IDENTITY,
        "agentId": EXPECTED_AGENT,
        "intentId": intent_id,
        "decision": decision,
        "executionAuthorizationIssued": isinstance(execution, dict),
        "recipientSs58": recipient,
        "amountBaseUnits": amount_text,
        "amountPOT": str(Decimal(amount_text) / Decimal(10**14)),
        "maxFeeBaseUnits": fee_text,
        "maxFeePOT": str(Decimal(fee_text) / Decimal(10**14)),
        "authorizationResponseFile": str(response_path),
        "substrateExtrinsicSigned": False,
        "transactionBroadcast": False,
    }
    print("=== NATIVE SUBSTRATE AUTHORIZATION PREPARATION ===")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if safe_rules:
        print("MATCHED_RULES=" + json.dumps(safe_rules, ensure_ascii=False))
    print("NO SUBSTRATE SIGNATURE OR TRANSACTION WAS CREATED.")
    if decision != "ALLOW" or not isinstance(execution, dict):
        print("VERIGATE_DID_NOT_ALLOW: do not run the Substrate simulator with this response.")
        return 3
    print("RESULT: fresh native ALLOW saved. This is authorization evidence only, not proof that system_dryRun passed.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as exc:
        print(f"Native Substrate authorization preparation failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        print("No Substrate extrinsic was signed or broadcast.", file=sys.stderr)
        raise SystemExit(1)
