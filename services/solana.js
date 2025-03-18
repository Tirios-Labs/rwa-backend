const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { Program, AnchorProvider, Wallet } = require('@project-serum/anchor');
const bs58 = require('bs58');
let idlFile;

try {
  // Try to load the IDL file
  idlFile = require('../idl/identity_program.json');
} catch (error) {
  // Create a mock IDL if the file is not found
  console.warn('IDL file not found, using mock IDL');
  idlFile = {
    version: "0.1.0",
    name: "identity_program",
    instructions: [],
    accounts: [],
    types: [],
    metadata: {
      address: "HU18d3qUrvLK52mQ2AoNKEnV6m1B6VreZ8M7eUE5GBew"
    }
  };
}

// Load configuration with error handling
let config;
try {
  config = require('../config');
} catch (error) {
  console.warn('Config file not found, using default Solana config');
  config = {
    solana: {
      rpcUrl: 'https://api.devnet.solana.com',
      programId: 'HU18d3qUrvLK52mQ2AoNKEnV6m1B6VreZ8M7eUE5GBew'
    }
  };
}

class SolanaService {
  constructor() {
    // Initialize connection
    this.connection = new Connection(config.solana.rpcUrl, 'confirmed');
    this.programId = new PublicKey(config.solana.programId || idlFile.metadata.address);
    
    // Initialize keypair if available
    if (config.solana.keypair) {
      try {
        const secretKey = bs58.decode(config.solana.keypair);
        this.keypair = Keypair.fromSecretKey(secretKey);
        this.wallet = new Wallet(this.keypair);
        
        // Set up provider and program
        this.provider = new AnchorProvider(
          this.connection,
          this.wallet,
          { commitment: 'confirmed' }
        );
        
        this.program = new Program(idlFile, this.programId, this.provider);
      } catch (err) {
        console.error('Error initializing Solana wallet:', err);
      }
    }
  }

  /**
   * Resolve a DID on Solana
   * @param {String} did - The DID to resolve
   * @param {String} targetChain - The target chain
   * @returns {Promise<String>} - Request ID
   */
  async resolveDID(did, targetChain) {
    try {
      if (!this.wallet) {
        throw new Error('Wallet not initialized');
      }
      
      console.log(`Resolving DID ${did} for chain ${targetChain}`);
      
      // In production, this would call the actual program
      // This is a mock implementation
      const requestId = Math.floor(Math.random() * 1000000).toString();
      
      return requestId;
    } catch (error) {
      console.error('Error resolving DID on Solana:', error);
      throw new Error(`Failed to resolve DID on Solana: ${error.message}`);
    }
  }

  /**
   * Add a chain identity
   * @param {String} did - The DID
   * @param {String} chain - The chain ID
   * @param {String} address - The address on that chain
   * @returns {Promise<Boolean>} - Success status
   */
  async addChainIdentity(did, chain, address) {
    try {
      if (!this.wallet) {
        throw new Error('Wallet not initialized');
      }
      
      console.log(`Adding chain identity for DID ${did} on chain ${chain}: ${address}`);
      
      // Mock implementation
      return true;
    } catch (error) {
      console.error('Error adding chain identity on Solana:', error);
      return false;
    }
  }

  /**
   * Store a credential
   * @param {String} credentialHash - Hash of the credential
   * @param {String} ownerDid - Owner's DID
   * @returns {Promise<Object>} - Credential data
   */
  async storeCredential(credentialHash, ownerDid) {
    try {
      if (!this.wallet) {
        throw new Error('Wallet not initialized');
      }
      
      console.log(`Storing credential for DID ${ownerDid} with hash ${credentialHash}`);
      
      // Mock implementation
      return {
        credentialHash,
        owner: this.wallet.publicKey.toString(),
        isValid: true,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error storing credential on Solana:', error);
      throw new Error(`Failed to store credential: ${error.message}`);
    }
  }

  /**
   * Revoke a credential
   * @param {String} credentialHash - Hash of the credential
   * @returns {Promise<Boolean>} - Success status
   */
  async revokeCredential(credentialHash) {
    try {
      if (!this.wallet) {
        throw new Error('Wallet not initialized');
      }
      
      console.log(`Revoking credential with hash ${credentialHash}`);
      
      // Mock implementation
      return true;
    } catch (error) {
      console.error('Error revoking credential on Solana:', error);
      return false;
    }
  }
}

// Export as a singleton
module.exports = new SolanaService();