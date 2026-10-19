import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { expect } = require("chai");
const { ethers } = require("ethers");
const {
  TRANSFER_TYPES,
  validateSignedAuthorization,
  calculateExecutionBudget
} = require("../scripts/execute-authorization-core.js");

describe("Authorized transfer executor input validation", function () {
  const chainId = 420420777n;
  const now = 1_800_000_000;
  const guardAddress = "0x1000000000000000000000000000000000000001";
  const recipient = "0x2000000000000000000000000000000000000002";
  let authority;
  let other;

  beforeEach(function () {
    authority = ethers.Wallet.createRandom();
    other = ethers.Wallet.createRandom();
  });

  async function makeArtifact({
    signedBy = authority,
    reportedAuthority = authority.address,
    contract = guardAddress,
    domainOverrides = {},
    transferOverrides = {},
    topLevelOverrides = {}
  } = {}) {
    const transfer = {
      recipient,
      amount: "1000000",
      nonce: "0",
      deadline: String(now + 120),
      actionId: "0x" + "ab".repeat(32),
      ...transferOverrides
    };
    const domain = {
      name: "PortalDotAgentGuard",
      version: "1",
      chainId: String(chainId),
      verifyingContract: guardAddress,
      ...domainOverrides
    };
    const signature = await signedBy.signTypedData(
      {
        name: domain.name,
        version: domain.version,
        chainId: BigInt(domain.chainId),
        verifyingContract: domain.verifyingContract
      },
      TRANSFER_TYPES,
      {
        recipient: transfer.recipient,
        amount: BigInt(transfer.amount),
        nonce: BigInt(transfer.nonce),
        deadline: BigInt(transfer.deadline),
        actionId: transfer.actionId
      }
    );
    return {
      contract,
      domain,
      transfer,
      signature,
      authoritySigner: reportedAuthority,
      authorizationId: "test-authorization",
      intentId: "test-intent",
      ...topLevelOverrides
    };
  }

  function validate(artifact, overrides = {}) {
    return validateSignedAuthorization(artifact, {
      expectedChainId: chainId.toString(),
      guardAddress,
      authoritySigner: authority.address,
      now,
      ...overrides
    });
  }

  it("accepts a valid short-lived signature and preserves uint256 values as BigInt", async function () {
    const artifact = await makeArtifact({
      transferOverrides: {
        amount: "9007199254740993",
        nonce: "18446744073709551616"
      }
    });
    const result = validate(artifact);

    expect(result.recoveredSigner).to.equal(authority.address);
    expect(result.transfer.amount).to.equal(9007199254740993n);
    expect(result.transfer.nonce).to.equal(18446744073709551616n);
    expect(result.transfer.recipient).to.equal(recipient);
    expect(result.transfer.actionId).to.equal("0x" + "ab".repeat(32));
  });

  it("rejects a different configured chain before trying to submit", async function () {
    const artifact = await makeArtifact();
    expect(() => validate(artifact, { expectedChainId: "420420418" }))
      .to.throw(/EIP-712 chain ID does not match the configured network/);
  });

  it("rejects a different guard address in the signed domain", async function () {
    const artifact = await makeArtifact({
      domainOverrides: { verifyingContract: "0x3000000000000000000000000000000000000003" }
    });
    expect(() => validate(artifact)).to.throw(/contract does not match/);
  });

  it("rejects a signature from a key other than the configured authority", async function () {
    const artifact = await makeArtifact({ signedBy: other });
    expect(() => validate(artifact)).to.throw(/not produced by AUTHORITY_SIGNER_ADDRESS/);
  });

  it("rejects transfer tampering after the authority signature was created", async function () {
    const artifact = await makeArtifact();
    artifact.transfer.amount = "1000001";
    expect(() => validate(artifact)).to.throw(/not produced by AUTHORITY_SIGNER_ADDRESS/);
  });

  it("rejects a non-canonical or unsafe numeric amount", async function () {
    for (const amount of [1000000, "01", "+1", " 1", "-1", "1e6"]) {
      const artifact = await makeArtifact({ transferOverrides: { amount: "1000000" } });
      artifact.transfer.amount = amount;
      expect(() => validate(artifact)).to.throw(/canonical unsigned decimal/);
    }
  });

  it("rejects uint256 overflow and zero transfer values", async function () {
    const overflow = await makeArtifact();
    overflow.transfer.amount = (1n << 256n).toString();
    expect(() => validate(overflow)).to.throw(/uint256 limit/);

    const zero = await makeArtifact({ transferOverrides: { amount: "0" } });
    expect(() => validate(zero)).to.throw(/greater than zero/);
  });

  it("rejects zero recipient and the guard as recipient", async function () {
    const zero = await makeArtifact({
      transferOverrides: { recipient: ethers.ZeroAddress }
    });
    expect(() => validate(zero)).to.throw(/recipient must be non-zero/);

    const self = await makeArtifact({
      transferOverrides: { recipient: guardAddress }
    });
    expect(() => validate(self)).to.throw(/recipient must be non-zero/);
  });

  it("rejects expired and overlong authorizations", async function () {
    const expired = await makeArtifact({
      transferOverrides: { deadline: String(now) }
    });
    expect(() => validate(expired)).to.throw(/has expired/);

    const overlong = await makeArtifact({
      transferOverrides: { deadline: String(now + 301) }
    });
    expect(() => validate(overlong)).to.throw(/more than five minutes/);
  });

  it("rejects an incorrectly encoded signature", async function () {
    const artifact = await makeArtifact();
    artifact.signature = "0x1234";
    expect(() => validate(artifact)).to.throw(/exactly 65 bytes/);
  });

  it("requires the signed contract and reported authority to match configuration", async function () {
    const wrongContract = await makeArtifact({
      contract: "0x3000000000000000000000000000000000000003"
    });
    expect(() => validate(wrongContract)).to.throw(/contract does not match/);

    const wrongReportedAuthority = await makeArtifact({ reportedAuthority: other.address });
    expect(() => validate(wrongReportedAuthority)).to.throw(/does not match AUTHORITY_SIGNER_ADDRESS/);
  });

  it("calculates a 20 percent fee margin exactly without floating point", function () {
    const enough = calculateExecutionBudget({
      gasUnits: 1000000n,
      gasPriceWei: 10n,
      relayerBalanceWei: 12000000n
    });
    expect(enough.estimatedCostWei).to.equal(10000000n);
    expect(enough.costWithMarginWei).to.equal(12000000n);
    expect(enough.isSufficient).to.equal(true);
    expect(enough.shortfallWei).to.equal(0n);

    const short = calculateExecutionBudget({
      gasUnits: 1000000n,
      gasPriceWei: 10n,
      relayerBalanceWei: 11999999n
    });
    expect(short.isSufficient).to.equal(false);
    expect(short.shortfallWei).to.equal(1n);
  });

  it("rejects invalid execution-budget parameters", function () {
    expect(() => calculateExecutionBudget({
      gasUnits: 0n, gasPriceWei: 1n, relayerBalanceWei: 1n
    })).to.throw(/gas estimate must be positive/);
    expect(() => calculateExecutionBudget({
      gasUnits: 1n, gasPriceWei: -1n, relayerBalanceWei: 1n
    })).to.throw(/Gas price cannot be negative/);
    expect(() => calculateExecutionBudget({
      gasUnits: 1n, gasPriceWei: 1n, relayerBalanceWei: -1n
    })).to.throw(/Relayer balance cannot be negative/);
  });
});
