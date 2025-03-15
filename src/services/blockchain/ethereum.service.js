const { ethers } = require('ethers');
const SoulboundNFTArtifact = require('../../contracts/artifacts/identity/SoulboundNFT.json');
const CrossChainBridgeArtifact = require('../../contracts/artifacts/bridge/CrossChainBridge.json');
const config = require('../../config/blockchain.config');

class EthereumService {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.soulboundNFTContract = null;
    this.crossChainBridgeContract = null;
    this.initialize();
  }

  /**
   * Initialize the Ethereum service
   */
  async initialize() {
    try {
      // Set up provider based on environment
      if (process.env.NODE_ENV === 'production') {
        this.provider = new ethers.JsonRpcProvider(config.ethereum.rpcUrl);
      } else {
        this.provider = new ethers.JsonRpcProvider(config.ethereum.testRpcUrl);
      }

      // Set up signer if private key is available
      if (config.ethereum.privateKey && 
        config.ethereum.privateKey !== 'your_private_key_here' &&
        /^0x[0-9a-fA-F]{64}$/.test(config.ethereum.privateKey)) {
      this.signer = new ethers.Wallet(config.ethereum.privateKey, this.provider);
      console.log('Ethereum signer initialized with private key');
    } else {
      console.log('No valid Ethereum private key found, running in read-only mode');
    }
      // Initialize contract instances
      this.initializeContracts();

      console.log('Ethereum service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Ethereum service:', error);
      throw error;
    }
  }

  /**
   * Initialize contract instances
   */
  initializeContracts() {
    // Get contract addresses from config
    const { soulboundNFTAddress, crossChainBridgeAddress } = config.ethereum.contracts;

    // Initialize SoulboundNFT contract
    if (soulboundNFTAddress) {
      this.soulboundNFTContract = new ethers.Contract(
        soulboundNFTAddress,
        SoulboundNFTArtifact.abi,
        this.signer || this.provider
      );
    }

    // Initialize CrossChainBridge contract
    if (crossChainBridgeAddress) {
      this.crossChainBridgeContract = new ethers.Contract(
        crossChainBridgeAddress,
        CrossChainBridgeArtifact.abi,
        this.signer || this.provider
      );
    }
  }

  /**
   * Get the current chain ID
   * @returns {Promise<string>} Chain ID
   */
  async getChainId() {
    const network = await this.provider.getNetwork();
    return network.chainId.toString();
  }

  /**
   * Verify an identity using SoulboundNFT
   * @param {Object} params - Verification parameters
   * @param {string} params.entityAddress - Address to verify
   * @param {string} params.did - Decentralized Identifier
   * @param {string} params.vc - Verifiable Credential
   * @returns {Promise<Object>} Verification result
   */
  async verifyIdentity(params) {
    try {
      const { entityAddress, did, vc } = params;

      // Check if SoulboundNFT contract is initialized
      if (!this.soulboundNFTContract) {
        throw new Error('SoulboundNFT contract not initialized');
      }

      // Execute verification transaction
      const tx = await this.soulboundNFTContract.verifyIdentity(entityAddress, did, vc);
      const receipt = await tx.wait();

      // Parse events to get the token ID
      const event = receipt.events.find(e => e.event === 'IdentityVerified');
      
      if (!event) {
        throw new Error('IdentityVerified event not found');
      }

      const tokenId = event.args.tokenId.toString();

      return {
        success: true,
        tokenId,
        did,
        transactionHash: receipt.transactionHash
      };
    } catch (error) {
      console.error('Error verifying identity:', error);
      throw error;
    }
  }

  /**
   * Add a chain identity for cross-chain operations
   * @param {Object} params - Chain identity parameters
   * @param {string} params.tokenId - SoulboundNFT token ID
   * @param {string} params.chainId - Target chain ID
   * @param {string} params.chainAddress - Address on target chain
   * @returns {Promise<Object>} Result of adding chain identity
   */
  async addChainIdentity(params) {
    try {
      const { tokenId, chainId, chainAddress } = params;

      // Check if SoulboundNFT contract is initialized
      if (!this.soulboundNFTContract) {
        throw new Error('SoulboundNFT contract not initialized');
      }

      // Execute add chain identity transaction
      const tx = await this.soulboundNFTContract.addChainIdentity(tokenId, chainId, chainAddress);
      const receipt = await tx.wait();

      return {
        success: true,
        tokenId,
        chainId,
        chainAddress,
        transactionHash: receipt.transactionHash
      };
    } catch (error) {
      console.error('Error adding chain identity:', error);
      throw error;
    }
  }

  /**
   * Get token information by ID
   * @param {string} tokenId - SoulboundNFT token ID
   * @returns {Promise<Object>} Token information
   */
  async getTokenInfo(tokenId) {
    try {
      // Check if SoulboundNFT contract is initialized
      if (!this.soulboundNFTContract) {
        throw new Error('SoulboundNFT contract not initialized');
      }

      // Get token information
      const did = await this.soulboundNFTContract.getDID(tokenId);
      const vc = await this.soulboundNFTContract.getVerifiableCredential(tokenId);
      const owner = await this.soulboundNFTContract.ownerOf(tokenId);

      return {
        tokenId,
        did,
        vc,
        owner
      };
    } catch (error) {
      console.error('Error getting token info:', error);
      throw error;
    }
  }

  /**
   * Request verification across chains
   * @param {Object} params - Verification parameters
   * @param {string} params.did - Decentralized Identifier
   * @param {string} params.targetChain - Target chain ID
   * @returns {Promise<Object>} Verification request result
   */
  async requestCrossChainVerification(params) {
    try {
      const { did, targetChain } = params;

      // Check if CrossChainBridge contract is initialized
      if (!this.crossChainBridgeContract) {
        throw new Error('CrossChainBridge contract not initialized');
      }

      // Execute verification request transaction
      const tx = await this.crossChainBridgeContract.requestVerification(did, targetChain);
      const receipt = await tx.wait();

      // Parse events to get the request ID
      const event = receipt.events.find(e => e.event === 'VerificationRequested');
      
      if (!event) {
        throw new Error('VerificationRequested event not found');
      }

      const requestId = event.args.requestId.toString();

      return {
        success: true,
        requestId,
        did,
        targetChain,
        transactionHash: receipt.transactionHash
      };
    } catch (error) {
      console.error('Error requesting cross-chain verification:', error);
      throw error;
    }
  }
}

module.exports = new EthereumService();