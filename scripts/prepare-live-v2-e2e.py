#!/usr/bin/env python3
"""Prepare and simulate a fresh Verigate-authorized transfer through PortalDot V2.

Linux operator helper for the configured Gensyn2 test environment. It:
- keeps the current Verigate service on 127.0.0.1:8001 untouched;
- creates a separate, recipient-scoped policy/capability for V2;
- starts a second loopback-only Verigate process on 127.0.0.1:8002 using the
  same issuer key and SQLite database;
- asks Verigate for a fresh signed ALLOW, signs it via the PortalDot bridge,
  and runs the executor without --broadcast.

It never sends an EVM transaction. Private keys and signatures are not printed.
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
DB_EXPECTED = ISSUER_ROOT / "data/verigate.db"
POLICY_SOURCE_EXPECTED = ISSUER_ROOT / "policy.yaml"
POLICY_V2_PATH = ISSUER_ROOT / "policy-v2-recipient-a0fc.yaml"
LIVE_E2E_DIR = ISSUER_ROOT / "live-e2e"
OLD_PORT = 8001
NEW_PORT = 8002
BASE_URL = f"http://127.0.0.1:{NEW_PORT}"
RECIPIENT = "0xa0fC1a7248955A159d54D84E48681d9cEbB86Be4"
CHAIN_ID = 420420777
AMOUNT_BASE_UNITS = "100000000000000000"  # 0.1 EVM POT, 18 decimals
CAPABILITY_ID = "portaldot-live-proof-cap-v2-a0fc1a7248955a15"
EXPECTED_AGENT = "portaldot-live-proof-agent-1ae14879503d"
EXPECTED_IDENTITY = "16eadfd3caaea2588729f535b532d2c99a8ec7ffc93fb95cdbdee5b23fd4db88"
EXPECTED_TARGET_BEFORE = "0x4c07B4f328FA738290Db96BCE2F9CBc4d020D2CB"


def die(message: str) -> None:
    raise RuntimeError(message)


def read_proc_env(pid: int) -> dict[str, str]:
    raw = Path(f"/proc/{pid}/environ").read_bytes().split(b"\0")
    result: dict[str, str] = {}
    for item in raw:
        if b"=" not in item:
            continue
        key, value = item.split(b"=", 1)
        result[os.fsdecode(key)] = os.fsdecode(value)
    return result


def read_proc_cmd(pid: int) -> list[str]:
    return [os.fsdecode(x) for x in Path(f"/proc/{pid}/cmdline").read_bytes().split(b"\0") if x]


def listener_pids(port: int) -> set[int]:
    proc = subprocess.run(
        ["ss", "-ltnp", f"sport = :{port}"],
        check=False, capture_output=True, text=True
    )
    if proc.returncode not in (0, 1):
        die(f"Could not inspect TCP port {port} with ss.")
    return {int(x) for x in re.findall(r"pid=(\d+)", proc.stdout)}


def dotenv_values(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        die(f"Required .env file not found: {path}")
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("export "):
            stripped = stripped[7:].lstrip()
        if "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        values[key] = value
    return values


def update_base_url(path: Path, url: str) -> None:
    lines = path.read_text(encoding="utf-8").splitlines()
    result: list[str] = []
    inserted = False
    for line in lines:
        stripped = line.lstrip()
        key = stripped.partition("=")[0].strip() if stripped and not stripped.startswith("#") else ""
        if key == "VERIGATE_BASE_URL":
            if not inserted:
                result.append(f"VERIGATE_BASE_URL={url}")
                inserted = True
        else:
            result.append(line)
    if not inserted:
        result.append(f"VERIGATE_BASE_URL={url}")
    backup = path.with_name(f".env.before-v2-e2e-{time.strftime('%Y%m%d-%H%M%S')}.bak")
    shutil.copy2(path, backup)
    backup.chmod(0o600)
    path.write_text("\n".join(result) + "\n", encoding="utf-8")
    path.chmod(0o600)


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
        raw = exc.read()
        detail = raw.decode("utf-8", errors="replace")[:1200]
        die(f"HTTP {exc.code} from {url}: {detail}")
    except Exception as exc:
        die(f"Request to {url} failed: {type(exc).__name__}: {exc}")


def resolve_key_path(value: str, cwd: Path) -> Path:
    p = Path(value).expanduser()
    if p.is_absolute():
        return p
    candidates = [cwd / p, ISSUER_ROOT / p, Path.cwd() / p]
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    return candidates[0].resolve()


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
        die("The plan's agent key could not be loaded as an Ed25519 private key.")
    return key


def public_key_der(key) -> bytes:
    from cryptography.hazmat.primitives import serialization
    return key.public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )


def check_public_key_binding(server_env: dict[str, str], cwd: Path, client_env: dict[str, str]) -> None:
    from cryptography.hazmat.primitives import serialization
    expected_path = client_env.get("VERIGATE_PUBLIC_KEY_FILE", "").strip()
    expected_fp = client_env.get("VERIGATE_PUBLIC_KEY_SHA256", "").strip().lower()
    if not expected_path or not re.fullmatch(r"[a-f0-9]{64}", expected_fp):
        die("The PortalDot .env must pin VERIGATE_PUBLIC_KEY_FILE and VERIGATE_PUBLIC_KEY_SHA256.")
    pinned_path = resolve_key_path(expected_path, Path.cwd())
    if not pinned_path.is_file():
        die("VERIGATE_PUBLIC_KEY_FILE does not exist.")
    pinned_key = serialization.load_pem_public_key(pinned_path.read_bytes())
    pinned_der = public_key_der(pinned_key)
    if hashlib.sha256(pinned_der).hexdigest() != expected_fp:
        die("The configured Verigate public-key fingerprint does not match its public-key file.")

    server_key_path_text = server_env.get("VERIGATE_PUBLIC_KEY", "").strip()
    if not server_key_path_text:
        die("The running Verigate process has no VERIGATE_PUBLIC_KEY path.")
    server_key_path = resolve_key_path(server_key_path_text, cwd)
    if not server_key_path.is_file():
        die("The public-key file configured by Verigate does not exist.")
    server_key = serialization.load_pem_public_key(server_key_path.read_bytes())
    if public_key_der(server_key) != pinned_der:
        die("Verigate issuer key does not match the bridge's pinned public key.")

    status, remote_pem = http_json(f"{BASE_URL}/v1/public-key")
    if status != 200 or not isinstance(remote_pem, str):
        die("The V2 verifier endpoint did not return its public key.")
    remote_key = serialization.load_pem_public_key(remote_pem.encode("utf-8"))
    if public_key_der(remote_key) != pinned_der:
        die("The V2 verifier endpoint is not serving the pinned Verigate issuer key.")


def validate_or_create_capability(cwd: Path, db_path: Path, plan: dict) -> str:
    if os.environ.get("VERIGATE_TENANT_KEY_DIR"):
        die("Tenant-key mode is enabled; this helper refuses to write to the global database.")
    sys.path.insert(0, str(cwd))
    from core.capabilities import CapabilityRegistry
    from core.models import Capability
    from core.storage import Storage

    agent_id = plan["agent_id"]
    identity_id = plan["identity_id"]
    if agent_id != EXPECTED_AGENT or identity_id != EXPECTED_IDENTITY:
        die("Live plan agent/identity identifiers differ from the expected test fixture.")
    if not db_path.is_file():
        die("Configured Verigate SQLite database is missing.")

    storage = Storage(str(db_path))
    try:
        identity = storage.identity(identity_id)
        if identity is None or identity.agent_id != agent_id:
            die("The configured agent identity is missing from the active issuer database.")
        if not storage.identity_is_active(identity_id):
            die("The configured agent identity is not active.")

        existing = storage.capability(CAPABILITY_ID)
        if existing is not None:
            status = storage.capability_status(CAPABILITY_ID)
            valid = (
                status == "ACTIVE"
                and existing.agent_id == agent_id
                and existing.identity_id == identity_id
                and tuple(existing.allowed_actions) == ("portaldot.native_transfer",)
                and tuple(existing.allowed_targets) == (RECIPIENT,)
                and tuple(existing.allowed_networks) == ("portaldot-v3",)
                and tuple(existing.allowed_assets) == ("tPOTv3",)
                and Decimal(str(existing.max_per_action.get("tPOTv3", "0")))
                    == Decimal("1000000000000000000")
            )
            if not valid:
                die("The V2 recipient capability ID already exists with different or inactive authority; refusing to overwrite it.")
            return "reused-existing-active-capability"

        cap = Capability(
            capability_id=CAPABILITY_ID,
            agent_id=agent_id,
            identity_id=identity_id,
            allowed_actions=("portaldot.native_transfer",),
            allowed_targets=(RECIPIENT,),
            allowed_networks=("portaldot-v3",),
            allowed_assets=("tPOTv3",),
            max_per_action={"tPOTv3": 1000000000000000000},
            metadata={
                "purpose": "PortalDot V2 live test: one allowlisted recipient, native transfer only",
                "recipient": RECIPIENT,
                "chain_id": CHAIN_ID,
            },
        )
        CapabilityRegistry(storage).register(cap)
        return "created-recipient-scoped-capability"
    finally:
        storage.close()


def main() -> int:
    client_root = Path(__file__).resolve().parent.parent
    client_env_path = client_root / ".env"
    client_env = dotenv_values(client_env_path)
    caller_env = os.environ.copy()

    for key in ("VERIGATE_API_KEY", "VERIGATE_PUBLIC_KEY_FILE", "VERIGATE_PUBLIC_KEY_SHA256"):
        if not client_env.get(key):
            die(f"The project .env must have {key} configured.")
    api_key = client_env["VERIGATE_API_KEY"]

    if not PLAN_PATH.is_file():
        die(f"Live plan not found: {PLAN_PATH}")
    plan = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
    if str(plan.get("target", "")).lower() != EXPECTED_TARGET_BEFORE.lower():
        die("The existing live plan target differs from the expected old deployer target; no change made.")
    private_key_value = plan.get("private_key_path")
    if not isinstance(private_key_value, str) or not private_key_value.strip():
        die("Live plan has no agent private-key path.")
    
    old_pids = listener_pids(OLD_PORT)
    if len(old_pids) != 1:
        die(f"Expected exactly one process listening on port {OLD_PORT}; found {len(old_pids)}.")
    old_pid = next(iter(old_pids))
    server_env = read_proc_env(old_pid)
    server_cmd = read_proc_cmd(old_pid)
    server_cwd = Path(os.readlink(f"/proc/{old_pid}/cwd")).resolve()

    policy_env = server_env.get("VERIGATE_POLICY", "").strip()
    db_env = server_env.get("VERIGATE_DB", "").strip()
    if not policy_env or Path(policy_env).resolve() != POLICY_SOURCE_EXPECTED.resolve():
        die("The active Verigate process does not use the expected issuer policy path.")
    if not db_env or Path(db_env).resolve() != DB_EXPECTED.resolve():
        die("The active Verigate process does not use the expected issuer SQLite database.")
    if server_env.get("VERIGATE_TENANT_KEY_DIR"):
        die("Tenant-key mode is enabled; refusing shared-database provisioning.")
    if server_env.get("VERIGATE_REQUIRE_GOVERNED_POLICY", "").strip().lower() in {"1", "true", "yes"}:
        die("Governed-policy mode is enabled; this helper will not bypass governance by writing a separate policy file.")
    if not (server_cwd / "api/main.py").is_file():
        die("Could not locate api/main.py beneath the running Verigate process working directory.")
    if not any("uvicorn" in item for item in server_cmd) or "api.main:app" not in server_cmd:
        die("The running service command is not the expected Uvicorn api.main:app process; no changes made.")
    if "--reload" in server_cmd:
        die("The running API uses Uvicorn reload mode; refusing to clone its process.")
    new_cmd = list(server_cmd)
    port_replaced = False
    for i, item in enumerate(new_cmd):
        if item == "--port" and i + 1 < len(new_cmd) and new_cmd[i + 1] == str(OLD_PORT):
            new_cmd[i + 1] = str(NEW_PORT)
            port_replaced = True
        elif item == f"--port={OLD_PORT}":
            new_cmd[i] = f"--port={NEW_PORT}"
            port_replaced = True
        if item == "--host" and i + 1 < len(new_cmd) and new_cmd[i + 1] in ("0.0.0.0", "::"):
            new_cmd[i + 1] = "127.0.0.1"
        elif item.startswith("--host=") and item.split("=", 1)[1] in ("0.0.0.0", "::"):
            new_cmd[i] = "--host=127.0.0.1"
    if not port_replaced:
        die("Could not safely derive a second Uvicorn command with port 8002; no changes made.")

    existing_new_pids = listener_pids(NEW_PORT)
    if len(existing_new_pids) > 1:
        die("More than one process appears to listen on port 8002.")
    if existing_new_pids:
        existing_pid = next(iter(existing_new_pids))
        existing_env = read_proc_env(existing_pid)
        if (
            Path(existing_env.get("VERIGATE_POLICY", "/nonexistent")).resolve() != POLICY_V2_PATH.resolve()
            or Path(existing_env.get("VERIGATE_DB", "/nonexistent")).resolve() != DB_EXPECTED.resolve()
        ):
            die("Port 8002 is occupied by a process that is not the expected V2 verifier; no changes made.")

    plan_key_path = resolve_key_path(private_key_value, server_cwd)
    if not plan_key_path.is_file():
        die("The agent private-key file referenced by the plan does not exist.")
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    agent_key = load_ed25519_private_key(plan_key_path)

    # Build the V2-only policy as a sibling file; the active policy at 8001 is not edited.
    import yaml
    source_policy = yaml.safe_load(POLICY_SOURCE_EXPECTED.read_text(encoding="utf-8")) or {}
    targets = source_policy.get("allowed_targets")
    if not isinstance(targets, list):
        die("The active policy does not have an explicit allowed_targets list.")
    if not any(str(x).lower() == EXPECTED_TARGET_BEFORE.lower() for x in targets):
        die("The existing policy no longer contains the expected original target; no change made.")
    desired_policy = copy.deepcopy(source_policy)
    desired_targets = list(desired_policy["allowed_targets"])
    if not any(str(x).lower() == RECIPIENT.lower() for x in desired_targets):
        desired_targets.append(RECIPIENT)
    desired_policy["allowed_targets"] = desired_targets
    cap_limit = desired_policy.get("per_tx_cap", {}).get("TPOTV3")
    if cap_limit is None or Decimal(str(cap_limit)) < Decimal(AMOUNT_BASE_UNITS):
        die("The active policy's TPOTV3 per-transaction cap does not permit 0.1 POT.")
    if POLICY_V2_PATH.exists():
        existing_policy = yaml.safe_load(POLICY_V2_PATH.read_text(encoding="utf-8")) or {}
        if existing_policy != desired_policy:
            die(f"{POLICY_V2_PATH} exists with unexpected contents; refusing to overwrite it.")
    else:
        POLICY_V2_PATH.write_text(
            yaml.safe_dump(desired_policy, sort_keys=False, allow_unicode=True),
            encoding="utf-8",
        )
        POLICY_V2_PATH.chmod(0o640)

    # Use the same Verigate source tree and database as the running service.
    sys.path.insert(0, str(server_cwd))
    from core.policy import Policy
    Policy.load(str(POLICY_V2_PATH))
    cap_status = validate_or_create_capability(server_cwd, Path(db_env), plan)

    # Verify that the operator's pinned issuer key matches the active Verigate key.
    check_public_key_binding(server_env, server_cwd, client_env)

    if not existing_new_pids:
        log_path = LIVE_E2E_DIR / "verigate-v2-8002.log"
        LIVE_E2E_DIR.mkdir(parents=True, exist_ok=True)
        with log_path.open("ab", buffering=0) as log:
            proc = subprocess.Popen(
                new_cmd,
                cwd=str(server_cwd),
                env={**server_env, "VERIGATE_POLICY": str(POLICY_V2_PATH)},
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        ready = False
        last_error = ""
        for _ in range(40):
            if proc.poll() is not None:
                last_error = f"V2 verifier process exited with status {proc.returncode}"
                break
            try:
                status, health = http_json(f"{BASE_URL}/health", timeout=1.5)
                if status == 200 and isinstance(health, dict) and health.get("status") == "ok":
                    ready = True
                    break
            except Exception as exc:
                last_error = str(exc)
            time.sleep(0.25)
        if not ready:
            die("V2 verifier did not become healthy. Existing service on 8001 remains untouched. " + last_error)
        new_pid = proc.pid
    else:
        new_pid = next(iter(existing_new_pids))
        status, health = http_json(f"{BASE_URL}/health")
        if status != 200 or not isinstance(health, dict) or health.get("status") != "ok":
            die("An existing process on port 8002 did not pass the health check.")

    check_public_key_binding(server_env, server_cwd, client_env)

    # Ensure the loaded identity's private key is the key registered in the issuer DB.
    sys.path.insert(0, str(server_cwd))
    from core.storage import Storage
    storage = Storage(db_env)
    try:
        identity = storage.identity(plan["identity_id"])
        if identity is None:
            die("Agent identity disappeared from the issuer DB.")
        raw_public = base64.b64decode(identity.public_key_b64, validate=True)
        derived_public = agent_key.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        if raw_public != derived_public:
            die("The plan's agent private key does not match the registered identity public key.")
    finally:
        storage.close()

    # Create a fresh, agent-signed ActionIntent for the V2 allowlisted recipient.
    from core.identity import sign_action_intent
    from core.models import ActionIntent

    intent_id = f"portaldot-live-v2-{uuid.uuid4().hex}"
    timestamp = time.time()
    metadata = {
        "portaldot_v3": {
            "chain_id": CHAIN_ID,
            "recipient": RECIPIENT,
            "amount_base_units": AMOUNT_BASE_UNITS,
        }
    }
    action = ActionIntent(
        agent_id=plan["agent_id"],
        action_type="portaldot.native_transfer",
        target=RECIPIENT,
        resource="live-e2e/portal-dot-v2-allowlisted-recipient",
        amount=Decimal(AMOUNT_BASE_UNITS),
        amount_exact=AMOUNT_BASE_UNITS,
        asset="tPOTv3",
        network="portaldot-v3",
        purpose="V2 allowlisted recipient demo transfer",
        declared_context={},
        parent_intent_id=None,
        requested_capability=CAPABILITY_ID,
        constraints={},
        metadata=metadata,
        intent_id=intent_id,
        timestamp=timestamp,
    )
    agent_signature = sign_action_intent(action, plan["identity_id"], agent_key)
    request_body = {
        "identity_id": plan["identity_id"],
        "capability_id": CAPABILITY_ID,
        "agent_id": action.agent_id,
        "agent_signature": agent_signature,
        "intent_id": intent_id,
        "timestamp": timestamp,
        "action_type": action.action_type,
        "target": action.target,
        "resource": action.resource,
        "amount_exact": AMOUNT_BASE_UNITS,
        "asset": action.asset,
        "network": action.network,
        "purpose": action.purpose,
        "declared_context": {},
        "parent_intent_id": None,
        "requested_capability": CAPABILITY_ID,
        "constraints": {},
        "metadata": metadata,
    }

    status, response = http_json(
        f"{BASE_URL}/v1/actions/authorize",
        payload=request_body,
        api_key=api_key,
        timeout=20,
    )
    if status != 200 or not isinstance(response, dict):
        die("Verigate did not return a JSON authorization response.")
    response_path = LIVE_E2E_DIR / f"authorization-response-{intent_id}.json"
    response_path.write_text(json.dumps(response, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    response_path.chmod(0o600)
    decision = (((response.get("decision_receipt") or {}).get("payload") or {}).get("decision") or {}).get("decision")
    matched_rules = (((response.get("decision_receipt") or {}).get("payload") or {}).get("decision") or {}).get("matched_rules") or []
    execution = response.get("execution_authorization")

    print("=== V2 LIVE E2E PREPARATION ===")
    print(json.dumps({
        "policyProfile": str(POLICY_V2_PATH),
        "activeServicePreserved": f"http://127.0.0.1:{OLD_PORT}",
        "v2Verifier": BASE_URL,
        "v2VerifierPid": new_pid,
        "capabilityStatus": cap_status,
        "capabilityId": CAPABILITY_ID,
        "intentId": intent_id,
        "decision": decision,
        "executionAuthorizationIssued": bool(execution),
        "recipient": RECIPIENT,
        "amountBaseUnits": AMOUNT_BASE_UNITS,
        "amountEvmPOT": "0.1",
        "authorizationResponseFile": str(response_path),
        "transactionBroadcast": False,
    }, indent=2))
    if decision != "ALLOW" or not isinstance(execution, dict):
        safe_rules = []
        for item in matched_rules:
            if isinstance(item, dict):
                safe_rules.append({
                    "rule": item.get("rule"),
                    "severity": item.get("severity"),
                    "message": item.get("message"),
                })
        print("VERIGATE_DID_NOT_ALLOW:", json.dumps(safe_rules, ensure_ascii=False))
        return 3

    # Point the bridge verifier at the V2-profile instance only after ALLOW exists.
    if client_env.get("VERIGATE_BASE_URL") != BASE_URL:
        update_base_url(client_env_path, BASE_URL)
    client_env = dotenv_values(client_env_path)
    node_env = caller_env.copy()
    node_env.update(client_env)
    node_env["VERIGATE_BASE_URL"] = BASE_URL
    node_env["PORTALDOT_GUARD_PROFILE"] = "v2"
    node_env["PORTALDOT_RPC_URL"] = "https://test-evm-rpc-v3.portaldot.dev"
    node_env["PORTALDOT_CHAIN_ID"] = str(CHAIN_ID)
    node_env["PORTALDOT_SUBSTRATE_RPC_URL"] = "wss://test-node-v3.portaldot.dev"
    node_env["PORTALDOT_SUBSTRATE_GENESIS_HASH"] = "0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd"
    node_env["PORTALDOT_V2_GUARD_ADDRESS"] = "0x87C494a5e4B0A8E055F283767579667E10E046C6"
    node_env["PORTALDOT_V2_GUARD_CODE_HASH"] = "0x010a565cad83a33442d0f23f6fcb6f605a76082a5b58434813bedf84c54f0859"

    node = shutil.which("node", path=node_env.get("PATH"))
    if not node:
        die("Node.js was not found in PATH; the ALLOW response is safely saved, no transaction broadcast.")
    bridge = subprocess.run(
        [node, "adapter/verigate-bridge.js", str(response_path)],
        cwd=str(client_root), env=node_env, capture_output=True, text=True, timeout=120
    )
    if bridge.returncode != 0:
        print("BRIDGE_SIGN_FAILED; response safely saved; no transaction broadcast.")
        print((bridge.stderr or bridge.stdout or "No diagnostic returned")[-2200:])
        return 4
    try:
        signed = json.loads(bridge.stdout)
    except json.JSONDecodeError:
        print("BRIDGE_OUTPUT_NOT_JSON; response safely saved; no transaction broadcast.")
        print(bridge.stdout[-1200:])
        return 4

    signed_path = LIVE_E2E_DIR / f"signed-authorization-{intent_id}.json"
    signed_path.write_text(json.dumps(signed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    signed_path.chmod(0o600)

    executor = subprocess.run(
        [node, "scripts/execute-authorized-transfer.mjs", str(signed_path)],
        cwd=str(client_root), env=node_env, capture_output=True, text=True, timeout=120
    )
    simulation_path = LIVE_E2E_DIR / f"simulation-{intent_id}.json"
    try:
        simulation = json.loads(executor.stdout)
        simulation_path.write_text(json.dumps(simulation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        simulation_path.chmod(0o600)
    except json.JSONDecodeError:
        print("EXECUTOR_SIMULATION_FAILED; no transaction broadcast.")
        print((executor.stderr or executor.stdout or "No diagnostic returned")[-2200:])
        print("Saved Verigate response:", response_path)
        print("Saved EIP-712 authorization:", signed_path)
        return 5

    print("=== READ-ONLY EVM SIMULATION ===")
    keys = (
        "status", "guardAddress", "runtimeCodeHash", "authoritySigner",
        "recoveredSigner", "recipient", "amountBaseUnits", "guardBalancePot",
        "estimatedGasUnits", "gasPriceWei", "estimatedRelayerFeeWei",
        "feeWithSafetyMarginWei", "relayerBalancePot", "feeBudgetStatus",
        "broadcastRequested", "transactionBroadcast",
    )
    summary = {key: simulation.get(key) for key in keys if key in simulation}
    summary["simulationEvidenceFile"] = str(simulation_path)
    summary["signedAuthorizationFile"] = str(signed_path)
    summary["verigateResponseFile"] = str(response_path)
    print(json.dumps(summary, indent=2))
    if executor.returncode != 0 or simulation.get("status") != "simulation_passed":
        print("SIMULATION_DID_NOT_PASS; no transaction broadcast.")
        if executor.stderr:
            print(executor.stderr[-1500:])
        return 5
    print("RESULT: Verigate ALLOW -> V2 bridge signature -> read-only EVM simulation PASSED.")
    print("TRANSACTION_BROADCAST: false")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as exc:
        print(f"V2 live E2E preparation failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        print("No EVM transaction was broadcast.", file=sys.stderr)
        raise SystemExit(1)
