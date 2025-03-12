const db = require('../config/database.config');
const { v4: uuidv4 } = require('uuid');

/**
 * Verification model for PostgreSQL
 */
class VerificationRequest {
  /**
   * Create a new verification request
   * @param {Object} data - Verification request data
   * @returns {Promise<Object>} Created verification request
   */
  static async create(data) {
    const { requestId, did, sourceChain, targetChain, transactionHash = null } = data;
    
    try {
      const result = await db.query(
        `INSERT INTO verification_requests 
         (request_id, did, source_chain, target_chain, transaction_hash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [requestId, did, sourceChain, targetChain, transactionHash]
      );
      
      return result.rows[0];
    } catch (error) {
      console.error('Error creating verification request:', error);
      throw error;
    }
  }

  /**
   * Find verification request by ID
   * @param {string} requestId - Request ID
   * @returns {Promise<Object>} Found verification request
   */
  static async findById(requestId) {
    try {
      const result = await db.query(
        `SELECT id, request_id AS "requestId", did,
                source_chain AS "sourceChain", target_chain AS "targetChain",
                status, transaction_hash AS "transactionHash",
                message, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM verification_requests
         WHERE request_id = $1`,
        [requestId]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('Error finding verification request:', error);
      throw error;
    }
  }

  /**
   * Find verification requests by DID
   * @param {string} did - DID
   * @returns {Promise<Array>} Found verification requests
   */
  static async findByDID(did) {
    try {
      const result = await db.query(
        `SELECT id, request_id AS "requestId", did,
                source_chain AS "sourceChain", target_chain AS "targetChain",
                status, transaction_hash AS "transactionHash",
                message, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM verification_requests
         WHERE did = $1
         ORDER BY created_at DESC`,
        [did]
      );
      
      return result.rows;
    } catch (error) {
      console.error('Error finding verification requests by DID:', error);
      throw error;
    }
  }

  /**
   * Update verification request status
   * @param {string} requestId - Request ID
   * @param {string} status - New status
   * @param {Object} message - Optional message data
   * @returns {Promise<Object>} Updated verification request
   */
  static async updateStatus(requestId, status, message = null) {
    try {
      let result;
      
      if (message) {
        result = await db.query(
          `UPDATE verification_requests
           SET status = $1, message = $2
           WHERE request_id = $3
           RETURNING *`,
          [status, message, requestId]
        );
      } else {
        result = await db.query(
          `UPDATE verification_requests
           SET status = $1
           WHERE request_id = $2
           RETURNING *`,
          [status, requestId]
        );
      }
      
      if (result.rows.length === 0) {
        throw new Error('Verification request not found');
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('Error updating verification request status:', error);
      throw error;
    }
  }

  /**
   * Get all pending verification requests
   * @returns {Promise<Array>} Pending verification requests
   */
  static async getPendingRequests() {
    try {
      const result = await db.query(
        `SELECT id, request_id AS "requestId", did,
                source_chain AS "sourceChain", target_chain AS "targetChain",
                status, transaction_hash AS "transactionHash",
                message, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM verification_requests
         WHERE status = 'pending'
         ORDER BY created_at ASC`
      );
      
      return result.rows;
    } catch (error) {
      console.error('Error getting pending verification requests:', error);
      throw error;
    }
  }

  /**
   * Complete a verification request
   * @param {string} requestId - Request ID
   * @param {boolean} isVerified - Verification result
   * @param {Object} message - Optional message data
   * @returns {Promise<Object>} Updated verification request
   */
  static async complete(requestId, isVerified, message = null) {
    try {
      const status = isVerified ? 'completed' : 'failed';
      
      let result;
      
      if (message) {
        result = await db.query(
          `UPDATE verification_requests
           SET status = $1, message = $2
           WHERE request_id = $3
           RETURNING *`,
          [status, message, requestId]
        );
      } else {
        result = await db.query(
          `UPDATE verification_requests
           SET status = $1
           WHERE request_id = $2
           RETURNING *`,
          [status, requestId]
        );
      }
      
      if (result.rows.length === 0) {
        throw new Error('Verification request not found');
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('Error completing verification request:', error);
      throw error;
    }
  }

  /**
   * Delete a verification request
   * @param {string} requestId - Request ID to delete
   * @returns {Promise<boolean>} Whether deletion was successful
   */
  static async delete(requestId) {
    try {
      const result = await db.query(
        'DELETE FROM verification_requests WHERE request_id = $1',
        [requestId]
      );
      
      return result.rowCount > 0;
    } catch (error) {
      console.error('Error deleting verification request:', error);
      throw error;
    }
  }
}

module.exports = VerificationRequest;