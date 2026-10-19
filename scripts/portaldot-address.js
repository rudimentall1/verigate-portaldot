const crypto = require("node:crypto");

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
    note: "Offline H160-to-AccountId32 derivation for PortalDot V3; use the runtime mapping API when available to confirm the live account."
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

module.exports = { base58Encode, encodeSs58AccountId, evmToSubstrateAccount, SS58_PREFIX };
