# PortalDot Hacker House demo script

Recording status: not recorded. Target duration: 2:40–2:45. Public dashboard: https://rudimentall1.github.io/verigate-portaldot/

## Gate before recording

Do not present V2 as deployed until all of these are true:
- V2 deployment receipt status is `0x1` on chain ID `420420777`.
- `eth_getCode` returns non-empty runtime bytecode at the recorded V2 address.
- On-chain readback confirms the expected admin, authority signer, max-per-transfer, window limit, window duration, and an allowed recipient.
- A signed transfer succeeds to a recipient distinct from the relayer/sender and shows a matching `TransferExecuted` event.
- Cap and allowlist negative tests revert as expected; reverted nonces remain unused.
- The published GitHub Pages site has the read-only dashboard, and `?guard=0x<V2_ADDRESS>` reads the actual deployed V2 state.

If V2 has not passed these gates, do not use the V2 shot list as if it were live. Record the V1 prototype honestly and say that recipient/spending caps are not yet deployed.

## Recording setup

Record a 16:9 desktop capture with microphone audio. Hide browser bookmarks that reveal unrelated private projects. Open:
1. The published read-only dashboard.
2. The V2 Solidity source on GitHub.
3. The V2 test file and the CI run showing passing tests.
4. The actual V2 deployment and transfer evidence files, created only after those transactions have been confirmed.
5. The local Verigate ALLOW/BLOCK result, labelled as local Hardhat evidence.
6. PortalDot node console only if a specific result can actually be located there.

Never show `.env`, keys, mnemonics, issuer secrets, raw signed authorization payloads, or private account information. Do not invent an explorer page or use a local transaction as public testnet proof.

## Shot list and voice-over

### 0:00–0:20 — The control boundary

On screen: dashboard title, then the small architecture overview in the repo.

Say: “An AI agent can propose a payment, but a proposal is not spending authority. Verigate makes the off-chain decision, the bridge signs one exact action, and the PortalDot guard applies on-chain limits before funds can move.”

### 0:20–0:50 — Live read-only chain state

On screen: click Refresh. Show chain ID, latest block, runtime code size, balance, authority signer, admin and V2 caps. The address in the URL must be the confirmed V2 address.

Say: “This page is read-only. It queries the public PortalDot V3 EVM RPC and does not connect a wallet, request a signature, or broadcast a transaction. These policy values are read from the deployed contract, not hardcoded into the dashboard.”

### 0:50–1:20 — Enforcement in Solidity

On screen: show `executeTransfer`, allowlist check, max-per-transfer check, spending-window check, signature recovery, nonce write before external call, and the reentrancy guard. Then show the policy setters and their admin restriction.

Say: “The admin can change the recipient allowlist and spending caps, but cannot execute a payment without the bridge signer's EIP-712 authorization. The signer can authorize a payment but cannot change policy. The contract does not verify Verigate Ed25519 itself; that check remains off-chain in the bridge.”

### 1:20–1:45 — ALLOW and BLOCK, local only

On screen: show the reproducible isolated integration output and CI run. Keep the Hardhat label visible.

Say: “The local integration sends allowed and denied actions through Verigate's actual routes. BLOCK does not receive an execution authorization. The ALLOW path runs against the actual Solidity source on a temporary Hardhat EVM. This is local integration evidence, not a public PortalDot transaction.”

### 1:45–2:25 — Confirmed public testnet transfer

On screen: show the actual V2 transfer report: transaction hash, block, receipt status, amount, fee, recipient, and matching `TransferExecuted` event. The recipient must differ from the relayer/sender. If the RPC no longer serves the receipt, show the saved dated report and label it historical; do not imply a live lookup succeeded.

Say: “This is the confirmed PortalDot V3 testnet transfer. The receipt, event and recipient balance delta were recorded together. The amount and actual fee are visible side by side. The guard limits the action at the contract boundary; the bridge's Ed25519 verification remains an off-chain trust boundary.”

### 2:25–2:45 — Close

On screen: dashboard and repository.

Say: “This is a focused agent-authorization middleware prototype on PortalDot V3 testnet. It is not a production launch or an independent security audit. The public evidence separates live chain reads, local integration tests and recorded testnet transactions.”

## Final checks before publishing

- [ ] Video is under three minutes with clear audio.
- [ ] Dashboard URL points at the deployed V2 address, and all shown values are read from RPC.
- [ ] Live RPC, local Hardhat ALLOW/BLOCK, and public testnet transfer are clearly distinguished.
- [ ] Transfer recipient is not the sender/relayer; amount and fee are visible together.
- [ ] No raw authorization JSON, secret files, private keys or mnemonics appear.
- [ ] No H160-to-SS58 mapping claim is made unless a real runtime storage entry was verified.
- [ ] No explorer claim is made unless the matching transaction hash was personally confirmed there.
- [ ] Upload the actual recording and paste its exact public/judge-accessible URL into DoraHacks.

## Known limits

V1 is deployed at `0x3f2f484484fbE6e224d058fDfDB6B5A14F09655b`, but has no on-chain recipient allowlist or spending caps. V2 must not be described as live until the gate above is satisfied. The historical V1 transfer to the relayer/sender is not suitable as the final economic demo. H160-to-SS58 mapping remains unverified; do not claim cross-chain mapping support.
