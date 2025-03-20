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

  /**
 * Get the provider instance
 * @returns {ethers.Provider} - The provider
 */
getProvider() {
  if (!this.provider) {
    throw new Error('Provider not initialized');
  }
  return this.provider;
}

/**
 * Get the wallet/signer instance
 * @param {ethers.Provider} provider - The provider
 * @returns {ethers.Wallet} - The wallet
 */
getWallet(provider) {
  if (!this.wallet) {
    throw new Error('Wallet not initialized');
  }
  return this.wallet;
}

/**
 * Get the SoulboundNFT contract instance
 * @param {ethers.Provider} provider - The provider
 * @param {ethers.Wallet} signer - The signer
 * @returns {ethers.Contract} - The contract
 */
getSoulboundNFTContract(provider, signer) {
  if (!this.soulboundContract) {
    throw new Error('SoulboundNFT contract not initialized');
  }
  return this.soulboundContract;
}
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


  async mintSoulboundNFT(walletAddress, did, additionalParams = {}) {
    try {
      console.log("Starting Soulbound NFT minting process...");
      console.log(`Target wallet: ${walletAddress}`);
      console.log(`DID: ${did}`);
      
      // Get contract address from environment or config
      const soulboundNFTAddress = 
        process.env.POLYGON_SOULBOUND_ADDRESS || 
        config.polygon.soulboundNFTAddress;
      
      if (!soulboundNFTAddress) {
        throw new Error('Soulbound NFT contract address not configured');
      }
      
      // Initialize provider
      const provider = new ethers.JsonRpcProvider(
        process.env.POLYGON_RPC_URL || config.polygon.rpcUrl
      );
      
      // Initialize wallet with private key
      const wallet = new ethers.Wallet(
        process.env.POLYGON_PRIVATE_KEY || config.polygon.privateKey, 
        provider
      );
      
      // Check wallet balance with more robust checks
      const balance = await provider.getBalance(wallet.address);
      const balanceInEther = ethers.formatEther(balance);
      console.log(`Wallet balance: ${balanceInEther} MATIC`);
      
      const MIN_BALANCE_THRESHOLD = 0.01; // MATIC
      if (parseFloat(balanceInEther) < MIN_BALANCE_THRESHOLD) {
        console.warn(`WARNING: Low wallet balance (${balanceInEther} MATIC)`);
        console.warn(`Minimum recommended balance: ${MIN_BALANCE_THRESHOLD} MATIC`);
      }
      
      // Comprehensive ABI with all potentially useful methods
      const contractAbi = [
        "function verifyIdentity(address entity, string memory did, bytes32 credentialHash, string memory credentialCID, uint256 expirationTime) external",
        "function getTokenIdByDID(string memory did) external view returns (uint256)",
        "function hasRole(bytes32 role, address account) external view returns (bool)",
        "function VERIFIER_ROLE() external view returns (bytes32)"
      ];
      
      // Create contract instance
      const contract = new ethers.Contract(soulboundNFTAddress, contractAbi, wallet);
      
      // Role verification with more robust error handling
      try {
        const VERIFIER_ROLE = await contract.VERIFIER_ROLE();
        const hasVerifierRole = await contract.hasRole(VERIFIER_ROLE, wallet.address);
        
        if (!hasVerifierRole) {
          console.error("ERROR: Wallet does not have VERIFIER_ROLE");
          throw new Error("Insufficient permissions to mint tokens");
        }
      } catch (roleError) {
        console.warn("Could not definitively check roles:", roleError.message);
        // Optionally continue, but log a warning
      }
      
      // Allow overriding of default parameters
      const credentialHash = additionalParams.credentialHash || 
        ethers.keccak256(ethers.toUtf8Bytes(did));
      
      const credentialCID = additionalParams.credentialCID || 
        `ipfs://did-credential-${did.slice(-12)}`;
      
      const expirationTime = additionalParams.expirationTime || 
        Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60); // 1 year from now
      
      // Detailed transaction parameters
      const txParams = {
        gasLimit: additionalParams.gasLimit || 3000000,
        // Optional: add maxPriorityFeePerGas for EIP-1559 transactions
        ...(additionalParams.maxPriorityFeePerGas && {
          maxPriorityFeePerGas: additionalParams.maxPriorityFeePerGas
        })
      };
      
      // Call verifyIdentity with all parameters
      const tx = await contract.verifyIdentity(
        walletAddress,
        did,
        credentialHash,
        credentialCID,
        expirationTime,
        txParams
      );
      
      console.log(`Transaction sent: ${tx.hash}`);
      
      // Wait for confirmation with configurable confirmations
      const confirmations = additionalParams.confirmations || 1;
      const receipt = await tx.wait(confirmations);
      
      console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
      
      // Get and return token ID
      const tokenId = await contract.getTokenIdByDID(did);
      const tokenIdNumber = Number(tokenId);
      
      console.log(`SBT minted with token ID: ${tokenIdNumber}`);
      
      return {
        tokenId: tokenIdNumber,
        transactionHash: tx.hash,
        blockNumber: receipt.blockNumber
      };
      
    } catch (error) {
      console.error('Error minting Soulbound NFT:', error);
      
      // Enhanced error handling with more context
      const errorDetails = {
        message: error.message,
        code: error.code,
        reason: error.reason,
        // Add more context if available
        ...(error.error && { 
          details: error.error.message 
        })
      };
      
      throw new Error(JSON.stringify(errorDetails, null, 2));
    }
  }
  /**
   * Update an SBT token with credential information
   * @param {Number} tokenId - The SBT token ID
   * @param {String} credentialHash - The credential hash
   * @param {Boolean} isValid - Whether the credential is valid
   * @returns {Promise<Object>} - Transaction receipt
   */
  async updateSbtCredential(tokenId, credentialHash, isValid) {
    try {
      // Initialize provider and contract
      const provider = this.getProvider();
      const signer = this.getWallet(provider);
      const soulboundNFTContract = this.getSoulboundNFTContract(provider, signer);

      // Convert string credential hash to bytes32 if needed
      let bytes32Hash = credentialHash;
      if (credentialHash.startsWith('0x') && credentialHash.length === 66) {
        bytes32Hash = credentialHash;
      } else {
        bytes32Hash = ethers.keccak256(ethers.toUtf8Bytes(credentialHash));
      }

      // Call the contract method
      const tx = await soulboundNFTContract.addCredentialToToken(
        tokenId,
        bytes32Hash,
        isValid
      );

      // Wait for the transaction to be confirmed
      const receipt = await tx.wait(1);

      console.log(`Updated SBT #${tokenId} with credential ${credentialHash}, valid: ${isValid}`);
      return receipt;
    } catch (error) {
      console.error('Error updating SBT credential:', error);
      throw new Error(`Failed to update SBT credential: ${error.message}`);
    }
  }

  /**
   * Update the SBT Merkle root with new credential status
   * @param {Number} tokenId - The SBT token ID
   * @param {String} merkleRoot - The new Merkle root
   * @returns {Promise<Object>} - Transaction receipt
   */
  async updateSbtMerkleRoot(tokenId, merkleRoot) {
    try {
      // Initialize provider and contract
      const provider = this.getProvider();
      const signer = this.getWallet(provider);
      const soulboundNFTContract = this.getSoulboundNFTContract(provider, signer);

      // Ensure the merkle root is in the right format
      const bytes32Root = ethers.hexlify(ethers.zeroPad(merkleRoot, 32));

      // Call the contract method
      const tx = await soulboundNFTContract.updateCredentialsMerkleRoot(
        tokenId,
        bytes32Root
      );

      // Wait for the transaction to be confirmed
      const receipt = await tx.wait(1);

      console.log(`Updated SBT #${tokenId} with Merkle root ${merkleRoot}`);
      return receipt;
    } catch (error) {
      console.error('Error updating SBT Merkle root:', error);
      throw new Error(`Failed to update SBT Merkle root: ${error.message}`);
    }
  }
}

// Export as a singleton
module.exports = new PolygonService();