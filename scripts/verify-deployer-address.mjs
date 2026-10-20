import "dotenv/config";
import { ethers } from "ethers";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function normalizedAddress(value, label) {
  if (typeof value !== "string" || !ethers.isAddress(value.trim())) {
    throw new Error(`${label} must be a valid EVM address.`);
  }
  return ethers.getAddress(value.trim());
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function inspectDeployerIdentity({
  expectedAddress,
  privateKey,
  deploymentEstimateFrom = "",
  authoritySignerAddress = ""
} = {}) {
  const expected = normalizedAddress(expectedAddress, "Expected wallet address");
  if (!nonEmpty(privateKey)) {
    throw new Error("DEPLOYER_PRIVATE_KEY is not configured in the local environment or .env; no RPC request was made.");
  }

  let deployerAddress;
  try {
    const key = privateKey.trim().startsWith("0x") ? privateKey.trim() : `0x${privateKey.trim()}`;
    deployerAddress = new ethers.Wallet(key).address;
  } catch {
    throw new Error("DEPLOYER_PRIVATE_KEY is not a valid EVM private key; the value was not printed.");
  }

  const configuredEstimateFrom = nonEmpty(deploymentEstimateFrom)
    ? normalizedAddress(deploymentEstimateFrom, "DEPLOYMENT_ESTIMATE_FROM")
    : null;
  const configuredAuthoritySigner = nonEmpty(authoritySignerAddress)
    ? normalizedAddress(authoritySignerAddress, "AUTHORITY_SIGNER_ADDRESS")
    : null;

  const matchesExpectedAddress = deployerAddress.toLowerCase() === expected.toLowerCase();
  const deploymentEstimateFromMatches = configuredEstimateFrom === null
    ? null
    : configuredEstimateFrom.toLowerCase() === deployerAddress.toLowerCase();
  const authoritySignerIsNonZero = configuredAuthoritySigner === null
    ? null
    : configuredAuthoritySigner.toLowerCase() !== ethers.ZeroAddress.toLowerCase();
  const authoritySignerIsDistinct = configuredAuthoritySigner === null
    ? null
    : configuredAuthoritySigner.toLowerCase() !== deployerAddress.toLowerCase();

  const blockers = [];
  if (!matchesExpectedAddress) {
    blockers.push("The configured DEPLOYER_PRIVATE_KEY derives to a different address than the supplied wallet address.");
  }
  if (deploymentEstimateFromMatches === false) {
    blockers.push("DEPLOYMENT_ESTIMATE_FROM does not match the address derived from DEPLOYER_PRIVATE_KEY.");
  }
  if (authoritySignerIsNonZero === false) {
    blockers.push("AUTHORITY_SIGNER_ADDRESS must not be the zero address.");
  }
  if (authoritySignerIsDistinct === false) {
    blockers.push("The deployer and AUTHORITY_SIGNER_ADDRESS must be different addresses.");
  }

  return {
    status: blockers.length === 0 ? "identity_matches" : "configuration_mismatch",
    expectedAddress: expected,
    deployerAddress: ethers.getAddress(deployerAddress),
    matchesExpectedAddress,
    deploymentEstimateFromAddress: configuredEstimateFrom,
    deploymentEstimateFromMatches,
    authoritySignerAddress: configuredAuthoritySigner,
    authoritySignerIsNonZero,
    authoritySignerIsDistinct,
    configurationConsistent: blockers.length === 0,
    blockers
  };
}

export function redactDeployerIdentityResult(result) {
  return {
    ...result,
    expectedAddress: "[redacted]",
    deployerAddress: "[redacted]",
    deploymentEstimateFromAddress: result.deploymentEstimateFromAddress === null ? null : "[redacted]",
    authoritySignerAddress: result.authoritySignerAddress === null ? null : "[redacted]"
  };
}

async function main(args = process.argv.slice(2)) {
  const redact = args.includes("--redact");
  const positional = args.filter((arg) => arg !== "--redact");
  if (positional.length !== 1) {
    throw new Error("Usage: npm run verify:deployer-address -- <wallet-displayed-H160> [--redact]");
  }

  const result = inspectDeployerIdentity({
    expectedAddress: positional[0],
    privateKey: process.env.DEPLOYER_PRIVATE_KEY,
    deploymentEstimateFrom: process.env.DEPLOYMENT_ESTIMATE_FROM,
    authoritySignerAddress: process.env.AUTHORITY_SIGNER_ADDRESS
  });
  const output = {
    ... (redact ? redactDeployerIdentityResult(result) : result),
    scope: "local key/address comparison only",
    networkRequests: 0,
    transactionSubmitted: false,
    privateKeyPrinted: false,
    deploymentReadiness: "NOT_ESTABLISHED_BY_THIS_CHECK",
    note: "A successful identity match does not establish Substrate mapping, RPC authenticity, available balance, deployment cost, or deployment readiness."
  };
  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
  if (!result.configurationConsistent) process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Deployer identity check failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
