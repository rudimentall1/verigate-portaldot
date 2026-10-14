const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PortalDotAgentGuard", function () {
  const types = {
    TransferAuthorization: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "actionId", type: "bytes32" }
    ]
  };

  let deployer;
  let authority;
  let relayer;
  let recipient;
  let other;
  let guard;
  let chainId;

  async function authorization(overrides = {}) {
    const latest = await ethers.provider.getBlock("latest");
    return {
      recipient: recipient.address,
      amount: ethers.parseEther("1"),
      nonce: 1n,
      deadline: BigInt(latest.timestamp + 300),
      actionId: ethers.keccak256(ethers.toUtf8Bytes("verigate-intent-001")),
      ...overrides
    };
  }

  async function signAuth(signer, auth, signedChainId = chainId) {
    const domain = {
      name: "PortalDotAgentGuard",
      version: "1",
      chainId: signedChainId,
      verifyingContract: await guard.getAddress()
    };
    return signer.signTypedData(domain, types, auth);
  }

  beforeEach(async function () {
    [deployer, authority, relayer, recipient, other] = await ethers.getSigners();
    chainId = (await ethers.provider.getNetwork()).chainId;
    const factory = await ethers.getContractFactory("PortalDotAgentGuard");
    guard = await factory.deploy(authority.address);
    await guard.waitForDeployment();
    await deployer.sendTransaction({
      to: await guard.getAddress(),
      value: ethers.parseEther("5")
    });
  });

  it("executes a valid, exact payment and consumes its nonce", async function () {
    const auth = await authorization();
    const signature = await signAuth(authority, auth);
    const before = await ethers.provider.getBalance(auth.recipient);

    await expect(
      guard.connect(relayer).executeTransfer(
        auth.recipient, auth.amount, auth.nonce, auth.deadline, auth.actionId, signature
      )
    ).to.emit(guard, "TransferExecuted")
      .withArgs(auth.actionId, auth.recipient, auth.amount, auth.nonce);

    expect(await ethers.provider.getBalance(auth.recipient)).to.equal(before + auth.amount);
    expect(await guard.usedNonces(auth.nonce)).to.equal(true);
  });

  it("rejects a changed recipient", async function () {
    const auth = await authorization();
    const signature = await signAuth(authority, auth);
    await expect(
      guard.executeTransfer(other.address, auth.amount, auth.nonce, auth.deadline, auth.actionId, signature)
    ).to.be.revertedWithCustomError(guard, "InvalidAuthoritySignature");
  });

  it("rejects a changed amount", async function () {
    const auth = await authorization();
    const signature = await signAuth(authority, auth);
    await expect(
      guard.executeTransfer(auth.recipient, auth.amount + 1n, auth.nonce, auth.deadline, auth.actionId, signature)
    ).to.be.revertedWithCustomError(guard, "InvalidAuthoritySignature");
  });

  it("rejects a changed action identifier", async function () {
    const auth = await authorization();
    const signature = await signAuth(authority, auth);
    await expect(
      guard.executeTransfer(
        auth.recipient, auth.amount, auth.nonce, auth.deadline,
        ethers.keccak256(ethers.toUtf8Bytes("different-intent")), signature
      )
    ).to.be.revertedWithCustomError(guard, "InvalidAuthoritySignature");
  });

  it("rejects signatures from an untrusted signer", async function () {
    const auth = await authorization();
    const signature = await signAuth(other, auth);
    await expect(
      guard.executeTransfer(auth.recipient, auth.amount, auth.nonce, auth.deadline, auth.actionId, signature)
    ).to.be.revertedWithCustomError(guard, "InvalidAuthoritySignature");
  });

  it("rejects signatures made for a different chain id", async function () {
    const auth = await authorization();
    const signature = await signAuth(authority, auth, chainId + 1n);
    await expect(
      guard.executeTransfer(auth.recipient, auth.amount, auth.nonce, auth.deadline, auth.actionId, signature)
    ).to.be.revertedWithCustomError(guard, "InvalidAuthoritySignature");
  });

  it("rejects expired authorizations", async function () {
    const latest = await ethers.provider.getBlock("latest");
    const auth = await authorization({ deadline: BigInt(latest.timestamp - 1) });
    const signature = await signAuth(authority, auth);
    await expect(
      guard.executeTransfer(auth.recipient, auth.amount, auth.nonce, auth.deadline, auth.actionId, signature)
    ).to.be.revertedWithCustomError(guard, "AuthorizationExpired");
  });

  it("rejects replay of a successfully used nonce", async function () {
    const auth = await authorization();
    const signature = await signAuth(authority, auth);
    const args = [auth.recipient, auth.amount, auth.nonce, auth.deadline, auth.actionId, signature];

    await guard.connect(relayer).executeTransfer(...args);
    await expect(
      guard.connect(other).executeTransfer(...args)
    ).to.be.revertedWithCustomError(guard, "NonceAlreadyUsed").withArgs(auth.nonce);
  });

  it("rejects zero amounts and zero recipients", async function () {
    const auth = await authorization();
    const zeroAmount = { ...auth, amount: 0n };
    const zeroAmountSig = await signAuth(authority, zeroAmount);
    await expect(
      guard.executeTransfer(
        zeroAmount.recipient, zeroAmount.amount, zeroAmount.nonce,
        zeroAmount.deadline, zeroAmount.actionId, zeroAmountSig
      )
    ).to.be.revertedWithCustomError(guard, "InvalidAmount");

    const zeroRecipient = { ...auth, recipient: ethers.ZeroAddress, nonce: 2n };
    const zeroRecipientSig = await signAuth(authority, zeroRecipient);
    await expect(
      guard.executeTransfer(
        zeroRecipient.recipient, zeroRecipient.amount, zeroRecipient.nonce,
        zeroRecipient.deadline, zeroRecipient.actionId, zeroRecipientSig
      )
    ).to.be.revertedWithCustomError(guard, "InvalidRecipient");
  });

  it("rejects malformed signatures", async function () {
    const auth = await authorization();
    await expect(
      guard.executeTransfer(auth.recipient, auth.amount, auth.nonce, auth.deadline, auth.actionId, "0x1234")
    ).to.be.revertedWithCustomError(guard, "InvalidSignature");
  });
});
