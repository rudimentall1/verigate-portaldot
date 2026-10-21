import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { expect } = require("chai");
const hre = (await import("hardhat")).default;
const { ethers } = await hre.network.create();

describe("PortalDotAgentGuardV2", function () {
  const types = {
    TransferAuthorization: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "actionId", type: "bytes32" }
    ]
  };

  let admin, authority, relayer, recipient, other, guard, chainId;
  const maxPerTransfer = ethers.parseEther("2");
  const windowLimit = ethers.parseEther("3");
  const windowSeconds = 3600;

  async function auth(overrides = {}) {
    const block = await ethers.provider.getBlock("latest");
    return {
      recipient: recipient.address,
      amount: ethers.parseEther("1"),
      nonce: 1n,
      deadline: BigInt(block.timestamp + 300),
      actionId: ethers.keccak256(ethers.toUtf8Bytes("v2-test-action")),
      ...overrides
    };
  }

  async function sign(signer, a, signedChainId = chainId) {
    return signer.signTypedData({
      name: "PortalDotAgentGuardV2",
      version: "2",
      chainId: signedChainId,
      verifyingContract: await guard.getAddress()
    }, types, a);
  }

  async function execute(a, signer = authority) {
    const signature = await sign(signer, a);
    return guard.connect(relayer).executeTransfer(
      a.recipient, a.amount, a.nonce, a.deadline, a.actionId, signature
    );
  }

  beforeEach(async function () {
    [admin, authority, relayer, recipient, other] = await ethers.getSigners();
    chainId = (await ethers.provider.getNetwork()).chainId;
    const factory = await ethers.getContractFactory("PortalDotAgentGuardV2");
    guard = await factory.deploy(
      admin.address, authority.address, recipient.address,
      maxPerTransfer, windowLimit, windowSeconds
    );
    await guard.waitForDeployment();
    await admin.sendTransaction({ to: await guard.getAddress(), value: ethers.parseEther("10") });
  });

  it("deploys with separate admin and authority signer", async function () {
    expect(await guard.admin()).to.equal(admin.address);
    expect(await guard.authoritySigner()).to.equal(authority.address);
    expect(await guard.allowedRecipients(recipient.address)).to.equal(true);
  });

  it("rejects zero addresses and identical admin/signer", async function () {
    const factory = await ethers.getContractFactory("PortalDotAgentGuardV2");
    await expect(factory.deploy(ethers.ZeroAddress, authority.address, recipient.address, maxPerTransfer, windowLimit, windowSeconds))
      .to.be.revertedWithCustomError(factory, "ZeroAddress");
    await expect(factory.deploy(admin.address, admin.address, recipient.address, maxPerTransfer, windowLimit, windowSeconds))
      .to.be.revertedWithCustomError(factory, "AdminMustDifferFromSigner");
  });

  it("executes a signed transfer to an allowed recipient and updates window spend", async function () {
    const a = await auth();
    await expect(execute(a)).to.emit(guard, "TransferExecuted").withArgs(a.actionId, a.recipient, a.amount, a.nonce);
    expect(await guard.usedNonces(a.nonce)).to.equal(true);
    expect(await guard.spentInWindow()).to.equal(a.amount);
    expect(await ethers.provider.getBalance(a.recipient)).to.equal(
      ethers.parseEther("10000") + a.amount
    );
  });

  it("rejects a recipient that is not allowlisted", async function () {
    const a = await auth({ recipient: other.address, nonce: 2n });
    await expect(execute(a)).to.be.revertedWithCustomError(guard, "InvalidRecipient");
    expect(await guard.usedNonces(a.nonce)).to.equal(false);
  });

  it("allows only the admin to change the recipient allowlist", async function () {
    await expect(guard.connect(authority).setRecipientAllowed(other.address, true))
      .to.be.revertedWithCustomError(guard, "UnauthorizedAdmin");
    await expect(guard.connect(admin).setRecipientAllowed(other.address, true))
      .to.emit(guard, "RecipientPermissionUpdated").withArgs(other.address, true);
    expect(await guard.allowedRecipients(other.address)).to.equal(true);
  });

  it("allows only the admin to change caps", async function () {
    await expect(guard.connect(authority).setSpendingPolicy(maxPerTransfer, windowLimit, windowSeconds))
      .to.be.revertedWithCustomError(guard, "UnauthorizedAdmin");
    await expect(guard.connect(admin).setSpendingPolicy(
      ethers.parseEther("1"), ethers.parseEther("2"), 1800
    )).to.emit(guard, "SpendingPolicyUpdated")
      .withArgs(ethers.parseEther("1"), ethers.parseEther("2"), 1800);
    expect(await guard.maxPerTransfer()).to.equal(ethers.parseEther("1"));
    expect(await guard.windowLimit()).to.equal(ethers.parseEther("2"));
    expect(await guard.windowSeconds()).to.equal(1800);
    expect(await guard.spentInWindow()).to.equal(0n);
  });

  it("rejects a transfer above maxPerTransfer without consuming its nonce", async function () {
    const a = await auth({ amount: maxPerTransfer + 1n, nonce: 3n });
    await expect(execute(a)).to.be.revertedWithCustomError(guard, "AmountExceedsCap")
      .withArgs(a.amount, maxPerTransfer);
    expect(await guard.usedNonces(a.nonce)).to.equal(false);
  });

  it("rejects spending-window overflow without consuming the nonce", async function () {
    await execute(await auth({ amount: ethers.parseEther("2"), nonce: 4n }));
    const a = await auth({ amount: ethers.parseEther("1.01"), nonce: 5n });
    await expect(execute(a)).to.be.revertedWithCustomError(guard, "WindowLimitExceeded")
      .withArgs(ethers.parseEther("2"), a.amount, windowLimit);
    expect(await guard.usedNonces(a.nonce)).to.equal(false);
    expect(await guard.spentInWindow()).to.equal(ethers.parseEther("2"));
  });

  it("resets window accounting after the configured interval", async function () {
    await execute(await auth({ amount: ethers.parseEther("2"), nonce: 6n }));
    await ethers.provider.send("evm_increaseTime", [windowSeconds + 1]);
    await ethers.provider.send("evm_mine", []);
    await execute(await auth({ amount: ethers.parseEther("2"), nonce: 7n }));
    expect(await guard.spentInWindow()).to.equal(ethers.parseEther("2"));
  });

  it("does not allow the admin to execute without the authority signature", async function () {
    const a = await auth({ nonce: 8n });
    const wrongSignature = await sign(admin, a);
    await expect(guard.connect(admin).executeTransfer(
      a.recipient, a.amount, a.nonce, a.deadline, a.actionId, wrongSignature
    )).to.be.revertedWithCustomError(guard, "InvalidAuthoritySignature");
    expect(await guard.usedNonces(a.nonce)).to.equal(false);
  });

  it("rejects altered signed fields and replay", async function () {
    const a = await auth({ nonce: 9n });
    const signature = await sign(authority, a);
    await expect(guard.connect(relayer).executeTransfer(
      a.recipient, a.amount + 1n, a.nonce, a.deadline, a.actionId, signature
    )).to.be.revertedWithCustomError(guard, "InvalidAuthoritySignature");
    await guard.connect(relayer).executeTransfer(a.recipient, a.amount, a.nonce, a.deadline, a.actionId, signature);
    await expect(guard.connect(other).executeTransfer(
      a.recipient, a.amount, a.nonce, a.deadline, a.actionId, signature
    )).to.be.revertedWithCustomError(guard, "NonceAlreadyUsed").withArgs(a.nonce);
  });

  it("rejects expired and overlong deadlines", async function () {
    const block = await ethers.provider.getBlock("latest");
    const expired = await auth({ nonce: 10n, deadline: BigInt(block.timestamp - 1) });
    await expect(execute(expired)).to.be.revertedWithCustomError(guard, "AuthorizationExpired");
    const tooFar = await auth({ nonce: 11n, deadline: BigInt(block.timestamp + 600) });
    await expect(execute(tooFar)).to.be.revertedWithCustomError(guard, "AuthorizationTooFarInFuture");
  });

  it("rejects zero amount and malformed signature", async function () {
    const zero = await auth({ amount: 0n, nonce: 12n });
    await expect(execute(zero)).to.be.revertedWithCustomError(guard, "InvalidAmount");
    const a = await auth({ nonce: 13n });
    await expect(guard.executeTransfer(a.recipient, a.amount, a.nonce, a.deadline, a.actionId, "0x1234"))
      .to.be.revertedWithCustomError(guard, "InvalidSignature");
  });

  it("blocks a reentrant replay from an allowlisted recipient contract", async function () {
    const recipientFactory = await ethers.getContractFactory("ReentrantRecipient");
    const reentrantRecipient = await recipientFactory.deploy(await guard.getAddress());
    await reentrantRecipient.waitForDeployment();
    const target = await reentrantRecipient.getAddress();
    await guard.connect(admin).setRecipientAllowed(target, true);
    const a = await auth({ recipient: target, nonce: 14n });
    const signature = await sign(authority, a);
    await reentrantRecipient.configure(
      a.recipient, a.amount, a.nonce, a.deadline, a.actionId, signature
    );
    await expect(guard.connect(relayer).executeTransfer(
      a.recipient, a.amount, a.nonce, a.deadline, a.actionId, signature
    )).to.emit(guard, "TransferExecuted").withArgs(a.actionId, a.recipient, a.amount, a.nonce);
    expect(await reentrantRecipient.reentryBlocked()).to.equal(true);
    expect(await guard.usedNonces(a.nonce)).to.equal(true);
    expect(await ethers.provider.getBalance(target)).to.equal(a.amount);
  });

  it("rejects invalid policy settings", async function () {
    await expect(guard.connect(admin).setSpendingPolicy(0, windowLimit, windowSeconds))
      .to.be.revertedWithCustomError(guard, "InvalidPolicy");
    await expect(guard.connect(admin).setSpendingPolicy(maxPerTransfer, maxPerTransfer - 1n, windowSeconds))
      .to.be.revertedWithCustomError(guard, "InvalidPolicy");
    await expect(guard.connect(admin).setSpendingPolicy(maxPerTransfer, windowLimit, 0))
      .to.be.revertedWithCustomError(guard, "InvalidPolicy");
  });
});
