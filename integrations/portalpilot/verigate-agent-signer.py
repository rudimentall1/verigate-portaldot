#!/usr/bin/env python3
"""Narrow local signer adapter for PortalPilot -> Verigate native transfers.

This CLI must run on the trusted Verigate host. It reads one JSON ActionIntent
from stdin and writes only the base64 agent signature to stdout. It never
returns or exports private key material and never authorizes or submits a
transaction. The caller must still send the signed action to Verigate's
/v1/actions/authorize endpoint and verify both signed response artifacts.

Required environment:
  VERIGATE_SOURCE_ROOT
  VERIGATE_DB
  VERIGATE_AGENT_ID
  VERIGATE_IDENTITY_ID
  VERIGATE_AGENT_PRIVATE_KEY_FILE
  PORTALDOT_SUBSTRATE_GENESIS_HASH
  PORTALDOT_SUBSTRATE_SIGNER_RECIPIENT_SS58
  PORTALDOT_SUBSTRATE_SIGNER_MAX_AMOUNT_BASE_UNITS
  PORTALDOT_SUBSTRATE_SIGNER_MAX_FEE_BASE_UNITS
"""
from __future__ import annotations

import base64
import json
import os
import re
import sys
from decimal import Decimal
from pathlib import Path


def die(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(2)


def load_private_key(path: Path):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    raw = path.read_bytes()
    key = None
    for loader in (serialization.load_pem_private_key, serialization.load_der_private_key):
        try:
            key = loader(raw, password=None)
            break
        except (ValueError, TypeError):
            pass
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
        die("Configured agent key is not a supported Ed25519 private key.")
    return key


def main() -> int:
    required = (
        "VERIGATE_SOURCE_ROOT", "VERIGATE_DB", "VERIGATE_AGENT_ID",
        "VERIGATE_IDENTITY_ID", "VERIGATE_AGENT_PRIVATE_KEY_FILE",
        "PORTALDOT_SUBSTRATE_GENESIS_HASH",
        "PORTALDOT_SUBSTRATE_SIGNER_RECIPIENT_SS58",
        "PORTALDOT_SUBSTRATE_SIGNER_MAX_AMOUNT_BASE_UNITS",
        "PORTALDOT_SUBSTRATE_SIGNER_MAX_FEE_BASE_UNITS",
    )
    env = {name: os.environ.get(name, "").strip() for name in required}
    missing = [name for name, value in env.items() if not value]
    if missing:
        die("Missing required signer configuration: " + ", ".join(missing))

    genesis = env["PORTALDOT_SUBSTRATE_GENESIS_HASH"].lower()
    expected_genesis = "0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd"
    if genesis != expected_genesis:
        die("Refusing to sign: configured genesis does not match the pinned PortalDot V3 testnet.")

    def limit(name: str) -> int:
        value = env[name]
        if not re.fullmatch(r"[1-9][0-9]*", value) or int(value) > (1 << 128) - 1:
            die(name + " must be a canonical positive integer within the 128-bit balance range.")
        return int(value)

    max_amount = limit("PORTALDOT_SUBSTRATE_SIGNER_MAX_AMOUNT_BASE_UNITS")
    max_fee = limit("PORTALDOT_SUBSTRATE_SIGNER_MAX_FEE_BASE_UNITS")

    try:
        payload = json.load(sys.stdin)
    except Exception:
        die("stdin must contain one JSON object.")
    if not isinstance(payload, dict):
        die("Action input must be a JSON object.")

    sys.path.insert(0, str(Path(env["VERIGATE_SOURCE_ROOT"]).resolve()))
    try:
        from core.identity import sign_action_intent
        from core.models import ActionIntent
        from core.storage import Storage
        from cryptography.hazmat.primitives import serialization
    except Exception as exc:
        die("Could not load the installed Verigate identity modules: " + type(exc).__name__)

    allowed_fields = {
        "agent_id", "action_type", "target", "resource", "amount_exact",
        "asset", "network", "purpose", "requested_capability", "metadata",
        "intent_id", "timestamp",
    }
    if set(payload) - allowed_fields:
        die("Action input contains unsupported fields.")
    if payload.get("agent_id") != env["VERIGATE_AGENT_ID"]:
        die("Action agent_id does not match the configured registered agent.")
    if payload.get("action_type") != "portaldot.substrate_transfer":
        die("Only portaldot.substrate_transfer actions may be signed.")
    if payload.get("network") != "portaldot-v3-substrate" or payload.get("asset") != "POT":
        die("Only native POT transfers on the pinned PortalDot V3 Substrate network may be signed.")
    if not isinstance(payload.get("intent_id"), str) or not payload["intent_id"]:
        die("intent_id is required.")
    if not isinstance(payload.get("timestamp"), (int, float)) or isinstance(payload.get("timestamp"), bool):
        die("timestamp must be numeric.")
    if not isinstance(payload.get("target"), str) or payload["target"] != env["PORTALDOT_SUBSTRATE_SIGNER_RECIPIENT_SS58"]:
        die("Action target is not the configured recipient allowlist entry.")
    amount_text = payload.get("amount_exact")
    if not isinstance(amount_text, str) or not re.fullmatch(r"[1-9][0-9]*", amount_text):
        die("amount_exact must be a canonical positive base-unit integer string.")
    if int(amount_text) > max_amount:
        die("Action amount exceeds the configured signer ceiling.")

    metadata = payload.get("metadata")
    mapping = metadata.get("portaldot_substrate_v3") if isinstance(metadata, dict) else None
    if not isinstance(mapping, dict):
        die("Signed action must include portaldot_substrate_v3 metadata.")
    if str(mapping.get("genesis_hash", "")).lower() != expected_genesis:
        die("Action metadata genesis does not match the pinned testnet.")
    if mapping.get("recipient_ss58") != payload.get("target"):
        die("Action target and metadata recipient do not match.")
    if str(mapping.get("amount_base_units", "")) != amount_text:
        die("Action amount_exact and metadata amount_base_units do not match.")
    fee_text = str(mapping.get("max_fee_base_units", ""))
    if not re.fullmatch(r"[1-9][0-9]*", fee_text) or int(fee_text) > max_fee:
        die("Action fee ceiling is invalid or exceeds the configured signer ceiling.")

    try:
        action = ActionIntent(
            agent_id=payload["agent_id"],
            action_type=payload["action_type"],
            target=payload["target"],
            resource=str(payload.get("resource", "")),
            amount=Decimal(amount_text),
            amount_exact=amount_text,
            asset=payload["asset"],
            network=payload["network"],
            purpose=str(payload.get("purpose", "")),
            requested_capability=payload.get("requested_capability"),
            metadata=metadata,
            intent_id=payload["intent_id"],
            timestamp=float(payload["timestamp"]),
        )
    except Exception as exc:
        die("Could not construct canonical Verigate ActionIntent: " + type(exc).__name__)

    key_path = Path(env["VERIGATE_AGENT_PRIVATE_KEY_FILE"]).expanduser().resolve()
    if not key_path.is_file():
        die("Configured agent private-key file does not exist.")
    key = load_private_key(key_path)

    storage = Storage(env["VERIGATE_DB"])
    try:
        identity = storage.identity(env["VERIGATE_IDENTITY_ID"])
        if identity is None or identity.agent_id != env["VERIGATE_AGENT_ID"]:
            die("Configured identity is missing or belongs to a different agent.")
        if not storage.identity_is_active(env["VERIGATE_IDENTITY_ID"]):
            die("Configured Verigate identity is inactive.")
        registered = base64.b64decode(identity.public_key_b64, validate=True)
        derived = key.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        if registered != derived:
            die("Private key does not match the registered Verigate identity.")
        signature = sign_action_intent(action, env["VERIGATE_IDENTITY_ID"], key)
    finally:
        storage.close()

    sys.stdout.write(signature + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
