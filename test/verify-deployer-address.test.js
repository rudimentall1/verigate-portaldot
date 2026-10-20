import { createRequire } from "node:module";
import { ethers } from "ethers";
import { inspectDeployerIdentity, redactDeployerIdentityResult } from "../scripts/verify-deployer-address.mjs";

const require = createRequire(import.meta.url);
const { expect } = require("chai");
const deployerKey = `0x${"11".repeat(32)}`;
const otherKey = `0x${"22".repeat(32)}`;
const deployerAddress = new ethers.Wallet(deployerKey).address;
const otherAddress = new ethers.Wallet(otherKey).address;

describe("Local deployer identity check", function () {
  it("matches the supplied wallet address without exposing the private key", function () {
    const result = inspectDeployerIdentity({
      expectedAddress: deployerAddress,
      privateKey: deployerKey,
      deploymentEstimateFrom: deployerAddress,
      authoritySignerAddress: otherAddress
    });
    expect(result.status).to.equal("identity_matches");
    expect(result.matchesExpectedAddress).to.equal(true);
    expect(result.deploymentEstimateFromMatches).to.equal(true);
    expect(result.authoritySignerIsDistinct).to.equal(true);
    expect(JSON.stringify(result)).not.to.include(deployerKey);
  });

  it("reports a wallet-address mismatch without pretending the mapping was verified", function () {
    const result = inspectDeployerIdentity({
      expectedAddress: otherAddress,
      privateKey: deployerKey
    });
    expect(result.status).to.equal("configuration_mismatch");
    expect(result.matchesExpectedAddress).to.equal(false);
    expect(result.blockers.some((item) => item.includes("different address"))).to.equal(true);
  });

  it("rejects a configured estimate address that differs from the local key", function () {
    const result = inspectDeployerIdentity({
      expectedAddress: deployerAddress,
      privateKey: deployerKey,
      deploymentEstimateFrom: otherAddress
    });
    expect(result.configurationConsistent).to.equal(false);
    expect(result.deploymentEstimateFromMatches).to.equal(false);
  });

  it("requires a configured authority signer to be non-zero and distinct", function () {
    const sameAddress = inspectDeployerIdentity({
      expectedAddress: deployerAddress,
      privateKey: deployerKey,
      authoritySignerAddress: deployerAddress
    });
    expect(sameAddress.authoritySignerIsDistinct).to.equal(false);
    expect(sameAddress.configurationConsistent).to.equal(false);

    const zeroSigner = inspectDeployerIdentity({
      expectedAddress: deployerAddress,
      privateKey: deployerKey,
      authoritySignerAddress: ethers.ZeroAddress
    });
    expect(zeroSigner.authoritySignerIsNonZero).to.equal(false);
    expect(zeroSigner.configurationConsistent).to.equal(false);
  });

  it("rejects invalid addresses, missing keys, and invalid private keys safely", function () {
    expect(() => inspectDeployerIdentity({
      expectedAddress: "not-an-address",
      privateKey: deployerKey
    })).to.throw(/valid EVM address/);
    expect(() => inspectDeployerIdentity({
      expectedAddress: deployerAddress,
      privateKey: ""
    })).to.throw(/DEPLOYER_PRIVATE_KEY is not configured/);
    expect(() => inspectDeployerIdentity({
      expectedAddress: deployerAddress,
      privateKey: "not-a-key"
    })).to.throw(/not a valid EVM private key/);
  });

  it("supports redacted reports that retain comparison results", function () {
    const result = inspectDeployerIdentity({
      expectedAddress: deployerAddress,
      privateKey: deployerKey,
      deploymentEstimateFrom: deployerAddress,
      authoritySignerAddress: otherAddress
    });
    const redacted = redactDeployerIdentityResult(result);
    expect(redacted.expectedAddress).to.equal("[redacted]");
    expect(redacted.deployerAddress).to.equal("[redacted]");
    expect(redacted.matchesExpectedAddress).to.equal(true);
    expect(JSON.stringify(redacted)).not.to.include(deployerAddress);
    expect(JSON.stringify(redacted)).not.to.include(otherAddress);
  });
});
