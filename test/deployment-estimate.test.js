import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { expect } = require("chai");
const {
  parseHexQuantity,
  formatUnitsExact,
  calculateDeploymentCost,
  buildDeploymentReadiness,
  deploymentEstimateExitCode,
  resolveEstimateAuthoritySigner,
  resolveEstimateFromAddresses,
  substrateRawToEvmWei,
  evmWeiToSubstrateRaw,
  EVM_UNITS_PER_SUBSTRATE_UNIT
} = require("../scripts/deployment-estimate.js");

describe("PortalDot deployment estimator arithmetic", function () {
  it("parses only canonical JSON-RPC hex quantities", function () {
    expect(parseHexQuantity("0x0")).to.equal(0n);
    expect(parseHexQuantity("0x1a")).to.equal(26n);
    for (const input of ["", "1", "0x", "0x00", "0x01", "0x-1", 10, null]) {
      expect(() => parseHexQuantity(input)).to.throw(/canonical hexadecimal quantity/);
    }
  });

  it("formats native EVM units without floating-point arithmetic", function () {
    expect(formatUnitsExact(1234567890123456789n, 18, 4)).to.equal("1.2345");
    expect(formatUnitsExact(500000000000000000000n, 18, 4)).to.equal("500.0000");
    expect(formatUnitsExact(1000000000000000000n, 18, 0)).to.equal("1");
  });

  it("converts Substrate raw POT units to EVM value units with the 10^4 ratio", function () {
    expect(EVM_UNITS_PER_SUBSTRATE_UNIT).to.equal(10000n);
    expect(substrateRawToEvmWei("100000000000000")).to.equal(1000000000000000000n);
    expect(evmWeiToSubstrateRaw("1000000000000000000")).to.equal(100000000000000n);
    expect(() => substrateRawToEvmWei("01")).to.throw(/canonical non-negative decimal integer/);
    expect(() => evmWeiToSubstrateRaw(12345n)).to.throw(/not aligned/);
  });

  it("rejects a quote address that differs from the locally configured deployer key", function () {
    expect(resolveEstimateFromAddresses("0x4c07B4f328FA738290Db96BCE2F9CBc4d020D2CB", "")).to.equal("0x4c07B4f328FA738290Db96BCE2F9CBc4d020D2CB");
    expect(resolveEstimateFromAddresses("", "0x4c07B4f328FA738290Db96BCE2F9CBc4d020D2CB")).to.equal("0x4c07B4f328FA738290Db96BCE2F9CBc4d020D2CB");
    expect(resolveEstimateFromAddresses("0x4c07B4f328FA738290Db96BCE2F9CBc4d020D2CB", "0x4C07b4F328fA738290Db96bCE2F9CBc4D020d2cb")).to.equal("0x4c07B4f328FA738290Db96BCE2F9CBc4d020D2CB");
    expect(() => resolveEstimateFromAddresses("0x4c07B4f328FA738290Db96BCE2F9CBc4d020D2CB", "0x1111111111111111111111111111111111111111")).to.throw(/does not match/);
    expect(() => resolveEstimateFromAddresses("", "")).to.throw(/Set DEPLOYMENT_ESTIMATE_FROM/);
    expect(() => resolveEstimateFromAddresses("not-an-address", "")).to.throw(/must be a valid EVM address/);
  });

  it("allows a clearly labelled placeholder only for preliminary cost estimation", function () {
    expect(resolveEstimateAuthoritySigner("")).to.deep.equal({
      address: "0x0000000000000000000000000000000000000001",
      isPlaceholder: true
    });
    expect(resolveEstimateAuthoritySigner("  ")).to.deep.equal({
      address: "0x0000000000000000000000000000000000000001",
      isPlaceholder: true
    });
    expect(resolveEstimateAuthoritySigner("0x4c07B4f328FA738290Db96BCE2F9CBc4d020D2CB")).to.deep.equal({
      address: "0x4c07B4f328FA738290Db96BCE2F9CBc4d020D2CB",
      isPlaceholder: false
    });
    expect(() => resolveEstimateAuthoritySigner("0x0000000000000000000000000000000000000000")).to.throw(/non-zero EVM address/);
    expect(() => resolveEstimateAuthoritySigner("not-an-address")).to.throw(/non-zero EVM address/);
  });

  it("fails closed for deployment readiness while keeping estimates useful for budget planning", function () {
    const placeholder = buildDeploymentReadiness({
      authoritySignerIsPlaceholder: true,
      balanceSufficient: true
    });
    expect(placeholder.readiness).to.equal("NOT_READY_FOR_DEPLOYMENT");
    expect(placeholder.estimateUsableForBudgetPlanning).to.equal(false);
    expect(placeholder.readinessBlockers.some((item) => item.includes("placeholder"))).to.equal(true);
    expect(placeholder.readinessBlockers.some((item) => item.includes("deployer-to-SS58 mapping"))).to.equal(true);

    const fundedWithSelectedSigner = buildDeploymentReadiness({
      authoritySignerIsPlaceholder: false,
      balanceSufficient: true
    });
    expect(fundedWithSelectedSigner.readiness).to.equal("NOT_READY_FOR_DEPLOYMENT");
    expect(fundedWithSelectedSigner.estimateUsableForBudgetPlanning).to.equal(true);
    expect(fundedWithSelectedSigner.readinessBlockers).to.have.length(1);

    const underfunded = buildDeploymentReadiness({
      authoritySignerIsPlaceholder: false,
      balanceSufficient: false
    });
    expect(underfunded.estimateUsableForBudgetPlanning).to.equal(false);
    expect(underfunded.readinessBlockers.some((item) => item.includes("balance"))).to.equal(true);
  });

  it("returns nonzero status when a budget quote is not deployment authorization", function () {
    expect(deploymentEstimateExitCode({
      balanceSufficient: false,
      authoritySignerIsPlaceholder: false,
      readiness: "NOT_READY_FOR_DEPLOYMENT"
    })).to.equal(2);
    expect(deploymentEstimateExitCode({
      balanceSufficient: true,
      authoritySignerIsPlaceholder: true,
      readiness: "NOT_READY_FOR_DEPLOYMENT"
    })).to.equal(3);
    expect(deploymentEstimateExitCode({
      balanceSufficient: true,
      authoritySignerIsPlaceholder: false,
      readiness: "NOT_READY_FOR_DEPLOYMENT"
    })).to.equal(4);
    expect(deploymentEstimateExitCode({
      balanceSufficient: true,
      authoritySignerIsPlaceholder: false,
      readiness: "READY_FOR_DEPLOYMENT"
    })).to.equal(0);
  });

  it("compares the 20 percent deployment-cost margin against balance exactly", function () {
    const enough = calculateDeploymentCost({
      gasUnits: 1000000n,
      gasPriceWei: 10n,
      balanceWei: 12000000n
    });
    expect(enough.estimatedCostWei).to.equal(10000000n);
    expect(enough.costWithMarginWei).to.equal(12000000n);
    expect(enough.isSufficient).to.equal(true);
    expect(enough.shortfallWei).to.equal(0n);

    const short = calculateDeploymentCost({
      gasUnits: 1000000n,
      gasPriceWei: 10n,
      balanceWei: 11999999n
    });
    expect(short.isSufficient).to.equal(false);
    expect(short.shortfallWei).to.equal(1n);
  });

  it("rejects invalid gas, price, balance and safety margin inputs", function () {
    expect(() => calculateDeploymentCost({ gasUnits: 0n, gasPriceWei: 1n })).to.throw(/gasUnits must be positive/);
    expect(() => calculateDeploymentCost({ gasUnits: 1n, gasPriceWei: 0n })).to.throw(/gasPriceWei must be positive/);
    expect(() => calculateDeploymentCost({ gasUnits: 1n, gasPriceWei: 1n, balanceWei: -1n })).to.throw(/balanceWei cannot be negative/);
    expect(() => calculateDeploymentCost({ gasUnits: 1n, gasPriceWei: 1n, safetyMarginBps: 100001 })).to.throw(/safetyMarginBps/);
  });
});
