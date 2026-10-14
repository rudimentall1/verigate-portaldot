require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  const expectedChainId = BigInt(process.env.PORTALDOT_CHAIN_ID || "420420777");
  const network = await ethers.provider.getNetwork();

  if (network.chainId !== expectedChainId) {
    throw new Error(`Refusing deployment: expected chain ID ${expectedChainId}, got ${network.chainId}`);
  }
  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    throw new Error("DEPLOYER_PRIVATE_KEY is missing. Put it in an untracked .env file; never commit it.");
  }
  if (!process.env.AUTHORITY_SIGNER_ADDRESS || !ethers.isAddress(process.env.AUTHORITY_SIGNER_ADDRESS)) {
    throw new Error("AUTHORITY_SIGNER_ADDRESS must be the dedicated EVM bridge signer address.");
  }

  const [deployer] = await ethers.getSigners();
  const factory = await ethers.getContractFactory("PortalDotAgentGuard", deployer);
  const guard = await factory.deploy(process.env.AUTHORITY_SIGNER_ADDRESS);
  const tx = guard.deploymentTransaction();
  const receipt = await tx.wait();

  console.log(JSON.stringify({
    network: "PortalDot V3 testnet",
    chainId: network.chainId.toString(),
    contract: "PortalDotAgentGuard",
    address: await guard.getAddress(),
    deployer: await deployer.getAddress(),
    authoritySigner: process.env.AUTHORITY_SIGNER_ADDRESS,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    note: "Save this actual output in evidence/. Do not treat local Hardhat deployments as PortalDot evidence."
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
