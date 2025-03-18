/**
 * Blockchain configuration for the Identity Bridge API
 */
const { ethers } = require('ethers');
const { Connection } = require('@solana/web3.js');
require('dotenv').config();

// Contract ABIs
const MultiChainAccessABI = require('../contracts/abi/MultiChainAccess.json');
const SoulboundNFTABI = require('../contracts/abi/SoulboundNFT.json');
const CrossChainBridgeABI = require('../contracts/abi/CrossChainBridge.json');
const CommodityTokenABI = require('../contracts/abi/CommodityToken.json');

// Network configurations
const networks = {
  // Polygon Amoy testnet
  polygon: {
    name: 'Polygon Amoy',
    chainId: parseInt(process.env.POLYGON_CHAIN_ID) || 80002,
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-amoy.g.alchemy.com/v2/your-api-key',
    explorer: 'https://amoy.polygonscan.com',
    contracts: {
      soulboundNFT: {
        address: process.env.POLYGON_SOULBOUND_ADDRESS || '0x26F28bAEF4813d6768Ce70B7f4b2f4827A5D738D',
        abi: SoulboundNFTABI
      },
      crossChainBridge: {
        address: process.env.POLYGON_BRIDGE_ADDRESS || '0xEDe05747FB7d095d3562e7169B5632A3fBe6e9Bd',
        abi: CrossChainBridgeABI
      },
      commodityToken: {
        // Map of commodity types to token addresses
        tokens: {
          gold: process.env.POLYGON_GOLD_TOKEN_ADDRESS || '0x8415b5f0ae583E8581673427C007c720Aa610706'
        },
        abi: CommodityTokenABI
      }
    }
  },
  
  // Solana devnet
  solana: {
    name: 'Solana Devnet',
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    explorer: 'https://explorer.solana.com/?cluster=devnet',
    programs: {
      identityProgram: {
        id: process.env.SOLANA_IDENTITY_PROGRAM_ID || 'HU18d3qUrvLK52mQ2AoNKEnV6m1B6VreZ8M7eUE5GBew',
        idl: './idl/identity_program.json'
      }
    }
  }
};

// Provider initialization functions
const getPolygonProvider = () => {
  try {
    const provider = new ethers.JsonRpcProvider(networks.polygon.rpcUrl);
    return provider;
  } catch (error) {
    console.error('Error initializing Polygon provider:', error);
    throw new Error(`Failed to initialize Polygon provider: ${error.message}`);
  }
};

const getSolanaConnection = () => {
  try {
    const connection = new Connection(networks.solana.rpcUrl, 'confirmed');
    return connection;
  } catch (error) {
    console.error('Error initializing Solana connection:', error);
    throw new Error(`Failed to initialize Solana connection: ${error.message}`);
  }
};

// Contract initialization functions
const getSoulboundNFTContract = (provider, signerOrProvider = null) => {
  try {
    const contractAddress = networks.polygon.contracts.soulboundNFT.address;
    const contractABI = networks.polygon.contracts.soulboundNFT.abi;
    
    if (signerOrProvider) {
      return new ethers.Contract(contractAddress, contractABI, signerOrProvider);
    } else {
      return new ethers.Contract(contractAddress, contractABI, provider);
    }
  } catch (error) {
    console.error('Error initializing SoulboundNFT contract:', error);
    throw new Error(`Failed to initialize SoulboundNFT contract: ${error.message}`);
  }
};

const getCrossChainBridgeContract = (provider, signerOrProvider = null) => {
  try {
    const contractAddress = networks.polygon.contracts.crossChainBridge.address;
    const contractABI = networks.polygon.contracts.crossChainBridge.abi;
    
    if (signerOrProvider) {
      return new ethers.Contract(contractAddress, contractABI, signerOrProvider);
    } else {
      return new ethers.Contract(contractAddress, contractABI, provider);
    }
  } catch (error) {
    console.error('Error initializing CrossChainBridge contract:', error);
    throw new Error(`Failed to initialize CrossChainBridge contract: ${error.message}`);
  }
};

const getCommodityTokenContract = (provider, tokenType = 'gold', signerOrProvider = null) => {
  try {
    const tokenAddress = networks.polygon.contracts.commodityToken.tokens[tokenType.toLowerCase()];
    
    if (!tokenAddress) {
      throw new Error(`No token address found for commodity type: ${tokenType}`);
    }
    
    const contractABI = networks.polygon.contracts.commodityToken.abi;
    
    if (signerOrProvider) {
      return new ethers.Contract(tokenAddress, contractABI, signerOrProvider);
    } else {
      return new ethers.Contract(tokenAddress, contractABI, provider);
    }
  } catch (error) {
    console.error(`Error initializing CommodityToken contract for ${tokenType}:`, error);
    throw new Error(`Failed to initialize CommodityToken contract: ${error.message}`);
  }
};

// Create wallet with private key (should only be used in secure environments)
const createWallet = (provider) => {
  try {
    const privateKey = process.env.PRIVATE_KEY;
    
    if (!privateKey) {
      throw new Error('PRIVATE_KEY environment variable is not set');
    }
    
    return new ethers.Wallet(privateKey, provider);
  } catch (error) {
    console.error('Error creating wallet:', error);
    throw new Error(`Failed to create wallet: ${error.message}`);
  }
};

module.exports = {
  networks,
  getPolygonProvider,
  getSolanaConnection,
  getSoulboundNFTContract,
  getCrossChainBridgeContract,
  getCommodityTokenContract,
  createWallet
};