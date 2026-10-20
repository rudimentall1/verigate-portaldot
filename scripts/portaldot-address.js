const crypto = require("node:crypto");
const { keccak256 } = require("ethers");

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ACCOUNT_SUFFIX = Buffer.alloc(12, 0xee);
const SS58_PREFIX = 42;

function base58Encode(bytes) {
  let leadingZeroes = 0;
  while (leadingZeroes < bytes.length && bytes[leadingZeroes] === 0) leadingZeroes += 1;

  let value = BigInt(bytes.length ? `0x${bytes.toString("hex")}` : "0x0");
  let encoded = "";
  while (value > 0n) {
    const remainder = Number(value % 58n);
    encoded = BASE58_ALPHABET[remainder] + encoded;
    value /= 58n;
  }
  return "1".repeat(leadingZeroes) + encoded;
}

function base58Decode(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Expected a non-empty SS58 address.");
  }
  let decodedValue = 0n;
  for (const character of value) {
    const digit = BASE58_ALPHABET.indexOf(character);
    if (digit < 0) throw new Error("SS58 address contains a non-Base58 character.");
    decodedValue = decodedValue * 58n + BigInt(digit);
  }

  let hex = decodedValue.toString(16);
  if (hex.length % 2 !== 0) hex = "0" + hex;
  const body = decodedValue === 0n ? Buffer.alloc(0) : Buffer.from(hex, "hex");
  let leadingZeroes = 0;
  while (leadingZeroes < value.length && value[leadingZeroes] === "1") leadingZeroes += 1;
  return Buffer.concat([Buffer.alloc(leadingZeroes), body]);
}

function encodeSs58AccountId(accountId, prefix = SS58_PREFIX) {
  if (!Buffer.isBuffer(accountId) || accountId.length !== 32) {
    throw new Error("AccountId32 must be exactly 32 bytes.");
  }
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 63) {
    throw new Error("Only simple SS58 prefixes 0 through 63 are supported.");
  }

  const payload = Buffer.concat([Buffer.from([prefix]), accountId]);
  const checksum = crypto
    .createHash("blake2b512")
    .update(Buffer.concat([Buffer.from("SS58PRE", "ascii"), payload]))
    .digest()
    .subarray(0, 2);
  return base58Encode(Buffer.concat([payload, checksum]));
}

function decodeSs58AccountId(ss58Address) {
  const decoded = base58Decode(ss58Address);
  // AccountId32 with a one-byte SS58 prefix is 1 prefix + 32 account bytes + 2 checksum bytes.
  if (decoded.length !== 35) {
    throw new Error("Only SS58 AccountId32 addresses with a one-byte network prefix are supported.");
  }
  const prefix = decoded[0];
  if (prefix > 63) {
    throw new Error("Only simple SS58 prefixes 0 through 63 are supported.");
  }

  const payload = decoded.subarray(0, 33);
  const suppliedChecksum = decoded.subarray(33);
  const expectedChecksum = crypto
    .createHash("blake2b512")
    .update(Buffer.concat([Buffer.from("SS58PRE", "ascii"), payload]))
    .digest()
    .subarray(0, 2);
  if (!crypto.timingSafeEqual(suppliedChecksum, expectedChecksum)) {
    throw new Error("SS58 checksum does not match; refusing to infer an AccountId32.");
  }

  return {
    accountId: Buffer.from(decoded.subarray(1, 33)),
    ss58Prefix: prefix
  };
}

function evmToSubstrateAccount(evmAddress, ss58Prefix = SS58_PREFIX) {
  if (typeof evmAddress !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(evmAddress)) {
    throw new Error("Expected an EVM address with 0x and exactly 40 hexadecimal characters.");
  }
  const h160 = Buffer.from(evmAddress.slice(2), "hex");
  const accountId = Buffer.concat([h160, ACCOUNT_SUFFIX]);
  return {
    evmAddress: "0x" + h160.toString("hex"),
    accountIdHex: "0x" + accountId.toString("hex"),
    ss58Prefix,
    substrateAddress: encodeSs58AccountId(accountId, ss58Prefix),
    derivation: "fallback AccountId32 = H160 || 0xEE * 12",
    runtimeMappingConfirmed: false,
    note: "Offline H160-to-AccountId32 fallback only; does not prove the deployed runtime maps this H160 to that account."
  };
}

function substrateToEvmAddress(ss58Address) {
  const decoded = decodeSs58AccountId(ss58Address);
  const { accountId, ss58Prefix } = decoded;
  const suffixIsEthOrigin = accountId.subarray(20).equals(ACCOUNT_SUFFIX);
  let evmAddress;
  let derivation;
  if (suffixIsEthOrigin) {
    evmAddress = "0x" + accountId.subarray(0, 20).toString("hex");
    derivation = "eth-origin AccountId32 suffix: H160 || 0xEE * 12";
  } else {
    const digest = keccak256(accountId);
    evmAddress = "0x" + digest.slice(-40).toLowerCase();
    derivation = "current upstream pallet-revive AccountId32 -> last 20 bytes of keccak256(AccountId32)";
  }
  return {
    substrateAddress: ss58Address,
    ss58Prefix,
    accountIdHex: "0x" + accountId.toString("hex"),
    evmAddress,
    derivation,
    runtimeMappingConfirmed: false,
    note: "Offline derivation using current upstream polkadot-cli/pallet-revive rules. PortalDot V3 runtime metadata and any stateful AddressSuffix mapping must be checked separately."
  };
}

function inspectAccountMapping(ss58Address, candidateH160 = "") {
  const derived = substrateToEvmAddress(ss58Address);
  if (!candidateH160) {
    return {
      ...derived,
      candidateH160: null,
      candidateMatchesOfflineDerivation: null,
      runtimeMappingConfirmed: false
    };
  }
  if (typeof candidateH160 !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(candidateH160)) {
    throw new Error("Candidate H160 must have 0x and exactly 40 hexadecimal characters.");
  }

  const candidateFallback = evmToSubstrateAccount(candidateH160, derived.ss58Prefix);
  return {
    ...derived,
    candidateH160: "0x" + candidateH160.slice(2).toLowerCase(),
    candidateMatchesOfflineDerivation:
      derived.evmAddress.toLowerCase() === candidateH160.toLowerCase(),
    candidateFallbackAccountIdHex: candidateFallback.accountIdHex,
    candidateFallbackMatchesAccountId32:
      candidateFallback.accountIdHex.toLowerCase() === derived.accountIdHex.toLowerCase(),
    runtimeMappingConfirmed: false,
    note: "A match is only an offline derivation match, not an on-chain mapping proof. A mismatch can mean a different HD-derived EVM key, a stateful runtime mapping, or a different PortalDot runtime implementation."
  };
}

function main(args = process.argv.slice(2)) {
  if (args.length < 1 || args.length > 2) {
    throw new Error("Usage: npm run address:substrate -- 0xEvmAddress [ss58Prefix]");
  }
  const prefix = args.length === 2 ? Number(args[1]) : SS58_PREFIX;
  const result = evmToSubstrateAccount(args[0], prefix);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Address conversion failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  base58Encode,
  base58Decode,
  encodeSs58AccountId,
  decodeSs58AccountId,
  evmToSubstrateAccount,
  substrateToEvmAddress,
  inspectAccountMapping,
  SS58_PREFIX
};
