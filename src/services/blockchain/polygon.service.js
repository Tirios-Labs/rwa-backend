const { ethers } = require('ethers');
const SoulboundNFTArtifact = require('../../contracts/artifacts/identity/SoulboundNFT.json');
const CrossChainBridgeArtifact = require('../../contracts/artifacts/bridge/CrossChainBridge.json');
const config = require('../../config/blockchain.config');

class PolygonAmoyService {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.soulboundNFTContract = null;
    this.crossChainBridgeContract = null;
    this.initialize();
  }

 
async initialize() {
    try {
      // Set up provider
      this.provider = new ethers.providers.JsonRpcProvider(config.polygonAmoy.rpcUrl);
  
      // Set up signer if private key is available and valid
      if (config.polygonAmoy.privateKey && 
          config.polygonAmoy.privateKey !== 'your_private_key_here' &&
          /^0x[0-9a-fA-F]{64}$/.test(config.polygonAmoy.privateKey)) {
        this.signer = new ethers.Wallet(config.polygonAmoy.privateKey, this.provider);
        console.log('Polygon Amoy signer initialized with private key');
      } else {
        console.log('No valid Polygon Amoy private key found, running in read-only mode');
      }
  
      // Initialize contract instances
      this.initializeContracts();
  
      console.log('Polygon Amoy service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Polygon Amoy service:', error);
      // Continue without throwing, so the app can run in read-only mode
      console.log('Polygon Amoy service will run in read-only mode');
    }
  }

  /**
   * Initialize contract instances
   */
  initializeContracts() {
    // Get contract addresses from config
    const { soulboundNFTAddress, crossChainBridgeAddress } = config.polygonAmoy.contracts;

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

  /**
   * Complete a verification request
   * @param {string} requestId - Request ID
   * @param {boolean} verified - Whether the request is verified
   * @returns {Promise<Object>} Completion result
   */
  async completeVerification(requestId, verified) {
    try {
      // Check if CrossChainBridge contract is initialized
      if (!this.crossChainBridgeContract) {
        throw new Error('CrossChainBridge contract not initialized');
      }

      // Execute complete verification transaction
      const tx = await this.crossChainBridgeContract.completeVerification(requestId, verified);
      const receipt = await tx.wait();

      return {
        success: true,
        requestId,
        verified,
        transactionHash: receipt.transactionHash
      };
    } catch (error) {
      console.error('Error completing verification:', error);
      throw error;
    }
  }

  /**
   * Send a cross-chain message
   * @param {Object} params - Message parameters
   * @param {string} params.targetChain - Target chain ID
   * @param {string} params.data - Message data
   * @returns {Promise<Object>} Result of sending message
   */
  async sendCrossChainMessage(params) {
    try {
      const { targetChain, data } = params;

      // Check if CrossChainBridge contract is initialized
      if (!this.crossChainBridgeContract) {
        throw new Error('CrossChainBridge contract not initialized');
      }

      // Convert data to bytes if it's not already
      const messageData = typeof data === 'string' ? 
        ethers.utils.toUtf8Bytes(data) : 
        data;

      // Execute send message transaction
      const tx = await this.crossChainBridgeContract.sendCrossChainMessage(targetChain, messageData);
      const receipt = await tx.wait();

      // Parse events to get the message ID if available
      const event = receipt.events.find(e => e.event === 'CrossChainMessage');
      const messageId = event ? event.args.messageId.toString() : null;

      return {
        success: true,
        messageId,
        targetChain,
        transactionHash: receipt.transactionHash
      };
    } catch (error) {
      console.error('Error sending cross-chain message:', error);
      throw error;
    }
  }
}

module.exports = new PolygonAmoyService();