import "dotenv/config";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { configuredGenesisHash, verifyGenesisHashIfConfigured } = require("./network-identity.js");
const hre = (await import("hardhat")).default;
const { ethers } = await hre.network.create();

async function main() {
  const rpcUrl = (process.env.PORTALDOT_RPC_URL || "").trim();
  const chainIdText = (process.env.PORTALDOT_CHAIN_ID || "").trim();
  if (!rpcUrl) {
    throw new Error("Refusing deployment: PORTALDOT_RPC_URL must be explicitly configured to the confirmed PortalDot EVM RPC endpoint.");
  }
  if (!chainIdText || !/^[1-9][0-9]*$/.test(chainIdText)) {
    throw new Error("Refusing deployment: PORTALDOT_CHAIN_ID must be explicitly set to the confirmed positive decimal chain ID.");
  }
  const expectedChainId = BigInt(chainIdText);
  const network = await ethers.provider.getNetwork();

  if (network.chainId !== expectedChainId) {
    throw new Error(`Refusing deployment: expected chain ID ${expectedChainId}, got ${network.chainId}`);
  }
  const expectedGenesisHash = configuredGenesisHash(process.env.PORTALDOT_GENESIS_HASH);
  const actualGenesisHash = await verifyGenesisHashIfConfigured(ethers.provider, expectedGenesisHash);
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
  const contractAddress = await guard.getAddress();
  const runtimeCode = await ethers.provider.getCode(contractAddress);
  if (typeof runtimeCode !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(runtimeCode)) {
    throw new Error("Deployment receipt exists but no runtime bytecode was found at the deployed address.");
  }

  console.log(JSON.stringify({
    network: "Configured EVM RPC (identity not proven by chain ID alone)",
    rpcOrigin: new URL(rpcUrl).origin,
    chainId: network.chainId.toString(),
    genesisHash: actualGenesisHash,
    genesisHashPinConfigured: Boolean(expectedGenesisHash),
    contract: "PortalDotAgentGuard",
    address: contractAddress,
    runtimeCodeHash: ethers.keccak256(runtimeCode),
    deployer: deployerAddress,
    authoritySigner,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    note: "A configured genesis hash adds an optional wrong-network check; without it, this script uses the configured HTTPS endpoint and chain ID. Independently verify transaction and bytecode before claiming live deployment evidence. Local Hardhat output is not live testnet evidence."
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
