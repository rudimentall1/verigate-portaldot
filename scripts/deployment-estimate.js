const EVM_DECIMALS = 18;
const EVM_UNITS_PER_POT = 10n ** 18n;
const SUBSTRATE_DECIMALS = 14;
const EVM_UNITS_PER_SUBSTRATE_UNIT = 10n ** BigInt(EVM_DECIMALS - SUBSTRATE_DECIMALS);

function parseHexQuantity(value, label = "RPC quantity") {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical hexadecimal quantity.`);
  }
  return BigInt(value);
}

function formatUnitsExact(value, decimals = EVM_DECIMALS, fractionDigits = 4) {
  const n = BigInt(value);
  if (n < 0n) throw new Error("Unit values cannot be negative.");
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error("decimals must be an integer from 0 to 36.");
  }
  if (!Number.isInteger(fractionDigits) || fractionDigits < 0 || fractionDigits > decimals) {
    throw new Error("fractionDigits must be between 0 and decimals.");
  }
  const scale = 10n ** BigInt(decimals);
  const whole = n / scale;
  if (fractionDigits === 0) return whole.toString();
  const frac = (n % scale).toString().padStart(decimals, "0").slice(0, fractionDigits);
  return `${whole}.${frac}`;
}

function resolveEstimateFromAddresses(configuredValue, privateKeyAddress) {
  const configured = typeof configuredValue === "string" ? configuredValue.trim() : "";
  const derived = typeof privateKeyAddress === "string" ? privateKeyAddress.trim() : "";
  const isAddress = (value) => /^0x[a-fA-F0-9]{40}$/.test(value);
  if (configured && !isAddress(configured)) {
    throw new Error("DEPLOYMENT_ESTIMATE_FROM must be a valid EVM address.");
  }
  if (derived && !isAddress(derived)) {
    throw new Error("Derived deployer address must be a valid EVM address.");
  }
  if (configured && derived && configured.toLowerCase() !== derived.toLowerCase()) {
    throw new Error("DEPLOYMENT_ESTIMATE_FROM does not match the address derived from DEPLOYER_PRIVATE_KEY.");
  }
  const address = configured || derived;
  if (!address) {
    throw new Error("Set DEPLOYMENT_ESTIMATE_FROM to the public EVM deployer address, or set DEPLOYER_PRIVATE_KEY locally.");
  }
  return address;
}

function resolveEstimateAuthoritySigner(value) {
  const configured = typeof value === "string" ? value.trim() : "";
  if (!configured) {
    return {
      address: "0x0000000000000000000000000000000000000001",
      isPlaceholder: true
    };
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(configured) || /^0x0{40}$/i.test(configured)) {
    throw new Error("AUTHORITY_SIGNER_ADDRESS must be a valid non-zero EVM address when supplied.");
  }
  return { address: configured, isPlaceholder: false };
}

function calculateDeploymentCost({ gasUnits, gasPriceWei, balanceWei, safetyMarginBps = 2000 }) {
  const gas = BigInt(gasUnits);
  const gasPrice = BigInt(gasPriceWei);
  const balance = balanceWei === null || balanceWei === undefined ? null : BigInt(balanceWei);
  if (gas <= 0n) throw new Error("gasUnits must be positive.");
  if (gasPrice <= 0n) throw new Error("gasPriceWei must be positive.");
  if (balance !== null && balance < 0n) throw new Error("balanceWei cannot be negative.");
  if (!Number.isInteger(safetyMarginBps) || safetyMarginBps < 0 || safetyMarginBps > 100000) {
    throw new Error("safetyMarginBps must be an integer from 0 to 100000.");
  }
  const estimatedCostWei = gas * gasPrice;
  const costWithMarginWei = (estimatedCostWei * BigInt(10000 + safetyMarginBps) + 9999n) / 10000n;
  return {
    estimatedCostWei,
    costWithMarginWei,
    balanceWei: balance,
    isSufficient: balance === null ? null : balance >= costWithMarginWei,
    shortfallWei: balance === null || balance >= costWithMarginWei ? 0n : costWithMarginWei - balance
  };
}

function substrateRawToEvmWei(substrateRaw) {
  const text = typeof substrateRaw === "string" ? substrateRaw : String(substrateRaw);
  if (!/^(0|[1-9][0-9]*)$/.test(text)) throw new Error("Substrate raw balance must be a canonical non-negative decimal integer string.");
  return BigInt(text) * EVM_UNITS_PER_SUBSTRATE_UNIT;
}

function evmWeiToSubstrateRaw(evmWei) {
  const n = BigInt(evmWei);
  if (n < 0n) throw new Error("EVM value cannot be negative.");
  if (n % EVM_UNITS_PER_SUBSTRATE_UNIT !== 0n) {
    throw new Error("EVM value is not aligned to an integer Substrate raw balance unit.");
  }
  return n / EVM_UNITS_PER_SUBSTRATE_UNIT;
}

module.exports = {
  EVM_DECIMALS,
  EVM_UNITS_PER_POT,
  SUBSTRATE_DECIMALS,
  EVM_UNITS_PER_SUBSTRATE_UNIT,
  parseHexQuantity,
  formatUnitsExact,
  calculateDeploymentCost,
  resolveEstimateAuthoritySigner,
  resolveEstimateFromAddresses,
  substrateRawToEvmWei,
  evmWeiToSubstrateRaw
};
