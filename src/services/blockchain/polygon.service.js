const { ethers } = require('ethers');
const axios = require('axios');
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
      this.provider = new ethers.JsonRpcProvider(config.polygonAmoy.rpcUrl);
 
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
   * Upload a verifiable credential to IPFS via Pinata
   * @param {Object} vc - Verifiable Credential object
   * @returns {Promise<Object>} IPFS upload result with CID and credential hash
   */
  async uploadVcToIpfs(vc) {
    try {
      const url = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
      const response = await axios.post(url, vc, {
        headers: {
          Authorization: `Bearer ${config.pinata.jwt}`,
          "Content-Type": "application/json",
        },
      });
      
      const cid = response.data.IpfsHash;
      const vcString = JSON.stringify(vc);
      const credentialHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(vcString));
      
      return { cid, credentialHash };
    } catch (error) {
      console.error('Error uploading VC to IPFS:', error);
      throw new Error('Failed to upload credential to IPFS');
    }
  }

  /**
   * Fetch a verifiable credential from IPFS
   * @param {string} cid - IPFS CID of the verifiable credential
   * @returns {Promise<Object>} Verifiable Credential object
   */
  async getVcFromIpfs(cid) {
    try {
      const url = `https://gateway.pinata.cloud/ipfs/${cid}`;
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      console.error('Error fetching VC from IPFS:', error);
      throw new Error('Failed to fetch credential from IPFS');
    }
  }

  /**
   * Verify an identity using SoulboundNFT with privacy enhancement
   * @param {Object} params - Verification parameters
   * @param {string} params.entityAddress - Address to verify
   * @param {string} params.did - Decentralized Identifier
   * @param {Object} params.vc - Verifiable Credential object
   * @returns {Promise<Object>} Verification result
   */
  async verifyIdentity(params) {
    try {
      const { entityAddress, did, vc } = params;

      // Check if SoulboundNFT contract is initialized
      if (!this.soulboundNFTContract) {
        throw new Error('SoulboundNFT contract not initialized');
      }

      // Upload VC to IPFS and get CID and hash
      const { cid, credentialHash } = await this.uploadVcToIpfs(vc);

      // Execute verification transaction with hash instead of full VC
      const tx = await this.soulboundNFTContract.verifyIdentity(
        entityAddress, 
        did, 
        credentialHash,
        cid
      );
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
        credentialHash: credentialHash,
        credentialCID: cid,
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