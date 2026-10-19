const { ethers } = require("ethers");

const MAX_AUTHORIZATION_TTL_SECONDS = 300n;
const UINT256_MAX = (1n << 256n) - 1n;
const SECP256K1_ORDER = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
const SECP256K1_HALF_ORDER = SECP256K1_ORDER / 2n;
const TRANSFER_TYPES = {
  TransferAuthorization: [
    { name: "recipient", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "actionId", type: "bytes32" }
  ]
};

function fail(message) {
  throw new Error(message);
}

function parseCanonicalUint(value, label, { allowZero = true } = {}) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    fail(`${label} must be a canonical unsigned decimal integer string.`);
  }
  const parsed = BigInt(value);
  if (!allowZero && parsed === 0n) fail(`${label} must be greater than zero.`);
  if (parsed > UINT256_MAX) fail(`${label} exceeds the EVM uint256 limit.`);
  return parsed;
}

function normalizeAddress(value, label) {
  if (typeof value !== "string" || !ethers.isAddress(value)) {
    fail(`${label} must be a valid EVM address.`);
  }
  try {
    return ethers.getAddress(value);
  } catch {
    fail(`${label} must be a valid checksummed EVM address.`);
  }
}

function validateSignedAuthorization(artifact, options = {}) {
  const expectedChainIdText = typeof options.expectedChainId === "bigint"
    ? options.expectedChainId.toString()
    : options.expectedChainId;
  if (typeof expectedChainIdText !== "string" || !/^[1-9][0-9]*$/.test(expectedChainIdText)) {
    fail("Expected chain ID must be explicitly configured as a positive decimal integer.");
  }
  const expectedChainId = BigInt(expectedChainIdText);
  if (expectedChainId > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail("Expected chain ID exceeds the safely supported chain-ID range.");
  }
  if (!Number.isSafeInteger(options.now) || options.now < 0) {
    fail("Current block timestamp must be provided as a non-negative safe integer.");
  }
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    fail("Signed authorization must be a JSON object.");
  }

  const guardAddress = normalizeAddress(options.guardAddress, "Configured guard address");
  const authoritySigner = normalizeAddress(options.authoritySigner, "Configured authority signer");
  if (guardAddress === ethers.ZeroAddress) fail("Configured guard address must not be zero.");
  if (authoritySigner === ethers.ZeroAddress) fail("Configured authority signer must not be zero.");

  const domain = artifact.domain;
  if (!domain || typeof domain !== "object" || Array.isArray(domain)) {
    fail("Signed authorization is missing its EIP-712 domain.");
  }
  if (domain.name !== "PortalDotAgentGuard" || domain.version !== "1") {
    fail("Signed authorization uses an unexpected EIP-712 domain name or version.");
  }
  const domainChainId = parseCanonicalUint(
    typeof domain.chainId === "bigint" ? domain.chainId.toString() : domain.chainId,
    "EIP-712 domain chain ID",
    { allowZero: false }
  );
  if (domainChainId !== expectedChainId) {
    fail("Signed authorization EIP-712 chain ID does not match the configured network.");
  }
  const domainGuard = normalizeAddress(domain.verifyingContract, "EIP-712 verifying contract");
  const reportedContract = normalizeAddress(artifact.contract, "Signed authorization contract");
  if (domainGuard !== guardAddress || reportedContract !== guardAddress) {
    fail("Signed authorization contract does not match PORTALDOT_GUARD_ADDRESS.");
  }

  const reportedAuthority = normalizeAddress(artifact.authoritySigner, "Signed authority signer");
  if (reportedAuthority !== authoritySigner) {
    fail("Signed authorization authority signer does not match AUTHORITY_SIGNER_ADDRESS.");
  }

  const rawTransfer = artifact.transfer;
  if (!rawTransfer || typeof rawTransfer !== "object" || Array.isArray(rawTransfer)) {
    fail("Signed authorization is missing its transfer payload.");
  }
  const recipient = normalizeAddress(rawTransfer.recipient, "Transfer recipient");
  if (recipient === ethers.ZeroAddress || recipient === guardAddress) {
    fail("Transfer recipient must be non-zero and must not be the guard contract itself.");
  }
  const amount = parseCanonicalUint(rawTransfer.amount, "Transfer amount", { allowZero: false });
  const nonce = parseCanonicalUint(rawTransfer.nonce, "Transfer nonce");
  const deadline = parseCanonicalUint(rawTransfer.deadline, "Transfer deadline", { allowZero: false });
  if (typeof rawTransfer.actionId !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(rawTransfer.actionId)) {
    fail("Transfer actionId must be a 32-byte hex value.");
  }
  const actionId = rawTransfer.actionId.toLowerCase();

  if (deadline <= BigInt(options.now)) {
    fail("Signed transfer authorization has expired.");
  }
  if (deadline > BigInt(options.now) + MAX_AUTHORIZATION_TTL_SECONDS) {
    fail("Signed transfer deadline is more than five minutes in the future.");
  }

  if (typeof artifact.signature !== "string" || !/^0x[a-fA-F0-9]{130}$/.test(artifact.signature)) {
    fail("EIP-712 signature must be exactly 65 bytes.");
  }

  const signatureBytes = ethers.getBytes(artifact.signature);
  const signatureR = BigInt(ethers.hexlify(signatureBytes.slice(0, 32)));
  const signatureS = BigInt(ethers.hexlify(signatureBytes.slice(32, 64)));
  const recovery = signatureBytes[64];
  if (signatureR <= 0n || signatureR >= SECP256K1_ORDER) {
    fail("EIP-712 signature has an invalid secp256k1 r value.");
  }
  if (signatureS <= 0n || signatureS > SECP256K1_HALF_ORDER) {
    fail("EIP-712 signature must use canonical low-s form accepted by the guard contract.");
  }
  if (![27, 28].includes(recovery)) {
    fail("EIP-712 signature must use canonical recovery byte 27 or 28.");
  }

  const typedDomain = {
    name: "PortalDotAgentGuard",
    version: "1",
    chainId: expectedChainId,
    verifyingContract: guardAddress
  };
  const typedTransfer = { recipient, amount, nonce, deadline, actionId };
  let recoveredSigner;
  try {
    recoveredSigner = ethers.getAddress(
      ethers.verifyTypedData(typedDomain, TRANSFER_TYPES, typedTransfer, artifact.signature)
    );
  } catch (error) {
    fail(`EIP-712 signature could not be recovered: ${error.message}`);
  }
  if (recoveredSigner !== authoritySigner) {
    fail("EIP-712 signature was not produced by AUTHORITY_SIGNER_ADDRESS.");
  }

  return {
    domain: typedDomain,
    guardAddress,
    authoritySigner,
    transfer: typedTransfer,
    signature: artifact.signature,
    recoveredSigner,
    authorizationId: typeof artifact.authorizationId === "string" ? artifact.authorizationId : null,
    intentId: typeof artifact.intentId === "string" ? artifact.intentId : null
  };
}

function calculateExecutionBudget({
  gasUnits,
  gasPriceWei,
  relayerBalanceWei,
  safetyMarginBps = 2000
}) {
  const gas = BigInt(gasUnits);
  const price = BigInt(gasPriceWei);
  const balance = BigInt(relayerBalanceWei);
  if (gas <= 0n) fail("Execution gas estimate must be positive.");
  if (price < 0n) fail("Gas price cannot be negative.");
  if (balance < 0n) fail("Relayer balance cannot be negative.");
  if (!Number.isInteger(safetyMarginBps) || safetyMarginBps < 0 || safetyMarginBps > 100000) {
    fail("safetyMarginBps must be an integer from 0 to 100000.");
  }
  const estimatedCostWei = gas * price;
  const costWithMarginWei =
    (estimatedCostWei * BigInt(10000 + safetyMarginBps) + 9999n) / 10000n;
  return {
    estimatedCostWei,
    costWithMarginWei,
    relayerBalanceWei: balance,
    isSufficient: balance >= costWithMarginWei,
    shortfallWei: balance >= costWithMarginWei ? 0n : costWithMarginWei - balance
  };
}

module.exports = {
  MAX_AUTHORIZATION_TTL_SECONDS,
  UINT256_MAX,
  TRANSFER_TYPES,
  parseCanonicalUint,
  validateSignedAuthorization,
  calculateExecutionBudget
};
