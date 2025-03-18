/**
 * DID model for interacting with DID document data
 */
class DIDModel {
    constructor(db) {
      this.db = db;
    }
  
    /**
     * Create a new DID document
     * @param {String} did - The DID
     * @param {Object} document - DID document
     * @param {String} ipfsCid - IPFS CID of the document
     * @returns {Promise<Object>} - Created document record
     */
    async create(did, document, ipfsCid) {
      try {
        const query = `
          INSERT INTO did_documents (did, document, ipfs_cid)
          VALUES ($1, $2, $3)
          RETURNING id, did, ipfs_cid, version, created_at
        `;
  
        const result = await this.db.query(query, [
          did,
          document,
          ipfsCid
        ]);
  
        return result.rows[0];
      } catch (error) {
        console.error('Error creating DID document:', error);
        throw new Error(`Failed to create DID document: ${error.message}`);
      }
    }
  
    /**
     * Find a DID document by DID
     * @param {String} did - The DID to find
     * @returns {Promise<Object>} - DID document or null
     */
    async findByDID(did) {
      try {
        const query = `
          SELECT document, ipfs_cid, version, created_at, updated_at
          FROM did_documents
          WHERE did = $1
          ORDER BY version DESC
          LIMIT 1
        `;
  
        const result = await this.db.query(query, [did]);
        return result.rows.length > 0 ? result.rows[0] : null;
      } catch (error) {
        console.error('Error finding DID document:', error);
        throw new Error(`Failed to find DID document: ${error.message}`);
      }
    }
  
    /**
     * Update a DID document
     * @param {String} did - The DID to update
     * @param {Object} document - Updated DID document
     * @param {String} ipfsCid - New IPFS CID
     * @returns {Promise<Object>} - Updated document record
     */
    async update(did, document, ipfsCid) {
      try {
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
          RETURNING id, did, ipfs_cid, version, created_at
        `;
  
        const result = await this.db.query(query, [
          did,
          document,
          ipfsCid,
          newVersion
        ]);
  
        return result.rows[0];
      } catch (error) {
        console.error('Error updating DID document:', error);
        throw new Error(`Failed to update DID document: ${error.message}`);
      }
    }
  
    /**
     * Get all versions of a DID document
     * @param {String} did - The DID
     * @returns {Promise<Array>} - Array of document versions
     */
    async getVersionHistory(did) {
      try {
        const query = `
          SELECT version, document, ipfs_cid, created_at
          FROM did_documents
          WHERE did = $1
          ORDER BY version DESC
        `;
  
        const result = await this.db.query(query, [did]);
        return result.rows;
      } catch (error) {
        console.error('Error getting DID version history:', error);
        throw new Error(`Failed to get DID version history: ${error.message}`);
      }
    }
  
    /**
     * Get a specific version of a DID document
     * @param {String} did - The DID
     * @param {Number} version - Version number
     * @returns {Promise<Object>} - Document version or null
     */
    async getVersion(did, version) {
      try {
        const query = `
          SELECT document, ipfs_cid, created_at
          FROM did_documents
          WHERE did = $1 AND version = $2
        `;
  
        const result = await this.db.query(query, [did, version]);
        return result.rows.length > 0 ? result.rows[0] : null;
      } catch (error) {
        console.error('Error getting DID document version:', error);
        throw new Error(`Failed to get DID document version: ${error.message}`);
      }
    }
  
    /**
     * Add a chain identity to a DID
     * @param {String} did - The DID
     * @param {String} chainId - Chain identifier
     * @param {String} address - Address on the chain
     * @returns {Promise<Object>} - Added chain identity
     */
    async addChainIdentity(did, chainId, address) {
      try {
        const query = `
          INSERT INTO chain_identities (did, chain_id, address)
          VALUES ($1, $2, $3)
          ON CONFLICT (did, chain_id) DO UPDATE
          SET address = $3, updated_at = NOW(), is_active = true
          RETURNING id, did, chain_id, address, created_at
        `;
  
        const result = await this.db.query(query, [did, chainId, address]);
        return result.rows[0];
      } catch (error) {
        console.error('Error adding chain identity:', error);
        throw new Error(`Failed to add chain identity: ${error.message}`);
      }
    }
  
    /**
     * Get chain identities for a DID
     * @param {String} did - The DID
     * @param {Boolean} activeOnly - Only return active identities
     * @returns {Promise<Array>} - Array of chain identities
     */
    async getChainIdentities(did, activeOnly = true) {
      try {
        let query = `
          SELECT chain_id, address, created_at, updated_at, is_active
          FROM chain_identities
          WHERE did = $1
        `;
  
        const params = [did];
  
        if (activeOnly) {
          query += ` AND is_active = true`;
        }
  
        query += ` ORDER BY chain_id`;
  
        const result = await this.db.query(query, params);
        return result.rows;
      } catch (error) {
        console.error('Error getting chain identities:', error);
        throw new Error(`Failed to get chain identities: ${error.message}`);
      }
    }
  
    /**
     * Deactivate a chain identity
     * @param {String} did - The DID
     * @param {String} chainId - Chain identifier
     * @returns {Promise<Boolean>} - Success flag
     */
    async deactivateChainIdentity(did, chainId) {
      try {
        const query = `
          UPDATE chain_identities
          SET is_active = false, updated_at = NOW()
          WHERE did = $1 AND chain_id = $2
          RETURNING id
        `;
  
        const result = await this.db.query(query, [did, chainId]);
        return result.rowCount > 0;
      } catch (error) {
        console.error('Error deactivating chain identity:', error);
        throw new Error(`Failed to deactivate chain identity: ${error.message}`);
      }
    }
  
    /**
     * Add a controller to a DID
     * @param {String} did - The DID
     * @param {String} controllerDid - Controller DID
     * @returns {Promise<Object>} - Updated document
     */
    async addController(did, controllerDid) {
      try {
        // Get current document
        const currentDoc = await this.findByDID(did);
        
        if (!currentDoc) {
          throw new Error(`DID not found: ${did}`);
        }
  
        // Update the document with the new controller
        const document = currentDoc.document;
        let controllers = document.controller || [];
        
        if (!Array.isArray(controllers)) {
          controllers = [controllers];
        }
  
        if (!controllers.includes(controllerDid)) {
          controllers.push(controllerDid);
          document.controller = controllers;
          document.updated = new Date().toISOString();
        } else {
          // Controller already exists, no change needed
          return document;
        }
  
        // Insert the updated document
        // Note: In a real implementation, we would also update IPFS
        const ipfsCid = currentDoc.ipfs_cid; // Placeholder - should generate new CID
        
        return await this.update(did, document, ipfsCid);
      } catch (error) {
        console.error('Error adding controller:', error);
        throw new Error(`Failed to add controller: ${error.message}`);
      }
    }
  
    /**
     * Remove a controller from a DID
     * @param {String} did - The DID
     * @param {String} controllerDid - Controller DID to remove
     * @returns {Promise<Object>} - Updated document
     */
    async removeController(did, controllerDid) {
      try {
        // Get current document
        const currentDoc = await this.findByDID(did);
        
        if (!currentDoc) {
          throw new Error(`DID not found: ${did}`);
        }
  
        // Update the document to remove controller
        const document = currentDoc.document;
        let controllers = document.controller || [];
        
        if (!Array.isArray(controllers)) {
          controllers = [controllers];
        }
  
        const index = controllers.indexOf(controllerDid);
        if (index !== -1) {
          controllers.splice(index, 1);
          document.controller = controllers.length === 1 ? controllers[0] : controllers;
          document.updated = new Date().toISOString();
        } else {
          // Controller not found, no change needed
          return document;
        }
  
        // Insert the updated document
        // Note: In a real implementation, we would also update IPFS
        const ipfsCid = currentDoc.ipfs_cid; // Placeholder - should generate new CID
        
        return await this.update(did, document, ipfsCid);
      } catch (error) {
        console.error('Error removing controller:', error);
        throw new Error(`Failed to remove controller: ${error.message}`);
      }
    }
  
    /**
     * Check if a DID is controlled by another DID
     * @param {String} did - The target DID
     * @param {String} controllerDid - Potential controller DID
     * @returns {Promise<Boolean>} - Whether controller relationship exists
     */
    async isControlledBy(did, controllerDid) {
      try {
        const document = await this.findByDID(did);
        
        if (!document) {
          return false;
        }
  
        let controllers = document.document.controller || [];
        
        if (!Array.isArray(controllers)) {
          controllers = [controllers];
        }
  
        return controllers.includes(controllerDid);
      } catch (error) {
        console.error('Error checking controller relationship:', error);
        return false;
      }
    }
  }
  
  module.exports = DIDModel;