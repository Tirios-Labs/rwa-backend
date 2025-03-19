const crypto = require('crypto');
const ethers = require('ethers');
const ipfsService = require('./ipfs');
const polygonService = require('./polygon');
const solanaService = require('./solana');

class DIDService {
  constructor(db, redis) {
    this.db = db;
    this.redis = redis;
    this.prefix = 'did:example:'; // Replace with your actual DID method
  }

/**
 * Generate a new DID with linked SBT token
 * @param {String} walletAddress - The wallet address
 * @param {String} chain - The blockchain (polygon/solana)
 * @returns {Promise<Object>} - The generated DID and SBT info
 */
async generateDID(walletAddress, chain = 'polygon') {
  try {
    const db = this.db;
    
    // Start a database transaction for atomicity
    await db.query('BEGIN');
    
    try {
      // Create a deterministic identifier based on the wallet address
      let didIdentifier;
      
      if (chain === 'polygon') {
        // For Ethereum-based addresses
        const normalizedAddress = walletAddress.toLowerCase();
        didIdentifier = ethers.utils.keccak256(
          ethers.utils.toUtf8Bytes(`${normalizedAddress}:${Date.now()}`)
        ).slice(2, 42); // Take 40 chars of the hash
      } else if (chain === 'solana') {
        // For Solana addresses
        didIdentifier = crypto.createHash('sha256')
          .update(`${walletAddress}:${Date.now()}`)
          .digest('hex').slice(0, 40);
      } else {
        throw new Error(`Unsupported chain: ${chain}`);
      }
      
      const did = `${this.prefix}${didIdentifier}`;
      
      // Create the initial DID document
      const didDocument = this.createDIDDocument(did, walletAddress, chain);
      
      // Store DID document in IPFS
      const cid = await ipfsService.pinDIDDocument(did, didDocument);
      
      // Store in database
      const query = `
        INSERT INTO did_documents (did, document, ipfs_cid)
        VALUES ($1, $2, $3)
        RETURNING id, did, ipfs_cid
      `;
      
      await db.query(query, [did, didDocument, cid]);
      
      // Update user record with DID
      const updateUserQuery = `
        UPDATE users
        SET did = $1, updated_at = NOW()
        WHERE wallet_address = $2
        RETURNING id
      `;
      
      const userResult = await db.query(updateUserQuery, [did, walletAddress]);
      
      let userId;
      if (userResult.rows.length === 0) {
        // User doesn't exist, create it
        const insertUserQuery = `
          INSERT INTO users (wallet_address, did)
          VALUES ($1, $2)
          RETURNING id
        `;
        
        const newUserResult = await db.query(insertUserQuery, [walletAddress, did]);
        userId = newUserResult.rows[0].id;
      } else {
        userId = userResult.rows[0].id;
      }
      
      // Add chain identity mapping
      const chainIdentityQuery = `
        INSERT INTO chain_identities (did, chain_id, address)
        VALUES ($1, $2, $3)
        ON CONFLICT (did, chain_id) DO UPDATE
        SET address = $3, updated_at = NOW()
        RETURNING id
      `;
      
      await db.query(chainIdentityQuery, [did, chain, walletAddress]);
      
      // Mint SBT on the blockchain
      const blockchainService = require(`../services/${chain}`);
      const sbtTokenId = await blockchainService.mintSoulboundNFT(walletAddress, did);
      
      if (!sbtTokenId) {
        // If SBT minting fails, roll back the transaction
        throw new Error('Failed to mint SBT token');
      }
      
      // Create the DID to SBT mapping
      const didToSbtQuery = `
        INSERT INTO did_to_sbt (did, sbt_token_id, chain_id)
        VALUES ($1, $2, $3)
        RETURNING id
      `;
      
      await db.query(didToSbtQuery, [did, sbtTokenId, chain]);
      
      // Commit the transaction
      await db.query('COMMIT');
      
      return {
        did,
        sbtTokenId,
        ipfsCid: cid
      };
    } catch (error) {
      // If anything fails, roll back the transaction
      await db.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error generating DID:', error);
    throw new Error(`Failed to generate DID: ${error.message}`);
  }
}

  /**
   * Create a DID document
   * @param {String} did - The DID
   * @param {String} walletAddress - The wallet address
   * @param {String} chain - The blockchain
   * @returns {Object} - The DID document
   */
  createDIDDocument(did, walletAddress, chain) {
    const timestamp = new Date().toISOString();
    
    // Create verification method ID
    const verificationMethodId = `${did}#keys-1`;
    
    let verificationMethod;
    
    if (chain === 'polygon') {
      verificationMethod = {
        id: verificationMethodId,
        type: 'EcdsaSecp256k1VerificationKey2019',
        controller: did,
        blockchainAccountId: `eip155:80002:${walletAddress}`
      };
    } else if (chain === 'solana') {
      verificationMethod = {
        id: verificationMethodId,
        type: 'Ed25519VerificationKey2018',
        controller: did,
        blockchainAccountId: `solana:${walletAddress}`
      };
    }
    
    return {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1'
      ],
      id: did,
      controller: [did],
      verificationMethod: [verificationMethod],
      authentication: [verificationMethodId],
      assertionMethod: [verificationMethodId],
      service: [
        {
          id: `${did}#identity-service`,
          type: 'IdentityService',
          serviceEndpoint: process.env.IDENTITY_SERVICE_URL || 'https://identity.example.com'
        }
      ],
      created: timestamp,
      updated: timestamp
    };
  }

  /**
   * Resolve a DID to its DID document
   * @param {String} did - The DID to resolve
   * @returns {Promise<Object>} - The DID document
   */
  async resolveDID(did) {
    try {
      // Check cache first
      const cachedDocument = await this.redis.get(`did:${did}`);
      if (cachedDocument) {
        return JSON.parse(cachedDocument);
      }
      
      // Query database
      const query = `
        SELECT document, ipfs_cid 
        FROM did_documents 
        WHERE did = $1
        ORDER BY version DESC
        LIMIT 1
      `;
      
      const result = await this.db.query(query, [did]);
      
      if (result.rows.length > 0) {
        const { document, ipfs_cid } = result.rows[0];
        
        // Cache the result
        await this.redis.set(`did:${did}`, JSON.stringify(document), 'EX', 3600); // 1 hour cache
        
        return document;
      }
      
      // If not found locally, try cross-chain resolution
      // First determine if this is a local or remote DID
      
      // For now, we'll just try both chains
      try {
        // Try to resolve on Polygon
        const polygonResult = await this.resolveRemoteDID(did, 'polygon');
        if (polygonResult) {
          return polygonResult;
        }
        
        // Try to resolve on Solana
        const solanaResult = await this.resolveRemoteDID(did, 'solana');
        if (solanaResult) {
          return solanaResult;
        }
      } catch (chainError) {
        console.error('Error resolving DID across chains:', chainError);
      }
      
      throw new Error(`DID not found: ${did}`);
    } catch (error) {
      console.error('Error resolving DID:', error);
      throw new Error(`Failed to resolve DID: ${error.message}`);
    }
  }

  /**
   * Resolve a DID from a remote chain
   * @param {String} did - The DID to resolve
   * @param {String} chain - The chain to query
   * @returns {Promise<Object>} - The DID document
   */
  async resolveRemoteDID(did, chain) {
    try {
      if (chain === 'polygon') {
        // Use CrossChainBridge contract to initiate DID resolution
        const requestId = await polygonService.resolveDID(did, 'solana_devnet');
        
        // In a real implementation, we would wait for the response
        // For now, we'll just return null
        return null;
      } else if (chain === 'solana') {
        // Similar functionality for Solana
        const requestId = await solanaService.resolveDID(did, 'polygon');
        return null;
      }
      
      return null;
    } catch (error) {
      console.error(`Error resolving DID on ${chain}:`, error);
      return null;
    }
  }

  /**
   * Update a DID document
   * @param {String} did - The DID to update
   * @param {Object} updates - The updates to apply
   * @param {String} walletAddress - The controlling wallet address
   * @returns {Promise<Object>} - The updated DID document
   */
  async updateDIDDocument(did, updates, walletAddress) {
    try {
      // Check if the wallet address controls this DID
      const isController = await this.verifyController(did, walletAddress);
      if (!isController) {
        throw new Error('Not authorized to update this DID');
      }
      
      // Get current document
      const currentDocument = await this.resolveDID(did);
      if (!currentDocument) {
        throw new Error('DID document not found');
      }
      
      // Apply updates
      const updatedDocument = {
        ...currentDocument,
        ...updates,
        updated: new Date().toISOString()
      };
      
      // Pin updated document to IPFS
      const cid = await ipfsService.pinDIDDocument(did, updatedDocument);
      
      // Get current version
      const versionQuery = `
        SELECT MAX(version) as current_version
        FROM did_documents
        WHERE did = $1
      `;
      
      const versionResult = await this.db.query(versionQuery, [did]);
      const currentVersion = versionResult.rows[0]?.current_version || 0;
      const newVersion = currentVersion + 1;
      
      // Insert new version
      const query = `
        INSERT INTO did_documents (did, document, ipfs_cid, version)
        VALUES ($1, $2, $3, $4)
        RETURNING id, did, ipfs_cid, version
      `;
      
      const result = await this.db.query(query, [did, updatedDocument, cid, newVersion]);
      
      // Update cache
      await this.redis.set(`did:${did}`, JSON.stringify(updatedDocument), 'EX', 3600);
      
      return updatedDocument;
    } catch (error) {
      console.error('Error updating DID document:', error);
      throw new Error(`Failed to update DID document: ${error.message}`);
    }
  }

  /**
   * Verify if a wallet address controls a DID
   * @param {String} did - The DID to check
   * @param {String} walletAddress - The wallet address
   * @returns {Promise<Boolean>} - Whether the wallet controls the DID
   */
  async verifyController(did, walletAddress) {
    try {
      // Check if there's a direct wallet association
      const query = `
        SELECT id FROM users
        WHERE did = $1 AND wallet_address = $2
      `;
      
      const result = await this.db.query(query, [did, walletAddress]);
      if (result.rows.length > 0) {
        return true;
      }
      
      // Check if there's a chain identity match
      const chainQuery = `
        SELECT id FROM chain_identities
        WHERE did = $1 AND address = $2 AND is_active = true
      `;
      
      const chainResult = await this.db.query(chainQuery, [did, walletAddress]);
      if (chainResult.rows.length > 0) {
        return true;
      }
      
      // Check if this DID is controlled by another DID that is controlled by this wallet
      const controllerQuery = `
        SELECT c.id FROM did_documents d
        JOIN json_array_elements_text(d.document->'controller') AS controller ON true
        JOIN users u ON u.did = controller::text
        WHERE d.did = $1 AND u.wallet_address = $2
      `;
      
      const controllerResult = await this.db.query(controllerQuery, [did, walletAddress]);
      if (controllerResult.rows.length > 0) {
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error verifying DID controller:', error);
      return false;
    }
  }

  /**
   * Add a controller to a DID
   * @param {String} did - The DID to modify
   * @param {String} controllerDid - The controller DID to add
   * @param {String} walletAddress - The requesting wallet address
   * @returns {Promise<Object>} - The updated DID document
   */
  async addController(did, controllerDid, walletAddress) {
    try {
      // Check if the wallet address controls this DID
      const isController = await this.verifyController(did, walletAddress);
      if (!isController) {
        throw new Error('Not authorized to update this DID');
      }
      
      // Get current document
      const currentDocument = await this.resolveDID(did);
      if (!currentDocument) {
        throw new Error('DID document not found');
      }
      
      // Add controller if not already present
      let controllers = currentDocument.controller || [];
      if (!Array.isArray(controllers)) {
        controllers = [controllers];
      }
      
      if (!controllers.includes(controllerDid)) {
        controllers.push(controllerDid);
      }
      
      // Update the document
      return this.updateDIDDocument(
        did, 
        { controller: controllers },
        walletAddress
      );
    } catch (error) {
      console.error('Error adding DID controller:', error);
      throw new Error(`Failed to add DID controller: ${error.message}`);
    }
  }
  
  /**
   * Add a chain identity to a DID
   * @param {String} did - The DID to modify
   * @param {String} chain - The blockchain
   * @param {String} address - The address on that chain
   * @param {String} walletAddress - The requesting wallet address
   * @returns {Promise<Boolean>} - Success status
   */
  async addChainIdentity(did, chain, address, walletAddress) {
    try {
      // Check if the wallet address controls this DID
      const isController = await this.verifyController(did, walletAddress);
      if (!isController) {
        throw new Error('Not authorized to update this DID');
      }
      
      // Add chain identity mapping
      const query = `
        INSERT INTO chain_identities (did, chain_id, address)
        VALUES ($1, $2, $3)
        ON CONFLICT (did, chain_id) DO UPDATE
        SET address = $3, updated_at = NOW(), is_active = true
        RETURNING id
      `;
      
      await this.db.query(query, [did, chain, address]);
      
      // Update on blockchain
      if (chain === 'polygon') {
        // For Polygon, get the token ID using the DID
        const tokenId = await polygonService.getTokenIdByDID(did);
        if (tokenId) {
          await polygonService.addChainIdentity(tokenId, chain, address);
        }
      } else if (chain === 'solana') {
        // For Solana, similar functionality
        await solanaService.addChainIdentity(did, chain, address);
      }
      
      return true;
    } catch (error) {
      console.error('Error adding chain identity:', error);
      throw new Error(`Failed to add chain identity: ${error.message}`);
    }
  }
}

module.exports = DIDService;