const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const config = require('../../config/blockchain.config');

class SolanaService {
  constructor() {
    this.connection = null;
    this.keypair = null;
    this.programId = null;
    this.initialize();
  }

  /**
   * Initialize the Solana service
   */
  async initialize() {
    try {
      // Check if Solana config exists
      if (!config.solana || !config.solana.rpcUrl) {
        console.log('Solana configuration not found, skipping initialization');
        return;
      }

      // Set up connection
      this.connection = new Connection(config.solana.rpcUrl);

      // Set up keypair if private key is available
      if (config.solana.privateKey) {
        try {
          const secretKey = Buffer.from(config.solana.privateKey, 'base64');
          this.keypair = Keypair.fromSecretKey(secretKey);
        } catch (error) {
          console.error('Error creating Solana keypair:', error);
        }
      }

      // Set program ID
      if (config.solana.programs && config.solana.programs.identityProgram) {
        try {
          this.programId = new PublicKey(config.solana.programs.identityProgram);
        } catch (error) {
          console.error('Error creating Solana program ID:', error);
        }
      }

      console.log('Solana service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Solana service:', error);
      // Don't throw error to allow other services to continue
    }
  }

  /**
   * Get the current network (mainnet or devnet)
   * @returns {string} Network name
   */
  getNetwork() {
    if (!config.solana) return 'unknown';
    return config.solana.isDevnet ? 'devnet' : 'mainnet';
  }

 /**
   * Verify an identity on Solana
   * @param {Object} params - Verification parameters
   * @returns {Promise<Object>} Verification result
   */
 async verifyIdentity(params) {
    try {
      const { entityAddress, did, vc } = params;
      
      // Check if connection and program ID are initialized
      if (!this.connection || !this.programId || !this.keypair) {
        throw new Error('Solana service not fully initialized');
      }
      
      // Implementation would depend on your Solana program
      console.log('Solana verifyIdentity not fully implemented');
      
      return {
        success: true,
        did,
        // Placeholder for proper implementation
        message: 'Solana identity verification is in development'
      };
    } catch (error) {
      console.error('Error verifying identity on Solana:', error);
      throw error;
    }
  }

  /**
   * Add a cross-chain identity link
   * @param {Object} params - Chain identity parameters
   * @returns {Promise<Object>} Result of adding chain identity
   */
  async addChainIdentity(params) {
    try {
      const { tokenId, chainId, chainAddress } = params;
      
      // Check if connection and program ID are initialized
      if (!this.connection || !this.programId || !this.keypair) {
        throw new Error('Solana service not fully initialized');
      }
      
      // Implementation would depend on your Solana program
      console.log('Solana addChainIdentity not fully implemented');
      
      return {
        success: true,
        message: 'Solana chain identity integration is in development'
      };
    } catch (error) {
      console.error('Error adding chain identity on Solana:', error);
      throw error;
    }
  }
}

module.exports = new SolanaService();