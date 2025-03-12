const db = require('../config/database.config');
const { v4: uuidv4 } = require('uuid');

/**
 * Bridge model for PostgreSQL
 */
class BridgeMessage {
  /**
   * Create a new bridge message
   * @param {Object} data - Bridge message data
   * @returns {Promise<Object>} Created bridge message
   */
  static async create(data) {
    const { messageId, sourceChain, targetChain, messageData } = data;
    
    try {
      const result = await db.query(
        `INSERT INTO bridge_messages 
         (message_id, source_chain, target_chain, message_data)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [messageId, sourceChain, targetChain, messageData]
      );
      
      return result.rows[0];
    } catch (error) {
      console.error('Error creating bridge message:', error);
      throw error;
    }
  }

  /**
   * Find bridge message by ID
   * @param {string} messageId - Message ID
   * @returns {Promise<Object>} Found bridge message
   */
  static async findById(messageId) {
    try {
      const result = await db.query(
        `SELECT id, message_id AS "messageId", 
                source_chain AS "sourceChain", target_chain AS "targetChain",
                message_data AS "messageData", status,
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM bridge_messages
         WHERE message_id = $1`,
        [messageId]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('Error finding bridge message:', error);
      throw error;
    }
  }

  /**
   * Find bridge messages by source and target chains
   * @param {string} sourceChain - Source chain ID
   * @param {string} targetChain - Target chain ID
   * @returns {Promise<Array>} Found bridge messages
   */
  static async findByChains(sourceChain, targetChain) {
    try {
      const result = await db.query(
        `SELECT id, message_id AS "messageId", 
                source_chain AS "sourceChain", target_chain AS "targetChain",
                message_data AS "messageData", status,
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM bridge_messages
         WHERE source_chain = $1 AND target_chain = $2
         ORDER BY created_at DESC`,
        [sourceChain, targetChain]
      );
      
      return result.rows;
    } catch (error) {
      console.error('Error finding bridge messages by chains:', error);
      throw error;
    }
  }

  /**
   * Update bridge message status
   * @param {string} messageId - Message ID
   * @param {string} status - New status
   * @returns {Promise<Object>} Updated bridge message
   */
  static async updateStatus(messageId, status) {
    try {
      const result = await db.query(
        `UPDATE bridge_messages
         SET status = $1
         WHERE message_id = $2
         RETURNING *`,
        [status, messageId]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Bridge message not found');
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('Error updating bridge message status:', error);
      throw error;
    }
  }

  /**
   * Get all pending bridge messages for a target chain
   * @param {string} targetChain - Target chain ID
   * @returns {Promise<Array>} Pending bridge messages
   */
  static async getPendingByTargetChain(targetChain) {
    try {
      const result = await db.query(
        `SELECT id, message_id AS "messageId", 
                source_chain AS "sourceChain", target_chain AS "targetChain",
                message_data AS "messageData", status,
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM bridge_messages
         WHERE target_chain = $1 AND status = 'pending'
         ORDER BY created_at ASC`,
        [targetChain]
      );
      
      return result.rows;
    } catch (error) {
      console.error('Error getting pending bridge messages:', error);
      throw error;
    }
  }

  /**
   * Delete a bridge message
   * @param {string} messageId - Message ID to delete
   * @returns {Promise<boolean>} Whether deletion was successful
   */
  static async delete(messageId) {
    try {
      const result = await db.query(
        'DELETE FROM bridge_messages WHERE message_id = $1',
        [messageId]
      );
      
      return result.rowCount > 0;
    } catch (error) {
      console.error('Error deleting bridge message:', error);
      throw error;
    }
  }
}

module.exports = BridgeMessage;