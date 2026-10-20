# Verigate × PortalDot V3: isolated end-to-end verification

Run date: 2026-10-20

The demo was run against a separate worktree of Verigate `de24e7a`; the installed `/opt/verigate` checkout remains unchanged at `5febe08`.

## Results

- Verigate API returned `ALLOW` for the policy-permitted transfer and produced valid Ed25519 decision receipt and execution authorization signatures.
- Verigate API returned `BLOCK` for the denied transfer; no execution authorization was issued and the bridge refused it.
- The bridge verified the signed artifacts and produced an EIP-712 authorization for the local guard.
- Executor dry-run passed without changing balances.
- The real `PortalDotAgentGuard` source was deployed only to an isolated loopback Hardhat EVM configured with chain ID `420420777`.
- The signed local transfer executed, the `TransferExecuted` event was confirmed, and the recipient balance delta matched the exact authorized amount (`1000000` base units).
- No transaction was sent to public PortalDot. This local run is not evidence of a testnet transfer.

Machine-readable response artifacts were written to `/tmp/verigate-portaldot-e2e/` on the server and are intentionally not committed because they contain ephemeral test addresses and temporary paths.