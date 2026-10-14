require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const portalDotChainId = Number(process.env.PORTALDOT_CHAIN_ID || "420420777");

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } }
  },
  networks: {
    hardhat: { chainId: 31337 },
    portaldot: {
      url: process.env.PORTALDOT_RPC_URL || "https://testnetv3-eth-rpc.feso-apps.xyz",
      chainId: portalDotChainId,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : []
    }
  },
  mocha: { timeout: 30000 }
};
