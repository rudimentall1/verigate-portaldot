# Three-minute Hacker House demo

**Goal:** show a working authorization flow, not just a contract idea. The current recording is a local integration demo. It must not be presented as a live PortalDot deployment.

## Evidence to use

- [Latest successful PortalDot CI run](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39189834992)
- [Latest successful unit-test run](https://github.com/rudimentall1/verigate-portaldot/actions/runs/39189834946)
- Download the `isolated-verigate-api-evidence` artifact from the PortalDot CI run. It contains `summary.json`, `allow-response.json`, `block-response.json`, and `bridge-signature-dry-run.json`. The artifact is retained for 14 days by GitHub Actions; rerun the workflow to regenerate it later.

## Recording plan (target: 2 minutes 35 seconds)

### 0:00–0:20 — Problem and boundary

**Show:** repository front page and the top of this README.

**Say:**
> AI agents should not execute a payment just because a model proposes it. Verigate makes the authorization decision. This PortalDot bridge accepts a narrowly defined native-token transfer only after the signed decision and execution authorization both validate.

### 0:20–0:45 — What is implemented

**Show:** [architecture diagram](architecture.md), then `contracts/PortalDotAgentGuard.sol`.

**Say:**
> The bridge verifies both Ed25519 signatures locally against a pinned issuer public key and asks the API to validate them again. A test also confirms that an invalid signature is refused even when a mocked API replies `valid: true`. It binds the authorization to the exact recipient, amount, chain ID and expiry. The contract verifies an EIP-712 signature, rejects replayed nonces and exposes no arbitrary-call interface. The contract trusts the dedicated EVM bridge signer.

### 0:45–1:25 — Reproducible integration result

**Show:** the latest PortalDot CI run. Expand the `verigate-integration` job and show that `Run isolated Verigate ALLOW/BLOCK integration` and `Upload isolated integration evidence` passed. Then open `summary.json` from the downloaded artifact.

**Point out these fields:**
- `allow.decision = ALLOW`
- `allow.decision_receipt_signature_valid = true`
- `allow.execution_authorization_signature_valid = true`
- `bridge_cli_allow_dry_run.signature_created = true`
- `bridge_cli_allow_dry_run.deployed_on_isolated_loopback_evm = true`
- `bridge_cli_allow_dry_run.runtime_code_hash_verified` records the local guard runtime-code hash
- `block.decision = BLOCK`
- `block.bridge_cli_refused_block = true`

**Say:**
> CI launches a temporary Verigate API with disposable test keys. The ALLOW case produces an EIP-712 signature only after the bridge validates the guard's configured chain ID, pinned runtime-code hash and authority signer. BLOCK is refused. Deployment/funding happens only in the disposable loopback Hardhat EVM; no public PortalDot RPC is used.

### 1:25–1:55 — Contract safety checks

**Show:** successful unit-test workflow or the `PortalDotAgentGuard` test file, focusing on replay protection, changed recipient/amount, expiry and invalid signatures.

**Say:**
> The local Hardhat tests cover replay, altered transfer details, expiry, malformed signatures, reentrancy and failed native transfers. Passing these tests proves the local contract behavior, not compatibility with a live PortalDot network.

### 1:55–2:25 — Current limitation and next milestone

**Show:** [RPC preflight section in README](../README.md#portaldot-v3-preflight) and `.env.example` with the RPC URL and chain ID announced by PortalDot.

**Say:**
> PortalDot has announced the updated EVM RPC and chain ID. We will run preflight first and only proceed if the endpoint responds with the expected chain ID. The bridge also requires `VERIGATE_PUBLIC_KEY_FILE` to point to the trusted issuer PEM; its fingerprint must be verified independently. No transaction was sent to public PortalDot. CI deploys/funds only the temporary local EVM, and it does not execute the bridge signature via `executeTransfer`.

### 2:25–2:35 — Close

**Show:** public repository URL.

**Say:**
> The code, CI runs and reproducible local evidence are public. The live-network step is explicitly tracked rather than claimed prematurely.

## Do not show or claim

- Do not show `.env`, private keys, API tokens, or a real wallet balance.
- Do not present the temporary local guard deployment, simulated chain ID, or dry-run signature as a live PortalDot deployment.
- Do not claim a PortalDot transaction, RPC connection, testnet deployment or explorer verification.
- Keep the whole video under three minutes. If live network details are confirmed later, replace the relevant segment with an actual preflight and verified testnet interaction.
