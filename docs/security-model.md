# Security model and trust boundaries

## Intended execution flow

1. An agent proposes a specific payment intent.
2. Verigate evaluates the intent and policy. Any non-ALLOW decision must stop the flow.
3. The bridge independently validates both signed Verigate artifacts against a pinned Ed25519 public key, then queries `/v1/verify` as a secondary check.
4. The bridge compares the authorized action with the exact recipient, amount, intent/action identifier and short expiry it is about to encode.
5. A dedicated EVM bridge key signs the EIP-712 TransferAuthorization.
6. The PortalDot contract recovers that EVM signer and executes only the signed native-token payment.

## Verigate issuer trust

The bridge requires `VERIGATE_PUBLIC_KEY_FILE` to identify a local PEM for the trusted issuer key. The key fingerprint must be established through an independent trusted channel; downloading a key from the same API endpoint without checking its fingerprint is not pinning. Both signatures are verified locally before the issuer API is asked to verify them again. A compromised or incorrect verification endpoint cannot make a forged artifact pass the local cryptographic check, although denial of service remains possible while the secondary API check is required.

## What the contract enforces

- EIP-712 domain includes the current chainId and verifying contract address.
- Signed fields are recipient, amount, nonce, deadline and action identifier.
- A nonce is consumed once.
- A signature from any address other than the immutable authoritySigner is rejected.
- The contract performs native-token transfers only. It has no generic arbitrary-call or caller-controlled oracle interface.
- Re-entrant execution is blocked, and the nonce is marked before the external call. A reverted transfer rolls the entire transaction back.

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

GitHub Actions passed bridge and contract tests plus Solidity compilation, and the isolated Verigate ALLOW/BLOCK integration for [commit 78049cf](https://github.com/rudimentall1/verigate-portaldot/commit/78049cf2e5369efab8a3bbbaf47fcb5de4f1106c): [unit tests](https://github.com/rudimentall1/verigate-portaldot/actions/runs/38681676086) and [PortalDot CI](https://github.com/rudimentall1/verigate-portaldot/actions/runs/38681676047). Unit tests cover pinned local Ed25519 verification, refusal of forged artifacts even when the remote verifier says valid, absent key configuration, invalid remote responses, network failure, HTTP 503 and cross-language number formatting. These are local automated checks, not live-network validation. Review dependency advisories and the trust boundary before using real testnet funds.

## Live-network evidence

Do not write a deployment address or transaction hash until a live PortalDot RPC preflight succeeds and the deployment transaction is confirmed on the expected chain. Record the block number, timestamp and explorer link alongside the output.
