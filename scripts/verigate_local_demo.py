#!/usr/bin/env python3
"""Run an isolated real-Verigate API ALLOW/BLOCK test for the PortalDot adapter.

The helper imports the Verigate checkout selected with --verigate-root, creates
a disposable SQLite DB and issuer keys under the OS temp directory, starts a
loopback-only Uvicorn instance, and sends agent-signed requests through the
actual HTTP API. It never opens or edits the user's regular Verigate database
or .env file.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from decimal import Decimal
from pathlib import Path
from typing import Any

ALLOW_RECIPIENT = "0x1111111111111111111111111111111111111111"
BLOCK_RECIPIENT = "0x2222222222222222222222222222222222222222"
CHAIN_ID = 420420777
AMOUNT_BASE_UNITS = "1000000"


def http_json(url: str, payload: dict[str, Any] | None = None, timeout: float = 3.0) -> tuple[int, Any]:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"content-type": "application/json"} if data is not None else {},
        method="GET" if data is None else "POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            value = json.loads(raw)
        except json.JSONDecodeError:
            value = {"detail": raw}
        return exc.code, value


def wait_for_api(base_url: str, process: subprocess.Popen, log_path: Path, seconds: float = 15.0) -> None:
    deadline = time.monotonic() + seconds
    last_error = "not attempted"
    while time.monotonic() < deadline:
        if process.poll() is not None:
            break
        try:
            status, body = http_json(base_url + "/health", timeout=1.0)
            if status == 200 and isinstance(body, dict) and body.get("status") == "ok":
                return
            last_error = f"health returned HTTP {status}: {body}"
        except Exception as exc:  # expected while Uvicorn is starting
            last_error = str(exc)
        time.sleep(0.25)
    log_text = log_path.read_text(encoding="utf-8", errors="replace") if log_path.exists() else ""
    raise RuntimeError(
        "Isolated Verigate API failed to start. Last probe: "
        + last_error
        + "\nUvicorn log:\n"
        + log_text[-5000:]
    )


def verify_attestation(base_url: str, artifact: dict[str, Any]) -> tuple[bool, str]:
    status, result = http_json(base_url + "/v1/verify", artifact)
    if status != 200 or not isinstance(result, dict):
        return False, f"verification endpoint returned HTTP {status}: {result}"
    return result.get("valid") is True, str(result.get("reason", "no reason returned"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verigate-root", required=True, help="Path to the local Verigate source checkout")
    parser.add_argument("--port", type=int, default=8001, help="Temporary loopback API port (default 8001)")
    parser.add_argument("--output-dir", help="Directory for response JSON files; default is a new OS temp directory")
    args = parser.parse_args()

    source_root = Path(args.verigate_root).expanduser().resolve()
    if not (source_root / "api" / "main.py").is_file() or not (source_root / "core" / "storage.py").is_file():
        raise SystemExit(f"Not a Verigate source checkout: {source_root}")
    if not (1 <= args.port <= 65535):
        raise SystemExit("Port must be between 1 and 65535.")

    with socket.socket() as probe:
        try:
            probe.bind(("127.0.0.1", args.port))
        except OSError as exc:
            raise SystemExit(
                f"Port {args.port} is already in use. Stop that process or rerun with --port 8011."
            ) from exc

    runtime_root = Path(tempfile.mkdtemp(prefix="verigate-portaldot-runtime-"))
    output_root = (
        Path(args.output_dir).expanduser().resolve()
        if args.output_dir
        else Path(tempfile.mkdtemp(prefix="verigate-portaldot-artifacts-"))
    )
    output_root.mkdir(parents=True, exist_ok=True)
    keys_dir = runtime_root / "keys"
    data_dir = runtime_root / "data"
    config_dir = runtime_root / "config"
    keys_dir.mkdir()
    data_dir.mkdir()
    config_dir.mkdir()

    # A narrow disposable policy: only ALLOW_RECIPIENT is globally permitted.
    policy_path = runtime_root / "policy.yaml"
    policy_path.write_text(
        "allowed_action_types:\n"
        "  - portaldot.native_transfer\n"
        "allowed_targets:\n"
        f'  - "{ALLOW_RECIPIENT}"\n'
        "allowed_networks:\n"
        "  - portaldot-v3\n"
        "allowed_assets:\n"
        "  - tPOTv3\n"
        "per_tx_cap:\n"
        "  TPOTV3: 2000000000\n"
        "rate_limit_per_minute: 30\n",
        encoding="utf-8",
    )

    env = os.environ.copy()
    for name in list(env):
        if name.startswith("VERIGATE_"):
            env.pop(name, None)
    env.update(
        {
            "VERIGATE_POLICY": str(policy_path),
            "VERIGATE_DB": str(data_dir / "verigate.db"),
            "VERIGATE_PRIVATE_KEY": str(keys_dir / "issuer.key"),
            "VERIGATE_PUBLIC_KEY": str(keys_dir / "issuer.pub"),
            "VERIGATE_GOVERNANCE_PRIVATE_KEY": str(keys_dir / "governance.key"),
            "VERIGATE_GOVERNANCE_PUBLIC_KEY": str(keys_dir / "governance.pub"),
            "VERIGATE_GOVERNANCE_POLICY": str(config_dir / "governance-policy.json"),
            "VERIGATE_REQUIRE_SIGNED_INTENT": "1",
        }
    )

    sys.path.insert(0, str(source_root))
    os.environ.update(env)

    try:
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        from core.identity import sign_action_intent
        from core.models import ActionIntent, AgentIdentity, Capability
        from core.storage import Storage

        # These are disposable, unencrypted test-only issuer keys. Write them
        # explicitly rather than using environment-sensitive key-management defaults.
        def write_test_keypair(private_path: str, public_path: str) -> None:
            key = Ed25519PrivateKey.generate()
            private_bytes = key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption(),
            )
            public_bytes = key.public_key().public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo,
            )
            Path(private_path).write_bytes(private_bytes)
            Path(public_path).write_bytes(public_bytes)

        write_test_keypair(env["VERIGATE_PRIVATE_KEY"], env["VERIGATE_PUBLIC_KEY"])
        write_test_keypair(
            env["VERIGATE_GOVERNANCE_PRIVATE_KEY"],
            env["VERIGATE_GOVERNANCE_PUBLIC_KEY"],
        )

        agent_private_key = Ed25519PrivateKey.generate()
        public_key_raw = agent_private_key.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        identity_id = hashlib.sha256(public_key_raw).hexdigest()
        agent_id = "portaldot-local-demo-agent"
        identity = AgentIdentity(
            agent_id=agent_id,
            public_key_b64=base64.b64encode(public_key_raw).decode("ascii"),
            key_id=identity_id,
            metadata={"purpose": "isolated PortalDot local integration test"},
        )
        capability = Capability(
            capability_id="portaldot-local-demo-capability",
            agent_id=agent_id,
            identity_id=identity_id,
            allowed_actions=("portaldot.native_transfer",),
            allowed_targets=(ALLOW_RECIPIENT, BLOCK_RECIPIENT),
            allowed_networks=("portaldot-v3",),
            allowed_assets=("tPOTv3",),
            max_per_action={"tPOTv3": 2000000000},
            metadata={"purpose": "disposable local test capability"},
        )
        storage = Storage(env["VERIGATE_DB"])
        storage.register_identity(identity)
        storage.register_capability(capability)
        storage.close()

        base_url = f"http://127.0.0.1:{args.port}"
        log_path = runtime_root / "uvicorn.log"
        with log_path.open("w", encoding="utf-8") as log_file:
            process = subprocess.Popen(
                [
                    sys.executable,
                    "-m",
                    "uvicorn",
                    "api.main:app",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    str(args.port),
                    "--log-level",
                    "warning",
                ],
                cwd=source_root,
                env=env,
                stdout=log_file,
                stderr=subprocess.STDOUT,
            )
            try:
                wait_for_api(base_url, process, log_path)

                def request_action(recipient: str, intent_id: str) -> dict[str, Any]:
                    now = time.time()
                    action = ActionIntent(
                        agent_id=agent_id,
                        action_type="portaldot.native_transfer",
                        target=recipient,
                        resource="portaldot-native-payment-demo",
                        amount=Decimal(AMOUNT_BASE_UNITS),
                        amount_exact=AMOUNT_BASE_UNITS,
                        asset="tPOTv3",
                        network="portaldot-v3",
                        purpose="portaldot-hacker-house-demo",
                        metadata={
                            "portaldot_v3": {
                                "chain_id": CHAIN_ID,
                                "recipient": recipient,
                                "amount_base_units": AMOUNT_BASE_UNITS,
                            }
                        },
                        intent_id=intent_id,
                        timestamp=now,
                    )
                    signature = sign_action_intent(action, identity_id, agent_private_key)
                    body = {
                        "identity_id": identity_id,
                        "capability_id": capability.capability_id,
                        "agent_id": agent_id,
                        "agent_signature": signature,
                        "intent_id": action.intent_id,
                        "timestamp": action.timestamp,
                        "action_type": action.action_type,
                        "target": action.target,
                        "resource": action.resource,
                        "amount": float(AMOUNT_BASE_UNITS),
                        "amount_exact": AMOUNT_BASE_UNITS,
                        "asset": action.asset,
                        "network": action.network,
                        "purpose": action.purpose,
                        "declared_context": action.declared_context,
                        "parent_intent_id": action.parent_intent_id,
                        "requested_capability": action.requested_capability,
                        "constraints": action.constraints,
                        "metadata": action.metadata,
                    }
                    status, response = http_json(base_url + "/v1/actions/authorize", body, timeout=8.0)
                    if status != 200:
                        raise RuntimeError(
                            f"POST /v1/actions/authorize returned HTTP {status}: "
                            + json.dumps(response, ensure_ascii=False)
                        )
                    return response

                allow_response = request_action(ALLOW_RECIPIENT, "portaldot-demo-allow-001")
                block_response = request_action(BLOCK_RECIPIENT, "portaldot-demo-block-001")

                allow_decision = allow_response["decision_receipt"]["payload"]["decision"]["decision"]
                block_decision = block_response["decision_receipt"]["payload"]["decision"]["decision"]
                if allow_decision != "ALLOW":
                    raise RuntimeError("Expected ALLOW but received: " + str(allow_decision))
                if block_decision != "BLOCK":
                    raise RuntimeError("Expected BLOCK but received: " + str(block_decision))
                if allow_response.get("execution_authorization") is None:
                    raise RuntimeError("ALLOW response did not include an execution authorization.")
                if block_response.get("execution_authorization") is not None:
                    raise RuntimeError("BLOCK response unexpectedly included an execution authorization.")

                allow_receipt_ok, allow_receipt_reason = verify_attestation(
                    base_url, allow_response["decision_receipt"]
                )
                allow_auth_ok, allow_auth_reason = verify_attestation(
                    base_url, allow_response["execution_authorization"]
                )
                block_receipt_ok, block_receipt_reason = verify_attestation(
                    base_url, block_response["decision_receipt"]
                )
                if not allow_receipt_ok or not allow_auth_ok or not block_receipt_ok:
                    raise RuntimeError(
                        "A Verigate signature did not verify: "
                        + json.dumps(
                            {
                                "allow_receipt": [allow_receipt_ok, allow_receipt_reason],
                                "allow_execution_authorization": [allow_auth_ok, allow_auth_reason],
                                "block_receipt": [block_receipt_ok, block_receipt_reason],
                            },
                            ensure_ascii=False,
                        )
                    )

                adversarial_status, adversarial = http_json(
                    base_url + "/v1/verify/adversarial",
                    {"authorization": allow_response["execution_authorization"]},
                )
                if adversarial_status != 200 or not adversarial.get("baseline_valid"):
                    raise RuntimeError(
                        "Verigate's adversarial verifier rejected the valid ALLOW authorization: "
                        + json.dumps(adversarial, ensure_ascii=False)
                    )

                allow_path = output_root / "allow-response.json"
                block_path = output_root / "block-response.json"
                allow_path.write_text(json.dumps(allow_response, indent=2), encoding="utf-8")
                block_path.write_text(json.dumps(block_response, indent=2), encoding="utf-8")

                # Run the actual Node bridge CLI against the fresh responses while
                # the temporary Verigate verifier is still online. The signer key
                # is generated in memory and the domain uses a dummy contract address.
                # This signs data only; it cannot broadcast a transaction.
                project_root = Path(__file__).resolve().parents[1]
                wallet_result = subprocess.run(
                    [
                        "node",
                        "-e",
                        "const { Wallet } = require('ethers'); "
                        "const w = Wallet.createRandom(); "
                        "process.stdout.write(JSON.stringify({privateKey:w.privateKey,address:w.address}));",
                    ],
                    cwd=project_root,
                    capture_output=True,
                    text=True,
                    timeout=10,
                    check=False,
                )
                if wallet_result.returncode != 0:
                    raise RuntimeError("Could not create an ephemeral bridge test key: " + wallet_result.stderr[-2000:])
                test_wallet = json.loads(wallet_result.stdout)
                bridge_env = env.copy()
                bridge_env["VERIGATE_BASE_URL"] = base_url
                bridge_env["BRIDGE_SIGNER_PRIVATE_KEY"] = test_wallet["privateKey"]
                bridge_env["AUTHORITY_SIGNER_ADDRESS"] = test_wallet["address"]
                bridge_env["PORTALDOT_GUARD_ADDRESS"] = "0x000000000000000000000000000000000000dEaD"
                bridge_env["PORTALDOT_CHAIN_ID"] = str(CHAIN_ID)

                bridge_allow = subprocess.run(
                    ["node", "adapter/verigate-bridge.js", str(allow_path)],
                    cwd=project_root,
                    env=bridge_env,
                    capture_output=True,
                    text=True,
                    timeout=12,
                    check=False,
                )
                if bridge_allow.returncode != 0:
                    raise RuntimeError(
                        "The PortalDot bridge CLI refused the genuine ALLOW response: "
                        + bridge_allow.stderr[-3000:]
                    )
                signed_dry_run = json.loads(bridge_allow.stdout)
                signed_path = output_root / "bridge-signature-dry-run.json"
                signed_path.write_text(json.dumps(signed_dry_run, indent=2), encoding="utf-8")

                bridge_block = subprocess.run(
                    ["node", "adapter/verigate-bridge.js", str(block_path)],
                    cwd=project_root,
                    env=bridge_env,
                    capture_output=True,
                    text=True,
                    timeout=12,
                    check=False,
                )
                block_refused = (
                    bridge_block.returncode != 0
                    and "not ALLOW" in (bridge_block.stderr + bridge_block.stdout)
                )
                if not block_refused:
                    raise RuntimeError(
                        "The PortalDot bridge CLI did not clearly refuse the BLOCK response. "
                        + bridge_block.stderr[-3000:]
                    )

                summary = {
                    "test_instance": "isolated temporary Verigate API",
                    "base_url": base_url,
                    "policy": "only the ALLOW recipient is permitted",
                    "allow": {
                        "decision": allow_decision,
                        "execution_authorization_present": True,
                        "decision_receipt_signature_valid": allow_receipt_ok,
                        "execution_authorization_signature_valid": allow_auth_ok,
                        "verigate_adversarial_baseline_valid": adversarial.get("baseline_valid"),
                        "verigate_adversarial_attacks_all_blocked": adversarial.get("all_blocked"),
                        "response_file": str(allow_path),
                    },
                    "block": {
                        "decision": block_decision,
                        "execution_authorization_present": False,
                        "decision_receipt_signature_valid": block_receipt_ok,
                        "bridge_cli_refused_block": block_refused,
                        "response_file": str(block_path),
                    },
                    "bridge_cli_allow_dry_run": {
                        "signature_created": True,
                        "signature_file": str(signed_path),
                        "authority_signer": test_wallet["address"],
                        "domain_contract_is_dummy": True,
                    },
                    "note": "Temporary test-only issuer/bridge keys and test recipients. The bridge CLI generated a typed signature for a dummy contract domain; no transaction was broadcast and this signature is not deployment evidence.",
                }
                summary_path = output_root / "summary.json"
                summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
                print(json.dumps(summary, indent=2))
                print("\nPASS: real Verigate HTTP routes issued ALLOW and BLOCK; signed artifacts verified; BLOCK carried no execution authorization.")
                print("No on-chain transaction was signed or broadcast.")
                return 0
            finally:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
    finally:
        # Delete all temporary runtime state and test issuer private keys; preserve
        # only the response artifacts and summary in output_root.
        shutil.rmtree(runtime_root, ignore_errors=True)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Verigate local demo failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
