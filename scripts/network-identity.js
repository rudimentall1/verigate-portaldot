const GENESIS_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;

function parseExpectedGenesisHash(value = process.env.PORTALDOT_GENESIS_HASH) {
  if (typeof value !== "string" || !GENESIS_HASH_PATTERN.test(value.trim())) {
    throw new Error(
      "PORTALDOT_GENESIS_HASH must be an independently confirmed 32-byte EVM genesis block hash; refusing deployment/signing."
    );
  }
  return value.trim().toLowerCase();
}

function assertGenesisHashMatches(expectedValue, actualValue) {
  const expected = parseExpectedGenesisHash(expectedValue);
  if (typeof actualValue !== "string" || !GENESIS_HASH_PATTERN.test(actualValue)) {
    throw new Error("RPC did not return a valid genesis block hash; refusing deployment/signing.");
  }
  const actual = actualValue.toLowerCase();
  if (actual !== expected) {
    throw new Error(
      `RPC genesis block hash ${actual} does not match PORTALDOT_GENESIS_HASH; refusing deployment/signing.`
    );
  }
  return actual;
}

async function verifyGenesisHash(provider, expectedValue = process.env.PORTALDOT_GENESIS_HASH) {
  const expected = parseExpectedGenesisHash(expectedValue);
  let block;
  try {
    block = await provider.getBlock(0);
  } catch (error) {
    throw new Error(`Unable to read EVM genesis block from RPC: ${error.message}`);
  }
  if (!block || typeof block !== "object") {
    throw new Error("RPC did not return the EVM genesis block; refusing deployment/signing.");
  }
  return assertGenesisHashMatches(expected, block.hash);
}

module.exports = { parseExpectedGenesisHash, assertGenesisHashMatches, verifyGenesisHash };
