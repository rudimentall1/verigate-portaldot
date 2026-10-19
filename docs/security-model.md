# Security model and trust boundaries

## Intended execution flow

1. An agent proposes a specific payment intent.
2. Verigate evaluates the intent and policy. Any non-ALLOW decision must stop the flow.
3. The bridge independently validates both signed Verigate artifacts against a pinned Ed25519 public key, then queries `/v1/verify` as a secondary check.
4. The bridge compares the authorized action with the exact recipient, amount, intent/action identifier and short expiry it is about to encode.
5. Before signing, the bridge verifies the configured chain ID, guard bytecode, pinned `PORTALDOT_GUARD_CODE_HASH`, and `authoritySigner()` using read-only RPC calls.
6. A dedicated EVM bridge key signs the EIP-712 TransferAuthorization.
7. The PortalDot contract recovers that EVM signer and executes only the signed native-token payment.

## Verigate issuer trust

The bridge requires `VERIGATE_PUBLIC_KEY_FILE` to identify a local PEM for the trusted issuer key. The key fingerprint must be established through an independent trusted channel; downloading a key from the same API endpoint without checking its fingerprint is not pinning. Both signatures are verified locally before the issuer API is asked to verify them again. A compromised or incorrect verification endpoint cannot make a forged artifact pass the local cryptographic check, although denial of service remains possible while the secondary API check is required.

## What the contract enforces

- EIP-712 domain includes the current chainId and verifying contract address.
- Signed fields are recipient, amount, nonce, deadline and action identifier.
- A nonce is consumed once.
- A signature from any address other than the immutable authoritySigner is rejected.
- The contract performs native-token transfers only. It has no generic arbitrary-call or caller-controlled oracle interface.
- Re-entrant execution is blocked, and the nonce is marked before the external call. A reverted transfer rolls the entire transaction back.

## Pre-sign contract identity checks

Before emitting an EIP-712 signature, the bridge requires `PORTALDOT_RPC_URL`, the expected chain ID, `PORTALDOT_GUARD_ADDRESS`, and a pinned 32-byte `PORTALDOT_GUARD_CODE_HASH`. It reads the chain ID and runtime bytecode, compares the runtime bytecode's Keccak hash with the pinned value, and calls `authoritySigner()` to compare the on-chain immutable signer with `AUTHORITY_SIGNER_ADDRESS`. Missing configuration, empty bytecode, chain mismatch, code-hash mismatch or authority mismatch stops signing.

These checks catch many configuration mistakes and address substitutions, but they do not make the RPC endpoint trustworthy. An endpoint can lie about its chain ID and read responses. Independently confirm the RPC endpoint and pinned runtime-code hash through trusted sources; a matching chain ID alone is not proof of network identity.

## What it does not enforce

The contract does not verify Verigate's Ed25519 authorization. It trusts the off-chain bridge signer to issue EIP-712 signatures only after successful Ed25519 verification and exact-action comparison. Compromise or misuse of that bridge key can authorize payments from the contract's balance. Keep the bridge key separate from a deployer wallet, limit funds in the demo vault, and do not describe this trust model as trustless.

The demo supports a single native-token transfer. It is not a general wallet, token vault, arbitrary-call executor, audited product or production key-management system.

## Required negative tests

- different recipient, amount, nonce, action ID, contract domain or chain ID;
- expired deadline;
- repeated nonce;
- malformed or non-canonical signature;
- zero recipient/amount;
- insufficient balance and failing recipient;
- re-entrant recipient;
- Verigate verification endpoint unreachable (network error);
- Verigate verification endpoint returning a non-2xx response (including HTTP 503).

The code commit `5ea418769816206f9f75eafce6a914f6ab352a11` passed [101 tests and Solidity compilation](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39197882529). The documentation-updated PR head subsequently passed [test and integration CI](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39197956367). Coverage includes local pinned Ed25519 verification, denied/forged artifacts, cross-language number formatting, wrong chain, empty code, code-hash and signer mismatch, local bridge-to-guard execution, credentialed RPC rejection, redirects, and malformed JSON-RPC responses. The integration uses disposable Verigate state and a loopback EVM; it does not validate a live network. The current public developer docs I could verify list the mainnet Substrate WebSocket and do not independently establish the reported EVM V3 endpoint. Confirm that endpoint, chain ID, denomination and EVM/Substrate address mapping with PortalDot before using test funds.

## Live-network evidence

Do not write a deployment address or transaction hash until a live PortalDot RPC preflight succeeds and the deployment transaction is confirmed on the expected chain. Record the block number, timestamp and explorer link alongside the output.
