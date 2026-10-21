# Three-minute Hacker House demo plan

**Recording status:** pending. Public Web3 DApp preview: https://htmlpreview.github.io/?https://github.com/rudimentall1/verigate-portaldot/blob/main/web3-dapp/index.html

The console performs live read-only RPC calls and wallet connection; it is not a transaction demo. The presentation PDF is not a substitute for the required product video.

**Latest reproducible integration result (20 October 2026):** [`evidence/local-e2e-2026-10-20.json`](../evidence/local-e2e-2026-10-20.json) records a successful isolated run against Verigate HTTP authorization routes and a temporary loopback Hardhat EVM. ALLOW and BLOCK decisions, Ed25519 receipts, bridge refusal of BLOCK, executor dry-run, and exact local transfer execution passed. The run used Verigate revision `de24e7a02911b5803bac60f799bc1ab37891fec2`; all local transaction hashes are explicitly non-PortalDot evidence. The repository test suite also passed: 156 tests.

**Goal:** show the product's actual authorization decision path, then distinguish that local end-to-end evidence from the contract's separately verified PortalDot V3 testnet deployment.

## Recording plan (target: 2 minutes 40 seconds)

### 0:00–0:20 — Live Web3 console and design
Open the [public Web3 console](https://htmlpreview.github.io/?https://github.com/rudimentall1/verigate-portaldot/blob/main/web3-dapp/index.html) and press Refresh live state. Show current chain ID, latest block, guard bytecode presence, contract balance and `authoritySigner()`. Connect a testnet wallet if available. The page must not ask for secrets or send transactions. Then briefly show the [architecture diagram](architecture.md).

Say: An agent proposal is not spending authority. Verigate decides; the bridge verifies the signed artifacts and constrains the approved action; the contract enforces the EIP-712 transfer scope.

### 0:20–0:50 — Contract deployment
Show [deployment evidence](deployment-evidence-2026-10-20.md), the transaction hash, contract address and the live state in the Web3 console. Explain that the current RPC serves the contract state but does not return the historical deployment receipt on re-query.

Say: PortalDotAgentGuard was deployed on PortalDot V3 testnet. Its deployment receipt succeeded, the runtime bytecode fingerprint was read back, and the on-chain authority signer matched the configured signer. This proves deployment, not an end-to-end token transfer.

### 0:50–1:40 — ALLOW and BLOCK integration
Run or show the reproducible isolated Verigate integration against a compatible Verigate checkout (the successful server run used revision de24e7a) and a temporary loopback Hardhat EVM. Show the ALLOW response, BLOCK response and the summary in /tmp/verigate-portaldot-e2e/.

Point out:
- allow.decision = ALLOW and the receipt / execution-authorization signature checks pass.
- block.decision = BLOCK and no execution authorization is issued.
- Bridge refuses BLOCK.
- Executor dry-run leaves state unchanged.
- Local execution confirms the exact authorized transfer and event.

Say: These transfer events are from the local simulator, not public PortalDot.

### 1:40–2:10 — Guardrails
Show contracts/PortalDotAgentGuard.sol and the test names covering replay, amount/recipient changes, expiry, invalid signatures and reentrancy.

Say: The contract has no generic arbitrary-call interface and only pays from its own balance. The bridge signer is a separate trust boundary; the contract itself does not verify Verigate's Ed25519 signatures.

### 2:10–2:40 — Public transaction and limitations
Show the verified receipt for transaction 0xbe3ade2ba3209cf0df3647cea50fb6608a77bb837213a25b8ec419fa9914cc14 and the matching TransferExecuted fields: action ID, recipient, amount and nonce. Say explicitly that this one-base-unit transaction proves the authorization call path but is not a meaningful-value payment.

Say: PortalDot V3's EVM compatibility allows the Solidity/EIP-712 guard to run on this network. Substrate genesis/runtime checks are separate operational checks. The specific EVM-to-SS58 account mapping remains unverified, a non-dust transfer and recipient balance-delta check remain open, and this testnet prototype is not an independent audit.

## Do not claim
- Do not present the local EVM transfer hash as a PortalDot transaction.
- Do not claim the EVM-to-SS58 mapping is verified.
- Do not claim production readiness or an independent security audit.
- Do not show .env, mnemonic files, private keys, API credentials, or private wallet exports.

## Final recording checklist
- [ ] Keep the video below three minutes.
- [ ] Include the live Web3 console and actual ALLOW/BLOCK behavior, not slides alone.
- [ ] Show the testnet deployment address and transaction separately from the local transfer.
- [ ] Upload to YouTube, Vimeo, Loom, or another public/accessible URL supported by DoraHacks.
- [ ] Paste the final public link into the DoraHacks Build entry and README/submission record.