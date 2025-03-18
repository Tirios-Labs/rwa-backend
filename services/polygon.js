const ethers = require('ethers');
let config;

try {
  // Try to require config
  config = require('../config');
} catch (error) {
  // Create a default config if it doesn't exist
  console.warn('Config file not found, using default config');
  config = {
    polygon: {
      rpcUrl: 'https://polygon-amoy.g.alchemy.com/v2/demo',
      bridgeAddress: '0x0000000000000000000000000000000000000000',
      soulboundNFTAddress: '0x0000000000000000000000000000000000000000'
    }
  };
}

// A safe ABI parser function to handle various formats
function parseABI(input) {
  // If no input, return an empty array
  if (!input) return [];
  
  // If already an array, return it
  if (Array.isArray(input)) return input;
  
  // If it has an 'abi' property, use that
  if (input.abi && Array.isArray(input.abi)) return input.abi;
  
  // Try parsing as a JSON string
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) return parsed;
      if (parsed.abi && Array.isArray(parsed.abi)) return parsed.abi;
    } catch (e) {
      console.error('Failed to parse ABI string:', e);
    }
  }
  
  // If all else fails, return empty array
  console.warn('Could not parse ABI, using empty array');
  return [];
}

// Safer way to load ABIs
let bridgeABI = [];
let soulboundABI = [];

try {
  // Try to load the ABIs from files
  try {
    bridgeABI = require('../contracts/abi/CrossChainBridge.json');
  } catch (error) {
    console.warn('Bridge ABI file not found, trying fallback');
    try {
      // Try fallback location
      bridgeABI = require('../paste-2.txt');
    } catch (err) {
      console.warn('Fallback bridge ABI not found either');
    }
  }
  
  try {
    soulboundABI = require('../contracts/abi/SoulboundNFT.json');
  } catch (error) {
    console.warn('SoulboundNFT ABI file not found, trying fallback');
    try {
      // Try fallback location
      soulboundABI = require('../paste-3.txt');
    } catch (err) {
      console.warn('Fallback soulbound ABI not found either');
    }
  }
  
  // Parse the ABIs properly
  bridgeABI = parseABI(bridgeABI);
  soulboundABI = parseABI(soulboundABI);
  
} catch (error) {
  console.error('Error loading ABIs:', error);
}

class PolygonService {
  constructor() {
    try {
      // Initialize provider
      this.provider = new ethers.JsonRpcProvider(config.polygon.rpcUrl);
      
      // Initialize wallet if private key is provided
      if (config.polygon.privateKey) {
        this.wallet = new ethers.Wallet(config.polygon.privateKey, this.provider);
        console.log(`Polygon wallet initialized: ${this.wallet.address}`);
      } else {
        console.warn('No Polygon private key provided, running in read-only mode');
      }
      
      // Initialize contracts if ABIs are available
      if (bridgeABI.length > 0 && config.polygon.bridgeAddress) {
        try {
          this.bridgeContract = new ethers.Contract(
            config.polygon.bridgeAddress,
            bridgeABI,
            this.wallet || this.provider
          );
          console.log(`Bridge contract initialized at ${config.polygon.bridgeAddress}`);
        } catch (e) {
          console.error('Failed to initialize bridge contract:', e);
        }
      } else {
        console.warn('Bridge contract not initialized due to missing ABI or address');
      }
      
      if (soulboundABI.length > 0 && config.polygon.soulboundNFTAddress) {
        try {
          this.soulboundContract = new ethers.Contract(
            config.polygon.soulboundNFTAddress,
            soulboundABI,
            this.wallet || this.provider
          );
          console.log(`SoulboundNFT contract initialized at ${config.polygon.soulboundNFTAddress}`);
        } catch (e) {
          console.error('Failed to initialize soulbound contract:', e);
        }
      } else {
        console.warn('SoulboundNFT contract not initialized due to missing ABI or address');
      }
    } catch (error) {
      console.error('Error initializing Polygon service:', error);
    }
  }

  /**
   * Resolve a DID on another chain
   * @param {String} did - The DID to resolve
   * @param {String} targetChain - The target chain (e.g., 'solana_devnet')
   * @returns {Promise<String>} - Request ID
   */
  async resolveDID(did, targetChain) {
    try {
      if (!this.wallet) {
        throw new Error('Wallet not initialized');
      }
      
      if (!this.bridgeContract) {
        throw new Error('Bridge contract not initialized');
      }
      
      console.log(`Requesting verification for DID ${did} on chain ${targetChain}`);
      
      const tx = await this.bridgeContract.requestVerification(did, targetChain);
      console.log(`Transaction sent: ${tx.hash}`);
      
      const receipt = await tx.wait();
      console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
      
      // Find the VerificationRequested event
      const event = receipt.events.find(e => e.event === 'VerificationRequested');
      if (!event) {
        throw new Error('Verification request event not found');
      }
      
      return event.args.requestId.toString();
    } catch (error) {
      console.error('Error resolving DID:', error);
      // For development, return a mock request ID
      return `mock-${Date.now()}`;
    }
  }

  /**
   * Get token ID by DID
   * @param {String} did - The DID to look up
   * @returns {Promise<Number>} - Token ID
   */
  async getTokenIdByDID(did) {
    try {
      if (!this.soulboundContract) {
        throw new Error('SoulboundNFT contract not initialized');
      }
      
      const tokenId = await this.soulboundContract.getTokenIdByDID(did);
      return tokenId.toNumber();
    } catch (error) {
      console.error('Error getting token ID:', error);
      return null;
    }
  }

  /**
   * Add a chain identity
   * @param {Number} tokenId - The token ID
   * @param {String} chain - The chain ID
   * @param {String} address - The address on that chain
   * @returns {Promise<Boolean>} - Success status
   */
  async addChainIdentity(tokenId, chain, address) {
    try {
      if (!this.wallet) {
        throw new Error('Wallet not initialized');
      }
      
      if (!this.soulboundContract) {
        throw new Error('SoulboundNFT contract not initialized');
      }
      
      console.log(`Adding chain identity for token ${tokenId} on chain ${chain}: ${address}`);
      
      const tx = await this.soulboundContract.addChainIdentity(tokenId, chain, address);
      await tx.wait();
      
      return true;
    } catch (error) {
      console.error('Error adding chain identity:', error);
      return false;
    }
  }

  /**
   * Get contract addresses and connection status
   * @returns {Object} - Status information
   */
  getStatus() {
    return {
      provider: !!this.provider,
      wallet: !!this.wallet,
      walletAddress: this.wallet ? this.wallet.address : null,
      bridgeContract: !!this.bridgeContract,
      bridgeAddress: config.polygon.bridgeAddress,
      soulboundContract: !!this.soulboundContract,
      soulboundAddress: config.polygon.soulboundNFTAddress,
      bridgeAbiItems: bridgeABI.length,
      soulboundAbiItems: soulboundABI.length
    };
  }
}

// Export as a singleton
module.exports = new PolygonService();