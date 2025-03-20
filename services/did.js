const { Pool } = require('pg');
const crypto = require('crypto');
const PolygonService = require('../services/polygon');
require('dotenv').config();

class DIDService {
  constructor(db, redis) {
    this.db = db;
    this.redis = redis;
    
    // If db is not provided, create a pool
    if (!this.db) {
      this.pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'postgres',
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
      });
    }
  }

  /**
   * Get a client from the database connection
   * @returns {Promise<Object>} - Database client
   */
  async getClient() {
    if (this.db) {
      return this.db;
    } else if (this.pool) {
      return this.pool.connect();
    } else {
      throw new Error('No database connection available');
    }
  }

  /**
   * Release a client back to the pool if needed
   * @param {Object} client - Database client
   */
  releaseClient(client) {
    if (this.pool && client && typeof client.release === 'function') {
      client.release();
    }
  }

  /**
   * Generate a new DID
   * @param {string} walletAddress - The wallet address
   * @param {string} chain - The blockchain chain
   * @returns {Promise<Object>} - Generated DID info
   */
  async generateDID(walletAddress, chain = 'polygon') {
    let client;
    try {
      client = await this.getClient();
      
      // Start a transaction
      await client.query('BEGIN');
      
      // Check if wallet already has a DID
      const existingResult = await client.query(
        'SELECT did FROM users WHERE wallet_address = $1',
        [walletAddress]
      );
      
      let did;
      let isNew = false;
      
      if (existingResult.rows.length > 0 && existingResult.rows[0].did) {
        // Use existing DID
        did = existingResult.rows[0].did;
        console.log(`Using existing DID for wallet ${walletAddress}: ${did}`);
      } else {
        // Generate a new DID
        const didMethod = process.env.DID_METHOD || 'did:example';
        const randomBytes = crypto.randomBytes(16).toString('hex');
        const walletHash = crypto.createHash('sha256')
          .update(walletAddress.toLowerCase())
          .digest('hex')
          .slice(0, 16);
        
        did = `${didMethod}:${walletHash}${randomBytes.slice(0, 8)}`;
        isNew = true;
        
        console.log(`Generated new DID for wallet ${walletAddress}: ${did}`);
        
        // Update user record with DID
        await client.query(
          'INSERT INTO users (wallet_address, did) VALUES ($1, $2) ' +
          'ON CONFLICT (wallet_address) DO UPDATE SET did = $2',
          [walletAddress, did]
        );
      }
      
      // Check if there is a did_documents table and create a DID document
      try {
        const tableExists = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public'
            AND table_name = 'did_documents'
          );
        `);
        
        if (tableExists.rows[0].exists) {
          // Create a basic DID document
          const didDocument = {
            '@context': 'https://www.w3.org/ns/did/v1',
            id: did,
            verificationMethod: [{
              id: `${did}#keys-1`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              blockchainAccountId: `eip155:${chain}:${walletAddress}`
            }],
            authentication: [`${did}#keys-1`]
          };
          
          // Insert DID document
          await client.query(
            'INSERT INTO did_documents (did, document) VALUES ($1, $2) ' +
            'ON CONFLICT (did) DO NOTHING',
            [did, didDocument]
          );
        }
      } catch (docError) {
        console.warn('Could not create DID document:', docError.message);
        // Continue with the process, this is not critical
      }
      
      // Generate a token ID for the SBT
      const tokenId = Math.floor(Math.random() * 1000000000) + 1;
      
      // Check if did_to_sbt table exists and create it if needed
      try {
        const tableExists = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public'
            AND table_name = 'did_to_sbt'
          );
        `);
        
        if (!tableExists.rows[0].exists) {
          // Create the table without foreign key constraint
          await client.query(`
            CREATE TABLE did_to_sbt (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              did VARCHAR(255) NOT NULL UNIQUE,
              sbt_token_id BIGINT NOT NULL,
              chain_id VARCHAR(50) NOT NULL DEFAULT 'polygon',
              wallet_address VARCHAR(42),
              created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
            
            CREATE INDEX IF NOT EXISTS idx_did_to_sbt_wallet 
            ON did_to_sbt(wallet_address);
          `);
        }
      } catch (tableError) {
        console.error('Error checking/creating did_to_sbt table:', tableError);
        // This is critical, so we should rethrow
        throw tableError;
      }
      
      // Now mint the SBT
      const polygonService = typeof PolygonService === 'function' 
        ? new PolygonService() 
        : PolygonService;
      
      const mintResult = await polygonService.mintSoulboundNFT(
        walletAddress, 
        did,
        { tokenId: tokenId }
      );
      
      // Extract the token ID from the result
      // Ensure we're handling both object and primitive responses correctly
      const mintedTokenId = typeof mintResult === 'object' && mintResult !== null
        ? (mintResult.tokenId || tokenId)
        : tokenId;
      
      // Store DID to SBT mapping
      await client.query(
        'INSERT INTO did_to_sbt (did, sbt_token_id, chain_id, wallet_address) ' +
        'VALUES ($1, $2, $3, $4) ON CONFLICT (did) DO UPDATE SET ' +
        'sbt_token_id = $2, chain_id = $3, wallet_address = $4',
        [did, Number(mintedTokenId), chain, walletAddress]
      );
      
      // Commit the transaction
      await client.query('COMMIT');
      
      return {
        did,
        sbtTokenId: Number(mintedTokenId),
        isNew,
        transactionHash: mintResult.transactionHash || null
      };
    } catch (error) {
      // Rollback the transaction on error
      if (client) {
        await client.query('ROLLBACK');
      }
      console.error('Failed to generate DID:', error);
      throw error;
    } finally {
      this.releaseClient(client);
    }
  }

  /**
   * Resolve a DID to get its DID document
   * @param {string} did - The DID to resolve
   * @returns {Promise<Object>} - The DID document
   */
  async resolveDID(did) {
    let client;
    try {
      client = await this.getClient();
      
      // Check cache first if redis is available
      if (this.redis) {
        const cached = await this.redis.get(`did:${did}`);
        if (cached) {
          return JSON.parse(cached);
        }
      }
      
      // Query the database
      const result = await client.query(
        'SELECT document FROM did_documents WHERE did = $1',
        [did]
      );
      
      if (result.rows.length === 0) {
        throw new Error('DID not found');
      }
      
      const document = result.rows[0].document;
      
      // Cache the result if redis is available
      if (this.redis) {
        const ttl = process.env.DID_CACHE_TTL || 3600;
        await this.redis.set(`did:${did}`, JSON.stringify(document), 'EX', ttl);
      }
      
      return document;
    } catch (error) {
      console.error('Error resolving DID:', error);
      throw error;
    } finally {
      this.releaseClient(client);
    }
  }
  
  /**
   * Update a DID document
   * @param {string} did - The DID to update
   * @param {Object} updates - The updates to apply
   * @param {string} walletAddress - The wallet address of the updater
   * @returns {Promise<Object>} - The updated DID document
   */
  async updateDIDDocument(did, updates, walletAddress) {
    let client;
    try {
      client = await this.getClient();
      
      // Verify ownership
      const ownerResult = await client.query(
        'SELECT wallet_address FROM users WHERE did = $1',
        [did]
      );
      
      if (ownerResult.rows.length === 0) {
        throw new Error('DID not found');
      }
      
      if (ownerResult.rows[0].wallet_address.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new Error('Not authorized to update this DID');
      }
      
      // Get current document
      const docResult = await client.query(
        'SELECT document FROM did_documents WHERE did = $1',
        [did]
      );
      
      if (docResult.rows.length === 0) {
        throw new Error('DID document not found');
      }
      
      // Apply updates
      const currentDoc = docResult.rows[0].document;
      const updatedDoc = { ...currentDoc, ...updates };
      
      // Ensure id is not changed
      updatedDoc.id = did;
      
      // Update version
      updatedDoc.version = (currentDoc.version || 0) + 1;
      
      // Save updated document
      await client.query(
        'UPDATE did_documents SET document = $1, version = version + 1, updated_at = NOW() WHERE did = $2',
        [updatedDoc, did]
      );
      
      // Invalidate cache if redis is available
      if (this.redis) {
        await this.redis.del(`did:${did}`);
      }
      
      return updatedDoc;
    } catch (error) {
      console.error('Error updating DID document:', error);
      throw error;
    } finally {
      this.releaseClient(client);
    }
  }
  
  /**
   * Add a controller to a DID
   * @param {string} did - The DID to add a controller to
   * @param {string} controllerDid - The controller DID
   * @param {string} walletAddress - The wallet address of the updater
   * @returns {Promise<Object>} - The updated DID document
   */
  async addController(did, controllerDid, walletAddress) {
    let client;
    try {
      client = await this.getClient();
      
      // Verify ownership
      const ownerResult = await client.query(
        'SELECT wallet_address FROM users WHERE did = $1',
        [did]
      );
      
      if (ownerResult.rows.length === 0) {
        throw new Error('DID not found');
      }
      
      if (ownerResult.rows[0].wallet_address.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new Error('Not authorized to update this DID');
      }
      
      // Get current document
      const docResult = await client.query(
        'SELECT document FROM did_documents WHERE did = $1',
        [did]
      );
      
      if (docResult.rows.length === 0) {
        throw new Error('DID document not found');
      }
      
      // Update document to add controller
      const currentDoc = docResult.rows[0].document;
      
      // Add controller to array if it doesn't exist
      if (!currentDoc.controller) {
        currentDoc.controller = [controllerDid];
      } else if (Array.isArray(currentDoc.controller)) {
        if (!currentDoc.controller.includes(controllerDid)) {
          currentDoc.controller.push(controllerDid);
        }
      } else {
        // Convert string to array if needed
        if (currentDoc.controller !== controllerDid) {
          currentDoc.controller = [currentDoc.controller, controllerDid];
        }
      }
      
      // Update version
      currentDoc.version = (currentDoc.version || 0) + 1;
      
      // Save updated document
      await client.query(
        'UPDATE did_documents SET document = $1, version = version + 1, updated_at = NOW() WHERE did = $2',
        [currentDoc, did]
      );
      
      // Invalidate cache if redis is available
      if (this.redis) {
        await this.redis.del(`did:${did}`);
      }
      
      return currentDoc;
    } catch (error) {
      console.error('Error adding controller to DID:', error);
      throw error;
    } finally {
      this.releaseClient(client);
    }
  }
  
  /**
   * Add a chain identity to a DID
   * @param {string} did - The DID
   * @param {string} chain - The chain identifier
   * @param {string} address - The address on that chain
   * @param {string} walletAddress - The wallet address of the updater
   * @returns {Promise<boolean>} - Success status
   */
  async addChainIdentity(did, chain, address, walletAddress) {
    let client;
    try {
      client = await this.getClient();
      
      // Verify ownership
      const ownerResult = await client.query(
        'SELECT wallet_address FROM users WHERE did = $1',
        [did]
      );
      
      if (ownerResult.rows.length === 0) {
        throw new Error('DID not found');
      }
      
      if (ownerResult.rows[0].wallet_address.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new Error('Not authorized to update this DID');
      }
      
      // Add chain identity
      await client.query(
        'INSERT INTO chain_identities (did, chain_id, address) VALUES ($1, $2, $3) ' +
        'ON CONFLICT (did, chain_id) DO UPDATE SET address = $3, is_active = true, updated_at = NOW()',
        [did, chain, address]
      );
      
      // Update DID document
      const docResult = await client.query(
        'SELECT document FROM did_documents WHERE did = $1',
        [did]
      );
      
      if (docResult.rows.length > 0) {
        const doc = docResult.rows[0].document;
        
        // Add or update verificationMethod
        const vmId = `${did}#${chain}-key`;
        const vm = {
          id: vmId,
          type: 'EcdsaSecp256k1RecoveryMethod2020',
          controller: did,
          blockchainAccountId: `eip155:${chain}:${address}`
        };
        
        if (!doc.verificationMethod) {
          doc.verificationMethod = [vm];
        } else {
          // Find and update or add
          const existingIndex = doc.verificationMethod.findIndex(m => m.id === vmId);
          if (existingIndex >= 0) {
            doc.verificationMethod[existingIndex] = vm;
          } else {
            doc.verificationMethod.push(vm);
          }
        }
        
        // Update version
        doc.version = (doc.version || 0) + 1;
        
        // Save updated document
        await client.query(
          'UPDATE did_documents SET document = $1, version = version + 1, updated_at = NOW() WHERE did = $2',
          [doc, did]
        );
        
        // Invalidate cache if redis is available
        if (this.redis) {
          await this.redis.del(`did:${did}`);
        }
      }
      
      // Also update SBT token if possible
      try {
        // Get token ID
        const tokenResult = await client.query(
          'SELECT sbt_token_id FROM did_to_sbt WHERE did = $1',
          [did]
        );
        
        if (tokenResult.rows.length > 0) {
          const tokenId = tokenResult.rows[0].sbt_token_id;
          
          // Get polygon service
          const polygonService = typeof PolygonService === 'function' 
            ? new PolygonService() 
            : PolygonService;
          
          // Call blockchain to update
          await polygonService.addChainIdentity(tokenId, chain, address);
        }
      } catch (blockchainError) {
        console.warn('Error updating blockchain with chain identity:', blockchainError);
        // Continue anyway, database is updated
      }
      
      return true;
    } catch (error) {
      console.error('Error adding chain identity:', error);
      throw error;
    } finally {
      this.releaseClient(client);
    }
  }
}

module.exports = DIDService;