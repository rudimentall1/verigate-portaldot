#!/usr/bin/env python3
"""Browser smoke test for the published, read-only PortalDot DApp.

This test checks the deployed page and its actual RPC reads. It does not send
transactions or treat a saved receipt as a live result.
"""
from __future__ import annotations

from datetime import datetime, timezone
import json
import os
import sys
import time
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get(
    "VERIGATE_DAPP_URL",
    "https://rudimentall1.github.io/verigate-portaldot/",
)
EXPECTED_CHAIN_ID = "420420777"
EXPECTED_GUARD = "0x87C494a5e4B0A8E055F283767579667E10E046C6"
EXPECTED_CODE_HASH = "0x010a565cad83a33442d0f23f6fcb6f605a76082a5b58434813bedf84c54f0859"
EXPECTED_SIGNER = "0x48F9B07d37b5AF744BA8195c4d6740145b593ea6"
KNOWN_V2_TX = "0xaf3df785fdeaf85bbc9af2ae1342a7c664f4a55877469c4996eff2fe90f5551e"


def fail(message: str) -> None:
    raise AssertionError(message)


def text_of(page, selector: str) -> str:
    return page.locator(selector).inner_text().strip()


def run() -> None:
    page_errors: list[str] = []
    failed_requests: list[str] = []
    module_responses: list[dict[str, object]] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.set_default_timeout(15000)
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.on(
            "requestfailed",
            lambda request: failed_requests.append(
                request.url + " :: " + str(request.failure)
            ),
        )
        page.on(
            "response",
            lambda response: module_responses.append(
                {"url": response.url, "status": response.status}
            )
            if response.url.rstrip("/").endswith("/receipt-lookup.mjs")
            else None,
        )

        response = page.goto(BASE_URL, wait_until="domcontentloaded", timeout=60000)
        if response is None or response.status != 200:
            fail(f"Published DApp returned no successful document response: {getattr(response, 'status', None)}")

        page.get_by_role("heading", name="A proposal is not authority.").wait_for()
        page.locator("#receiptLookup").wait_for()
        page.locator("#receiptTxHash").wait_for()

        # The module is imported by the page; wait for it and confirm the
        # deployed asset, not just the source file, is being served.
        try:
            page.wait_for_function(
                "() => performance.getEntriesByType('resource').some(e => e.name.endsWith('/receipt-lookup.mjs'))",
                timeout=20000,
            )
        except PlaywrightTimeoutError:
            fail("The published page did not load receipt-lookup.mjs. Check the Pages artifact and relative module path.")

        module = next(
            (item for item in module_responses if str(item["url"]).rstrip("/").endswith("/receipt-lookup.mjs")),
            None,
        )
        if module is None or module["status"] != 200:
            fail(f"receipt-lookup.mjs was not served with HTTP 200: {module}")

        # Wait for actual read-only chain reads, not just page markup.
        page.wait_for_function(
            """() => document.querySelector('#rpcStatus')?.textContent.trim() !== 'Checking'
                && document.querySelector('#chainId')?.textContent.trim() !== '—'""",
            timeout=60000,
        )
        # refresh() reads base network state first, then awaits the separate
        # V2 policy eth_call group. Wait for that second stage to finish before
        # asserting policy values; otherwise the smoke test races the UI.
        page.wait_for_function(
            """() => {
                const value = document.querySelector('#policyStatus')?.textContent.trim() || '';
                return value !== '' && value !== 'Reading contract policy…';
            }""",
            timeout=30000,
        )
        checks = {
            "url": page.url,
            "title": page.title(),
            "rpcStatus": text_of(page, "#rpcStatus"),
            "chainId": text_of(page, "#chainId"),
            "latestBlock": text_of(page, "#block"),
            "codeSize": text_of(page, "#codeSize"),
            "codeHash": text_of(page, "#codeHash"),
            "codeStatus": text_of(page, "#codeStatus"),
            "contractAddress": text_of(page, "#contractAddress"),
            "signer": text_of(page, "#signer"),
            "signerStatus": text_of(page, "#signerStatus"),
            "policyStatus": text_of(page, "#policyStatus"),
            "policyMax": text_of(page, "#policyMax"),
            "policyWindow": text_of(page, "#policyWindow"),
            "policySeconds": text_of(page, "#policySeconds"),
            "policyRecipient": text_of(page, "#policyRecipient"),
            "receiptModuleStatus": module["status"],
        }

        if checks["rpcStatus"] != "Responding":
            fail("RPC is not responding in the browser: " + json.dumps(checks, ensure_ascii=False))
        if checks["chainId"] != EXPECTED_CHAIN_ID:
            fail("Unexpected chain ID in browser: " + json.dumps(checks, ensure_ascii=False))
        if checks["contractAddress"].lower() != EXPECTED_GUARD.lower():
            fail("Dashboard does not default to the recorded V2 guard: " + json.dumps(checks, ensure_ascii=False))
        if checks["codeHash"].lower() != EXPECTED_CODE_HASH.lower():
            fail("Dashboard runtime code hash does not match the recorded V2 hash: " + json.dumps(checks, ensure_ascii=False))
        if "matches recorded deployment" not in checks["codeStatus"]:
            fail("Dashboard did not confirm the recorded V2 runtime hash: " + json.dumps(checks, ensure_ascii=False))
        if checks["signer"].lower() != EXPECTED_SIGNER.lower():
            fail("On-chain authority signer differs from the recorded address: " + json.dumps(checks, ensure_ascii=False))
        if "Matches recorded authority signer" not in checks["signerStatus"]:
            fail("Dashboard signer comparison failed: " + json.dumps(checks, ensure_ascii=False))
        if "Read from the selected contract" not in checks["policyStatus"]:
            fail("V2 on-chain policy readback failed: " + json.dumps(checks, ensure_ascii=False))
        if checks["policyMax"] != "0.1 POT" or checks["policyWindow"] != "0.5 POT" or checks["policySeconds"] != "3600 seconds":
            fail("Live V2 policy values differ from the recorded deployment: " + json.dumps(checks, ensure_ascii=False))
        if checks["policyRecipient"] != "Allowed":
            fail("The recorded demo recipient is not reported as allowlisted: " + json.dumps(checks, ensure_ascii=False))

        # Exercise the deployed generic lookup with the known V2 transfer.
        # Archive/pruning differences are reported as unavailable (not success),
        # and are accepted here because the current provider may prune history.
        page.locator("#receiptTxHash").fill(KNOWN_V2_TX)
        page.locator("#checkReceipt").click()
        try:
            page.wait_for_function(
                """() => {
                    const value = document.querySelector('#receiptResult')?.textContent || '';
                    return value.startsWith('RPC lookup returned a mined receipt.')
                      || value.startsWith('The configured RPC returned null')
                      || value.startsWith('Transaction lookup could not be validated:');
                }""",
                timeout=30000,
            )
        except PlaywrightTimeoutError:
            fail("The receipt lookup did not produce a result in 30 seconds.")

        lookup_text = text_of(page, "#receiptResult")
        if lookup_text.startswith("Transaction lookup could not be validated:"):
            # A null receipt is an accepted availability boundary; a genuine
            # validation/network error is not. Fail on all such errors.
            fail("Receipt lookup failed validation: " + lookup_text)

        if lookup_text.startswith("RPC lookup returned a mined receipt."):
            if "Outcome: SUCCESS (receipt status 1)." not in lookup_text:
                fail("Known V2 transaction did not return a successful receipt: " + lookup_text)
            if "Block: 149241" not in lookup_text:
                fail("Known V2 receipt returned an unexpected block: " + lookup_text)
            if "TransferExecuted events from the transaction target: 1" not in lookup_text:
                fail("Known V2 transfer did not return exactly one matching event in this live query: " + lookup_text)
            lower_lookup = lookup_text.lower()
            expected_event_fields = [
                "actionid 0xff2cc7690a604a51db85b1e5c43d02bc7cee12277754ccbf6295e78a7b75f38e",
                "recipient 0xa0fc1a7248955a159d54d84e48681d9cebb86be4",
                "amount 0.1 pot"
            ]
            for field in expected_event_fields:
                if field not in lower_lookup:
                    fail("Known V2 event did not match expected event field " + field + ": " + lookup_text)
            checks["knownV2Lookup"] = "live_success_receipt_event_and_expected_fields"
            checks["knownV2ReceiptStatus"] = 1
            checks["knownV2ReceiptBlock"] = 149241
            checks["knownV2TransferEventCount"] = 1
        else:
            checks["knownV2Lookup"] = "rpc_returned_null_saved_evidence_is_separate"
            checks["knownV2ReceiptStatus"] = None
            checks["knownV2ReceiptBlock"] = None
            checks["knownV2TransferEventCount"] = None

        checks["knownV2TransactionHash"] = KNOWN_V2_TX
        checks["knownV2LookupDisplay"] = lookup_text
        if page_errors:
            fail("Browser runtime errors: " + json.dumps(page_errors, ensure_ascii=False))
        # Record failed requests rather than automatically rejecting optional
        # font/CDN requests; the core page and all required RPC readouts passed.
        checks["failedRequests"] = failed_requests
        report = {
            "schemaVersion": 1,
            "status": "PASS",
            "checkedAt": datetime.now(timezone.utc).isoformat(),
            "commit": os.environ.get("GITHUB_SHA"),
            "workflowRunId": os.environ.get("GITHUB_RUN_ID"),
            "workflowRunAttempt": os.environ.get("GITHUB_RUN_ATTEMPT"),
            "network": "PortalDot V3 EVM testnet",
            "rpcOrigin": "https://test-evm-rpc-v3.portaldot.dev",
            "rpcProviderCount": 1,
            "secondProviderUsed": False,
            "evmGenesisHashPinUsed": False,
            "transactionBroadcast": False,
            "checks": checks
        }
        output_path = os.environ.get("VERIGATE_DAPP_SMOKE_OUTPUT", "").strip()
        if output_path:
            output_file = Path(output_path)
            output_file.parent.mkdir(parents=True, exist_ok=True)
            output_file.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\\n", encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))
        browser.close()


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        print(f"Published DApp browser smoke test FAILED: {exc}", file=sys.stderr)
        sys.exit(1)
