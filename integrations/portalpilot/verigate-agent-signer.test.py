#!/usr/bin/env python3
"""Negative tests for the PortalPilot Verigate signer CLI; no network or real DB."""
from __future__ import annotations

import base64
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

ROOT = Path(__file__).resolve().parent
SIGNER = ROOT / "verigate-agent-signer.py"
GENESIS = "0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd"
AGENT = "agent-test"
IDENTITY = "identity-test"
RECIPIENT = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY"


def raw_public_key(key: Ed25519PrivateKey) -> bytes:
    return key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )


class SignerCliTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.verigate = self.root / "fake-verigate"
        core = self.verigate / "core"
        core.mkdir(parents=True)
        (core / "__init__.py").write_text("", encoding="utf-8")
        (core / "identity.py").write_text(
            "def sign_action_intent(action, identity_id, key):\n"
            "    return 'test-signature-only'\n", encoding="utf-8")
        (core / "models.py").write_text(
            "class ActionIntent:\n"
            "    def __init__(self, **kwargs): self.values = kwargs\n", encoding="utf-8")
        (core / "storage.py").write_text(
            "import base64, os\n"
            "class Identity:\n"
            "    agent_id = os.environ['FAKE_REGISTERED_AGENT_ID']\n"
            "    public_key_b64 = os.environ['FAKE_REGISTERED_PUBLIC_KEY_B64']\n"
            "class Storage:\n"
            "    def __init__(self, path): pass\n"
            "    def identity(self, identity_id):\n"
            "        return Identity() if identity_id == os.environ['VERIGATE_IDENTITY_ID'] else None\n"
            "    def identity_is_active(self, identity_id):\n"
            "        return os.environ.get('FAKE_IDENTITY_ACTIVE', '1') == '1'\n"
            "    def close(self): pass\n", encoding="utf-8")

        self.key = Ed25519PrivateKey.generate()
        self.key_file = self.root / "agent.key"
        self.key_file.write_bytes(self.key.private_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PrivateFormat.Raw,
            encryption_algorithm=serialization.NoEncryption(),
        ))
        self.env = os.environ.copy()
        self.env.update({
            "VERIGATE_SOURCE_ROOT": str(self.verigate),
            "VERIGATE_DB": str(self.root / "not-a-real-db.sqlite"),
            "VERIGATE_AGENT_ID": AGENT,
            "VERIGATE_IDENTITY_ID": IDENTITY,
            "VERIGATE_AGENT_PRIVATE_KEY_FILE": str(self.key_file),
            "PORTALDOT_SUBSTRATE_GENESIS_HASH": GENESIS,
            "PORTALDOT_SUBSTRATE_SIGNER_RECIPIENT_SS58": RECIPIENT,
            "PORTALDOT_SUBSTRATE_SIGNER_MAX_AMOUNT_BASE_UNITS": "1000",
            "PORTALDOT_SUBSTRATE_SIGNER_MAX_FEE_BASE_UNITS": "100",
            "FAKE_REGISTERED_AGENT_ID": AGENT,
            "FAKE_REGISTERED_PUBLIC_KEY_B64": base64.b64encode(raw_public_key(self.key)).decode(),
            "FAKE_IDENTITY_ACTIVE": "1",
        })
        self.payload = {
            "agent_id": AGENT,
            "action_type": "portaldot.substrate_transfer",
            "target": RECIPIENT,
            "resource": "native-transfer",
            "amount_exact": "500",
            "asset": "POT",
            "network": "portaldot-v3-substrate",
            "purpose": "signer negative test",
            "requested_capability": None,
            "metadata": {"portaldot_substrate_v3": {
                "genesis_hash": GENESIS,
                "recipient_ss58": RECIPIENT,
                "amount_base_units": "500",
                "max_fee_base_units": "50",
            }},
            "intent_id": "intent-test-1",
            "timestamp": 1790000000,
        }

    def tearDown(self) -> None:
        self.temp.cleanup()

    def run_signer(self, payload=None):
        import json
        return subprocess.run(
            [sys.executable, str(SIGNER)],
            input=json.dumps(self.payload if payload is None else payload),
            text=True, capture_output=True, env=self.env, timeout=10,
        )

    def assert_refused(self, result, expected: str) -> None:
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertEqual(result.stdout, "", "refused signing must not emit signature data")
        self.assertIn(expected, result.stderr)

    def test_refuses_non_allowlisted_recipient(self):
        payload = {**self.payload, "target": "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty"}
        result = self.run_signer(payload)
        self.assert_refused(result, "not the configured recipient allowlist entry")

    def test_refuses_amount_above_signer_ceiling(self):
        payload = {**self.payload, "amount_exact": "1001",
                   "metadata": {"portaldot_substrate_v3": {
                       **self.payload["metadata"]["portaldot_substrate_v3"],
                       "amount_base_units": "1001",
                   }}}
        result = self.run_signer(payload)
        self.assert_refused(result, "exceeds the configured signer ceiling")

    def test_refuses_wrong_configured_genesis(self):
        self.env["PORTALDOT_SUBSTRATE_GENESIS_HASH"] = "0x" + "ab" * 32
        result = self.run_signer()
        self.assert_refused(result, "configured genesis does not match")

    def test_refuses_inactive_identity(self):
        self.env["FAKE_IDENTITY_ACTIVE"] = "0"
        result = self.run_signer()
        self.assert_refused(result, "identity is inactive")

    def test_refuses_private_key_that_does_not_match_registered_identity(self):
        other_key = Ed25519PrivateKey.generate()
        self.key_file.write_bytes(other_key.private_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PrivateFormat.Raw,
            encryption_algorithm=serialization.NoEncryption(),
        ))
        result = self.run_signer()
        self.assert_refused(result, "does not match the registered Verigate identity")

    def test_valid_fixture_emits_signature_only(self):
        result = self.run_signer()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "test-signature-only\n")
        self.assertEqual(result.stderr, "")


if __name__ == "__main__":
    unittest.main(verbosity=2)
