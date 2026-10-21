# Three-minute PortalDot Hacker House demo

**Recording status: not recorded yet.** Public DApp: https://rudimentall1.github.io/verigate-portaldot/

## Recording setup

Record a 16:9 desktop capture with microphone audio, and edit out loading time and pauses. Target duration: **2:45**. Open these before recording:

1. The live DApp above, with the network card visible.
2. `contracts/PortalDotAgentGuard.sol` in GitHub.
3. `docs/authorized-transfer-evidence-2026-10-21-nondust.md` in GitHub.
4. The local integration result `evidence/local-e2e-2026-10-20.json` or the actual ALLOW/BLOCK terminal summary, if available.
5. The PortalDot node console: https://node-console.portaldot.dev/

Do not show `.env`, keys, mnemonics, issuer secrets or signed authorization payloads. Do not start a new public transfer just for the recording. Use cuts to keep the demo moving.

## Shot list and voice-over

### 0:00–0:15 — The idea

**On screen:** DApp title and the one-line summary in the README.

**Say:** “An AI agent can propose a payment, but a proposal must not grant spending authority. Verigate decides whether the action is allowed; the bridge binds approval to one exact transfer; PortalDotAgentGuard enforces that scope on-chain.”

### 0:15–0:40 — Live PortalDot state

**On screen:** Press **Refresh live state**. Hold long enough to show the observed chain ID, latest block, guard bytecode, balance and `authoritySigner()`. Do not connect a wallet unless it is necessary for the specific demo.

**Say:** “This is the public PortalDot V3 EVM RPC view. The dashboard reads chain state and the deployed guard. Wallet connection and transaction broadcast are separate user-triggered actions; loading the page does not send a transaction.”

### 0:40–1:05 — The contract's boundary

**On screen:** Open `contracts/PortalDotAgentGuard.sol`. Briefly show `executeTransfer`, signature recovery, deadline, replay-protected nonce, balance check and `TransferExecuted`.

**Say:** “The contract accepts only a valid EIP-712 authorization from the configured bridge signer. The signature binds the chain and contract to the recipient, amount, nonce, deadline and action ID. The guard has no arbitrary-call function. Verigate's Ed25519 signatures are verified off-chain by the bridge; this contract does not claim to verify Ed25519 itself.”

### 1:05–1:45 — ALLOW and BLOCK

**On screen:** Show the recorded local integration summary or run the reproducible harness only if its compatible Verigate checkout and dependencies are already prepared. Show ALLOW, BLOCK, refusal to sign BLOCK, and the local transfer confirmation. Avoid scrolling through setup logs.

**Say:** “The isolated integration sends an allowed and a denied action through Verigate's real HTTP routes. BLOCK does not receive an execution authorization. The ALLOW case runs through the bridge and the actual Solidity guard source on a temporary loopback Hardhat EVM. This proves the local integration path; this local transaction is not a public PortalDot transaction.”

### 1:45–2:25 — Public testnet evidence

**On screen:** Open [the recorded 0.1 EVM POT transfer report](authorized-transfer-evidence-2026-10-21-nondust.md). Highlight the transaction hash, block 132475, recorded receipt status 1, amount 0.1 POT, matching `TransferExecuted` event and guard balance delta.

**Say:** “Separately, this report records the public PortalDot V3 transfer: 0.1 EVM POT, block 132475, successful receipt and the matching guard event. The receipt and event were re-queried from the configured RPC when the evidence was collected, and the recipient/relayer balances reconcile with the transfer and fee. A later query could not retrieve this historical receipt from that RPC, so this screen is the saved dated evidence, not a claim that the old receipt is currently being served live.”

**Explorer rule:** Open the node console only to show the available PortalDot interface. Do not claim it displayed this EVM transaction unless you have personally searched the hash and confirmed the matching result. Do not invent an explorer deep link.

### 2:25–2:45 — Why PortalDot / close

**On screen:** Return to README architecture diagram, then briefly show the node console link.

**Say:** “PortalDot V3's EVM execution environment provides the deployment target for this Solidity guard. The result is a focused authorization middleware prototype for agent-powered applications, not a universal transaction firewall or a production multichain framework. It is testnet evidence, not a security audit or a mainnet launch.”

## Final checks before publishing

- [ ] Recording is under three minutes and audio is clear.
- [ ] Live RPC reads and local ALLOW/BLOCK behavior are shown as different demonstrations.
- [ ] The local Hardhat transaction is never presented as a public PortalDot transaction.
- [ ] Public proof is labelled as the saved report for transaction `0x21acff99d30652161f7e4ba6e1d76e6b6b67e8b9e02b09edd64d8bd7f2d5dd9c`, block `132475`.
- [ ] Do not state that an explorer verified the hash unless a matching page was actually opened.
- [ ] No secret files, keys or signed authorization payloads appear in the recording.
- [ ] Upload to a public or judge-accessible URL and add that exact URL to the DoraHacks build entry.

## Recorded evidence and limits

- Recorded local integration result: [local E2E JSON](../evidence/local-e2e-2026-10-20.json). It uses a temporary loopback Hardhat EVM; its transaction hashes are not public PortalDot evidence.
- Recorded testnet transfer: [0.1 EVM POT evidence](authorized-transfer-evidence-2026-10-21-nondust.md).
- Deployment address and original deployment receipt: [deployment evidence](deployment-evidence-2026-10-20.md).
- Exact H160-to-SS58 mapping remains unverified; EVM genesis hash pin was not configured; there is no independent second-provider cross-check.
- The historical transaction receipt is not reliably returned by the configured RPC at a later query.
