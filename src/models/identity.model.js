const db = require('../config/database.config');
const { v4: uuidv4 } = require('uuid');

/**
 * Identity model for PostgreSQL
 */
class Identity {
  /**
   * Create a new identity
   * @param {Object} data - Identity data
   * @returns {Promise<Object>} Created identity
   */
  static async create(data) {
    const { did, address, verifiableCredential } = data;
    
    try {
      const result = await db.query(
        `INSERT INTO identities (did, address, verifiable_credential)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [did, address, JSON.parse(verifiableCredential)]
      );
      
      return result.rows[0];
    } catch (error) {
      console.error('Error creating identity:', error);
      throw error;
    }
  }

  /**
   * Update an identity with token ID
   * @param {string} did - DID to update
   * @param {string} tokenId - Token ID to add
   * @returns {Promise<Object>} Updated identity
   */
  static async updateWithTokenId(did, tokenId) {
    try {
      const result = await db.query(
        `UPDATE identities
         SET token_id = $1, status = 'verified', verified_at = NOW()
         WHERE did = $2
         RETURNING *`,
        [tokenId, did]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Identity not found');
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('Error updating identity with token ID:', error);
      throw error;
    }
  }

  /**
   * Add a chain identity
   * @param {string} tokenId - Token ID
   * @param {string} chainId - Chain ID
   * @param {string} chainAddress - Address on the chain
   * @returns {Promise<Object>} Added chain identity
   */
  static async addChainIdentity(tokenId, chainId, chainAddress) {
    try {
      // First, get the identity ID
      const identityResult = await db.query(
        'SELECT id FROM identities WHERE token_id = $1',
        [tokenId]
      );
      
      if (identityResult.rows.length === 0) {
        throw new Error('Identity not found');
      }
      
      const identityId = identityResult.rows[0].id;
      
      // Check if chain identity already exists
      const existingResult = await db.query(
        'SELECT * FROM chain_identities WHERE identity_id = $1 AND chain_id = $2',
        [identityId, chainId]
      );
      
      if (existingResult.rows.length > 0) {
        // Update existing chain identity
        const updateResult = await db.query(
          `UPDATE chain_identities
           SET chain_address = $1, is_verified = FALSE, verified_at = NULL, verified_by = NULL
           WHERE identity_id = $2 AND chain_id = $3
           RETURNING *`,
          [chainAddress, identityId, chainId]
        );
        
        return updateResult.rows[0];
      } else {
        // Insert new chain identity
        const insertResult = await db.query(
          `INSERT INTO chain_identities (identity_id, chain_id, chain_address)
           VALUES ($1, $2, $3)
           RETURNING *`,
          [identityId, chainId, chainAddress]
        );
        
        return insertResult.rows[0];
      }
    } catch (error) {
      console.error('Error adding chain identity:', error);
      throw error;
    }
  }

  /**
   * Find identity by DID
   * @param {string} did - DID to find
   * @returns {Promise<Object>} Found identity
   */
  static async findByDID(did) {
    try {
      const result = await db.query(
        `SELECT i.*, 
                json_agg(
                  json_build_object(
                    'id', ci.id,
                    'chainId', ci.chain_id,
                    'chainAddress', ci.chain_address,
                    'isVerified', ci.is_verified,
                    'verifiedAt', ci.verified_at,
                    'verifiedBy', ci.verified_by,
                    'createdAt', ci.created_at
                  )
                ) FILTER (WHERE ci.id IS NOT NULL) AS chain_identities
         FROM identities i
         LEFT JOIN chain_identities ci ON i.id = ci.identity_id
         WHERE i.did = $1
         GROUP BY i.id`,
        [did]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      // Format the result
      const identity = result.rows[0];
      
      // If no chain identities found, set to empty array
      if (identity.chain_identities === null) {
        identity.chain_identities = [];
      }
      
      return identity;
    } catch (error) {
      console.error('Error finding identity by DID:', error);
      throw error;
    }
  }

  /**
   * Find identity by token ID
   * @param {string} tokenId - Token ID to find
   * @returns {Promise<Object>} Found identity
   */
  static async findByTokenId(tokenId) {
    try {
      const result = await db.query(
        `SELECT i.*, 
                json_agg(
                  json_build_object(
                    'id', ci.id,
                    'chainId', ci.chain_id,
                    'chainAddress', ci.chain_address,
                    'isVerified', ci.is_verified,
                    'verifiedAt', ci.verified_at,
                    'verifiedBy', ci.verified_by,
                    'createdAt', ci.created_at
                  )
                ) FILTER (WHERE ci.id IS NOT NULL) AS chain_identities
         FROM identities i
         LEFT JOIN chain_identities ci ON i.id = ci.identity_id
         WHERE i.token_id = $1
         GROUP BY i.id`,
        [tokenId]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      // Format the result
      const identity = result.rows[0];
      
      // If no chain identities found, set to empty array
      if (identity.chain_identities === null) {
        identity.chain_identities = [];
      }
      
      return identity;
    } catch (error) {
      console.error('Error finding identity by token ID:', error);
      throw error;
    }
  }

  /**
   * Get all chain identities for a token
   * @param {string} tokenId - Token ID
   * @returns {Promise<Array>} Chain identities
   */
  static async getChainIdentities(tokenId) {
    try {
      // First, get the identity ID
      const identityResult = await db.query(
        'SELECT id FROM identities WHERE token_id = $1',
        [tokenId]
      );
      
      if (identityResult.rows.length === 0) {
        throw new Error('Identity not found');
      }
      
      const identityId = identityResult.rows[0].id;
      
      // Get all chain identities
      const result = await db.query(
        `SELECT id, chain_id AS "chainId", chain_address AS "chainAddress",
                is_verified AS "isVerified", verified_at AS "verifiedAt",
                verified_by AS "verifiedBy", created_at AS "createdAt"
         FROM chain_identities
         WHERE identity_id = $1
         ORDER BY created_at DESC`,
        [identityId]
      );
      
      return result.rows;
    } catch (error) {
      console.error('Error getting chain identities:', error);
      throw error;
    }
  }

  /**
   * Verify a chain identity
   * @param {string} tokenId - Token ID
   * @param {string} chainId - Chain ID
   * @param {string} verifier - Verifier address
   * @returns {Promise<Object>} Updated chain identity
   */
  static async verifyChainIdentity(tokenId, chainId, verifier) {
    try {
      // First, get the identity ID
      const identityResult = await db.query(
        'SELECT id FROM identities WHERE token_id = $1',
        [tokenId]
      );
      
      if (identityResult.rows.length === 0) {
        throw new Error('Identity not found');
      }
      
      const identityId = identityResult.rows[0].id;
      
      // Update chain identity
      const result = await db.query(
        `UPDATE chain_identities
         SET is_verified = TRUE, verified_at = NOW(), verified_by = $1
         WHERE identity_id = $2 AND chain_id = $3
         RETURNING *`,
        [verifier, identityId, chainId]
      );
      
      if (result.rows.length === 0) {
        throw new Error(`Chain identity for chain ${chainId} not found`);
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('Error verifying chain identity:', error);
      throw error;
    }
  }

  /**
   * Verify a chain address
   * @param {string} tokenId - Token ID
   * @param {string} chainId - Chain ID
   * @param {string} chainAddress - Address to verify
   * @returns {Promise<boolean>} Whether the address matches
   */
  static async verifyChainAddress(tokenId, chainId, chainAddress) {
    try {
      // First, get the identity ID
      const identityResult = await db.query(
        'SELECT id FROM identities WHERE token_id = $1',
        [tokenId]
      );
      
      if (identityResult.rows.length === 0) {
        throw new Error('Identity not found');
      }
      
      const identityId = identityResult.rows[0].id;
      
      // Check chain identity
      const result = await db.query(
        `SELECT chain_address FROM chain_identities
         WHERE identity_id = $1 AND chain_id = $2`,
        [identityId, chainId]
      );
      
      if (result.rows.length === 0) {
        return false;
      }
      
      return result.rows[0].chain_address === chainAddress;
    } catch (error) {
      console.error('Error verifying chain address:', error);
      throw error;
    }
  }
}

module.exports = Identity;