require("dotenv").config();
const { ethers } = require("hardhat");
const { assertPortalDotTestnetChainId } = require("./preflight.js");

async function main() {
  const rpcUrl = (process.env.PORTALDOT_RPC_URL || "").trim();
  const chainIdText = (process.env.PORTALDOT_CHAIN_ID || "").trim();
  if (!rpcUrl) {
    throw new Error("Refusing deployment: PORTALDOT_RPC_URL must be explicitly configured to the confirmed PortalDot EVM RPC endpoint.");
  }
  if (!chainIdText || !/^[1-9][0-9]*$/.test(chainIdText)) {
    throw new Error("Refusing deployment: PORTALDOT_CHAIN_ID must be explicitly set to the confirmed positive decimal chain ID.");
  }
  const expectedChainId = assertPortalDotTestnetChainId(BigInt(chainIdText), "legacy V1 deployment");
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

  const authoritySigner = ethers.getAddress(process.env.AUTHORITY_SIGNER_ADDRESS);
  if (authoritySigner === ethers.ZeroAddress) {
    throw new Error("AUTHORITY_SIGNER_ADDRESS must not be the zero address.");
  }

  const [deployer] = await ethers.getSigners();
  const deployerAddress = ethers.getAddress(await deployer.getAddress());
  if (deployerAddress === authoritySigner) {
    throw new Error(
      "Refusing deployment: deployer and bridge authority signer must be different addresses. Use separate keys."
    );
  }

  const factory = await ethers.getContractFactory("PortalDotAgentGuard", deployer);
  const guard = await factory.deploy(authoritySigner);
  const tx = guard.deploymentTransaction();
  const receipt = await tx.wait();

  console.log(JSON.stringify({
    network: "PortalDot V3 testnet",
    chainId: network.chainId.toString(),
    contract: "PortalDotAgentGuard",
    address: await guard.getAddress(),
    deployer: deployerAddress,
    authoritySigner,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    note: "Save this actual output in evidence/. Do not treat local Hardhat deployments as PortalDot evidence."
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
