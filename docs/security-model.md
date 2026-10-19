# Security model and trust boundaries

## Intended execution flow

1. An agent proposes a specific payment intent.
2. Verigate evaluates the intent and policy. Any non-ALLOW decision must stop the flow.
3. The bridge independently validates both signed Verigate artifacts against a pinned Ed25519 public key, then queries /v1/verify as a secondary check.
4. The bridge compares the authorized action with the exact recipient, amount, intent/action identifier and short expiry it is about to encode.
5. Before signing, the bridge verifies the configured chain ID, guard bytecode, pinned PORTALDOT_GUARD_CODE_HASH, and on-chain authoritySigner() using read-only RPC calls.
6. A dedicated EVM bridge key signs the EIP-712 TransferAuthorization.
7. The executor independently validates the EIP-712 domain, signer, exact transfer fields and deadline. It checks guard identity, available guard balance and relayer fee budget.
8. The executor simulates the exact contract call. It does not broadcast by default; only explicit --broadcast can submit the signed transfer.
9. The PortalDot contract recovers that EVM signer and executes only the signed native-token payment.

## Verigate issuer trust

The bridge requires VERIGATE_PUBLIC_KEY_FILE to identify a local PEM for the trusted issuer key. The key fingerprint must be established through an independent trusted channel; downloading a key from the same API endpoint without checking its fingerprint is not pinning. Both signatures are verified locally before the issuer API is asked to verify them again. A compromised or incorrect verification endpoint cannot make a forged artifact pass the local cryptographic check, although denial of service remains possible while the secondary API check is required.

## What the contract enforces

- EIP-712 domain includes the current chainId and verifying contract address.
- Signed fields are recipient, amount, nonce, deadline and action identifier.
- A nonce is consumed once.
- A signature from any address other than the immutable authoritySigner is rejected.
- The contract performs native-token transfers only. It has no generic arbitrary-call or caller-controlled oracle interface.
- Re-entrant execution is blocked, and the nonce is marked before the external call. A reverted transfer rolls the entire transaction back.

## Executor safeguards

The executor:
- rejects malformed or unsafe integer encodings instead of coercing through JavaScript Number;
- recovers the signer locally from the EIP-712 signature, rejects non-canonical high-s values and invalid recovery bytes, and requires exact chain/contract/authority matches;
- rejects zero recipient, self-recipient, zero amount, expired/overlong authorization and tampered fields;
- verifies the deployed guard runtime-code hash and on-chain authority signer using read-only RPC calls;
- checks current guard funds and runs a read-only simulation and gas estimation;
- requires a relayer fee budget at least equal to the estimated fee plus 20%;
- repeats critical chain/contract/balance/deadline checks just before broadcast;
- does not submit transactions unless the user explicitly passes --broadcast.

These are guardrails, not proof that a single RPC endpoint is trustworthy, and gas costs can change between the preflight and transaction execution.

## What it does not enforce

The contract does not verify Verigate's Ed25519 authorization. It trusts the off-chain bridge signer to issue EIP-712 signatures only after successful Ed25519 verification and exact-action comparison. Compromise or misuse of that bridge key can authorize payments from the contract's balance. Keep the bridge key separate from a deployer/relayer wallet, limit funds in the demo vault, and do not describe this trust model as trustless.

The demo supports a single native-token transfer. It is not a general wallet, token vault, arbitrary-call executor, audited product or production key-management system.

## Required negative tests

- different recipient, amount, nonce, action ID, contract domain or chain ID;
- expired deadline;
- repeated nonce;
- malformed or non-canonical signature;
- zero recipient/amount;
- insufficient contract balance and failing recipient;
- re-entrant recipient;
- Verigate verification endpoint unreachable or returning non-2xx;
- malformed executor payload, signer mismatch and expired transfer deadline;
- insufficient relayer fee budget and broadcast disabled by default.

The integration harness exercises a real Verigate API instance with disposable keys, then deploys the actual guard source to a loopback-only Hardhat EVM. It proves a dry run leaves the guard balance unchanged, executes the exact signed ALLOW transfer locally and asserts the recipient balance delta matches the signed amount; BLOCK is refused. This demonstrates the local integration path only, not compatibility with the public PortalDot runtime.

## Live-network evidence

Do not write a deployment address or transaction hash until the actual PortalDot deployment transaction is confirmed on the intended network. Record its block number, timestamp, receipt and runtime-code hash alongside the evidence.
