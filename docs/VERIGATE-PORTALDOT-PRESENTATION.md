# Verigate + PortalDot
## Put an authorization check between an AI agent and a payment

### 1. The problem

AI agents are becoming capable of preparing and submitting payments. The application still needs to decide what each agent is allowed to do.

A valid transaction is not necessarily an authorized transaction. The recipient, amount and timing must stay within rules set by the owner or application.

### 2. What we built

Verigate evaluates a proposed action against those rules and returns an ALLOW, WARN or BLOCK decision.

For the PortalDot EVM demo, the bridge verifies Verigate's signed decision and creates a short-lived EIP-712 authorization for one exact payment. The deployed `PortalDotAgentGuardV2` checks that authorization before transferring funds held by the guard.

### 3. How a payment is checked

1. The application or agent proposes a payment.
2. Verigate evaluates it against the configured policy.
3. The bridge verifies the signed Verigate artifacts and checks the exact recipient and amount.
4. A separate EIP-712 authorization is created for the PortalDot guard.
5. The guard checks the signature, recipient, amount, nonce and deadline before moving funds.

The EVM contract verifies the bridge's EIP-712 signature. Verigate's Ed25519 artifacts are verified off-chain by the bridge.

### 4. What the EVM guard enforces

- Only approved recipient addresses can receive a transfer.
- A single transfer is limited to **0.1 POT**.
- Spending is limited to **0.5 POT per resettable 3,600-second interval**.

The interval counter resets after the configured period. It is not a continuously sliding rolling-window calculation. The administrator can change the allowlist and limits.

### 5. What is running on PortalDot V3

The current EVM demo uses `PortalDotAgentGuardV2` on PortalDot V3 EVM testnet.

- A **0.1 POT** transfer was executed after a Verigate ALLOW decision.
- The recorded receipt succeeded in block **149241** and contains one matching `TransferExecuted` event.
- The published read-only dashboard checks the deployed contract and can run recipient and amount rejection probes.
- A separate native Substrate adapter has also completed a Verigate-authorized `Balances.transfer_keep_alive` testnet transfer. Its saved transaction was re-queried through one configured RPC and matched block **175489** and one `balances.Transfer` event.

These are two separate execution paths with different enforcement models.

### 6. EVM transfer record

**Contract:** `0x87C494a5e4B0A8E055F283767579667E10E046C6`

**Network:** PortalDot V3 EVM testnet  
**Chain ID:** `420420777`  
**Block:** `149241`  
**Amount:** `0.1 POT`  
**Transaction:** `0xaf3df785fdeaf85bbc9af2ae1342a7c664f4a55877469c4996eff2fe90f5551e`

The saved evidence reports a successful receipt and one matching `TransferExecuted` event. The receipt and balance checks used one configured RPC; they have not been independently checked through a second provider.

### 7. Rejection checks against the deployed guard

The published dashboard ran two read-only `eth_call` checks against the V2 contract:

- An address outside the allowlist returned `InvalidRecipient()`.
- A request for `0.100000000000000001 POT` returned `AmountExceedsCap(amount, cap)`.

These calls did not create signatures or transactions, did not produce mined reverts and did not incur transaction fees. They show how the deployed contract responds to those inputs. They do not establish that Verigate itself returned BLOCK for those exact probes.

### 8. The native Substrate path

The separate Substrate adapter checked a Verigate ALLOW decision, completed a successful `system_dryRun`, and submitted `Balances.transfer_keep_alive`. The saved record reports finalization in block **175489** with one matching `balances.Transfer` event.

The transaction was re-queried through one configured RPC. There is no second-provider confirmation or fresh re-verification of the original Ed25519 artifacts. The Substrate runtime does not verify Verigate's signature; that check is performed by the adapter. A direct transaction that bypasses the adapter is outside this control path.

### 9. What this does — and does not — protect

The EVM guard controls transfers routed through its own contract balance. It is not a firewall for a user's entire wallet. The native Substrate adapter checks actions submitted through that adapter; it cannot stop a user or application from submitting a separate transaction outside it.

This is a testnet reference implementation, not an audited or production-ready wallet security product. No mainnet deployment, PortalDot Wallet integration or DaaS integration is claimed. The live chain reads described here used one configured RPC.

### 10. Why this is useful

The integration gives developers a working example of where to place an authorization check in an agent payment flow. They can inspect the policy decision, the action binding, the EVM contract checks and the separate Substrate adapter rather than treating an agent's intent as permission to spend.

The next step is to have an independent application developer reproduce one of these flows and assess what would be needed for a real pilot.

### 11. Code and evidence

- **Repository:** [rudimentall1/verigate-portaldot](https://github.com/rudimentall1/verigate-portaldot)
- **Live read-only demo:** [PortalDot V2 guard dashboard](https://rudimentall1.github.io/verigate-portaldot/?guard=0x87C494a5e4B0A8E055F283767579667E10E046C6)
- **EVM transfer evidence:** [V2 live transfer record](https://github.com/rudimentall1/verigate-portaldot/blob/main/docs/evidence/portaldot-v2-live-transfer-2026-10-22.json)
- **Native Substrate evidence:** [finalized transfer record](https://github.com/rudimentall1/verigate-portaldot/blob/main/docs/evidence/portaldot-native-substrate-live-transfer-2026-10-24.json)
- **Implementation:** Solidity contracts, bridge and adapter code, tests, verification scripts and machine-readable evidence are in the repository.
