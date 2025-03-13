require('dotenv').config();

module.exports = {
  ethereum: {
    rpcUrl: process.env.ETHEREUM_RPC_URL,
    testRpcUrl: process.env.ETHEREUM_TEST_RPC_URL || process.env.ETHEREUM_RPC_URL,
    chainId: 1,
    testChainId: 11155111, // Sepolia
    privateKey: process.env.ETHEREUM_PRIVATE_KEY,
    contracts: {
      soulboundNFTAddress: process.env.SOULBOUND_NFT_ADDRESS,
      crossChainBridgeAddress: process.env.CROSS_CHAIN_BRIDGE_ADDRESS
    }
  },
  polygon: {
    rpcUrl: process.env.POLYGON_RPC_URL,
    testRpcUrl: process.env.POLYGON_TEST_RPC_URL || process.env.POLYGON_RPC_URL,
    chainId: 137,
    testChainId: 80001, // Mumbai
    privateKey: process.env.POLYGON_PRIVATE_KEY || process.env.ETHEREUM_PRIVATE_KEY,
    contracts: {
      soulboundNFTAddress: process.env.POLYGON_SOULBOUND_NFT_ADDRESS || process.env.SOULBOUND_NFT_ADDRESS,
      crossChainBridgeAddress: process.env.POLYGON_CROSS_CHAIN_BRIDGE_ADDRESS || process.env.CROSS_CHAIN_BRIDGE_ADDRESS
    }
  },
  polygonAmoy: {
    rpcUrl: process.env.POLYGON_RPC_URL || "https://polygon-amoy.g.alchemy.com/v2/0ZMvaBwqV9-86WAO9YpqFyL42495Wbcc",
    chainId: 80002,
    privateKey: process.env.POLYGON_PRIVATE_KEY || process.env.ETHEREUM_PRIVATE_KEY,
    contracts: {
      soulboundNFTAddress: process.env.AMOY_SOULBOUND_NFT_ADDRESS || "0x191f43EbBe836241f00B5F01b9fC845469b5A431",
      crossChainBridgeAddress: process.env.AMOY_CROSS_CHAIN_BRIDGE_ADDRESS || "0x1E45C6Efd10ea6c7A1B6e0E86612a92dA9e4ecaC"
    }
  },
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
    isDevnet: true,
    privateKey: process.env.SOLANA_PRIVATE_KEY,
    programs: {
      identityProgram: process.env.SOLANA_IDENTITY_PROGRAM_ID
    }
  }
};