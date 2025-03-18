/**
 * User model for interacting with user data
 */
class UserModel {
    constructor(db) {
      this.db = db;
    }
  
    /**
     * Create a new user
     * @param {Object} userData - User data
     * @returns {Promise<Object>} - Created user
     */
    async create(userData) {
      try {
        const { walletAddress, did, nonce } = userData;
  
        const query = `
          INSERT INTO users (wallet_address, did, nonce)
          VALUES ($1, $2, $3)
          RETURNING id, wallet_address, did, created_at
        `;
  
        const result = await this.db.query(query, [
          walletAddress.toLowerCase(),
          did || null,
          nonce || null
        ]);
  
        return result.rows[0];
      } catch (error) {
        console.error('Error creating user:', error);
        throw new Error(`Failed to create user: ${error.message}`);
      }
    }
  
    /**
     * Find a user by ID
     * @param {String} id - User ID
     * @returns {Promise<Object>} - User or null
     */
    async findById(id) {
      try {
        const query = `
          SELECT id, wallet_address, did, created_at, updated_at
          FROM users
          WHERE id = $1
        `;
  
        const result = await this.db.query(query, [id]);
        return result.rows.length > 0 ? result.rows[0] : null;
      } catch (error) {
        console.error('Error finding user by ID:', error);
        throw new Error(`Failed to find user: ${error.message}`);
      }
    }
  
    /**
     * Find a user by wallet address
     * @param {String} walletAddress - Wallet address
     * @returns {Promise<Object>} - User or null
     */
    async findByWalletAddress(walletAddress) {
      try {
        if (!walletAddress) {
          return null;
        }
  
        const query = `
          SELECT id, wallet_address, did, nonce, created_at, updated_at
          FROM users
          WHERE wallet_address = $1
        `;
  
        const result = await this.db.query(query, [walletAddress.toLowerCase()]);
        return result.rows.length > 0 ? result.rows[0] : null;
      } catch (error) {
        console.error('Error finding user by wallet address:', error);
        throw new Error(`Failed to find user: ${error.message}`);
      }
    }
  
    /**
     * Find a user by DID
     * @param {String} did - User's DID
     * @returns {Promise<Object>} - User or null
     */
    async findByDID(did) {
      try {
        if (!did) {
          return null;
        }
  
        const query = `
          SELECT id, wallet_address, did, created_at, updated_at
          FROM users
          WHERE did = $1
        `;
  
        const result = await this.db.query(query, [did]);
        return result.rows.length > 0 ? result.rows[0] : null;
      } catch (error) {
        console.error('Error finding user by DID:', error);
        throw new Error(`Failed to find user: ${error.message}`);
      }
    }
  
    /**
     * Update a user's record
     * @param {String} id - User ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} - Updated user
     */
    async update(id, updates) {
      try {
        const allowedFields = ['did', 'nonce'];
        const fields = Object.keys(updates).filter(field => 
          allowedFields.includes(field) && updates[field] !== undefined
        );
  
        if (fields.length === 0) {
          return await this.findById(id);
        }
  
        let query = `UPDATE users SET updated_at = NOW()`;
        const params = [];
        let paramIndex = 1;
  
        fields.forEach(field => {
          query += `, ${field} = $${paramIndex++}`;
          params.push(updates[field]);
        });
  
        query += ` WHERE id = $${paramIndex++} RETURNING id, wallet_address, did, updated_at`;
        params.push(id);
  
        const result = await this.db.query(query, params);
        
        if (result.rows.length === 0) {
          throw new Error(`User not found: ${id}`);
        }
  
        return result.rows[0];
      } catch (error) {
        console.error('Error updating user:', error);
        throw new Error(`Failed to update user: ${error.message}`);
      }
    }
  
    /**
     * Associate a DID with a user
     * @param {String} id - User ID
     * @param {String} did - DID to associate
     * @returns {Promise<Object>} - Updated user
     */
    async setDID(id, did) {
      try {
        if (!did) {
          throw new Error('DID is required');
        }
  
        const query = `
          UPDATE users
          SET did = $1, updated_at = NOW()
          WHERE id = $2
          RETURNING id, wallet_address, did, updated_at
        `;
  
        const result = await this.db.query(query, [did, id]);
        
        if (result.rows.length === 0) {
          throw new Error(`User not found: ${id}`);
        }
  
        return result.rows[0];
      } catch (error) {
        console.error('Error setting user DID:', error);
        throw new Error(`Failed to set user DID: ${error.message}`);
      }
    }
  
    /**
     * Update a user's authentication nonce
     * @param {String} walletAddress - Wallet address
     * @param {String} nonce - New nonce
     * @returns {Promise<Object>} - Updated user
     */
    async updateNonce(walletAddress, nonce) {
      try {
        if (!walletAddress || !nonce) {
          throw new Error('Wallet address and nonce are required');
        }
  
        const query = `
          UPDATE users
          SET nonce = $1, updated_at = NOW()
          WHERE wallet_address = $2
          RETURNING id, wallet_address, nonce, updated_at
        `;
  
        const result = await this.db.query(query, [nonce, walletAddress.toLowerCase()]);
        
        if (result.rows.length === 0) {
          // User not found, create a new one
          return this.create({ walletAddress, nonce });
        }
  
        return result.rows[0];
      } catch (error) {
        console.error('Error updating nonce:', error);
        throw new Error(`Failed to update nonce: ${error.message}`);
      }
    }
  
    /**
     * Get users with pagination and filtering
     * @param {Object} options - Query options
     * @returns {Promise<Object>} - Paginated users and count
     */
    async getUsers(options = {}) {
      try {
        const { 
          limit = 20, 
          offset = 0, 
          search = null,
          hasDid = null,
          orderBy = 'created_at',
          order = 'DESC'
        } = options;
  
        // Build the query
        let query = `
          SELECT id, wallet_address, did, created_at, updated_at
          FROM users
          WHERE 1=1
        `;
  
        let countQuery = `
          SELECT COUNT(*) as total
          FROM users
          WHERE 1=1
        `;
  
        const params = [];
        let paramIndex = 1;
  
        // Add search condition
        if (search) {
          const searchCondition = ` AND (
            wallet_address ILIKE $${paramIndex} OR
            did ILIKE $${paramIndex}
          )`;
          
          query += searchCondition;
          countQuery += searchCondition;
          
          params.push(`%${search}%`);
          paramIndex++;
        }
  
        // Add DID filter
        if (hasDid !== null) {
          const didCondition = hasDid 
            ? ` AND did IS NOT NULL` 
            : ` AND did IS NULL`;
          
          query += didCondition;
          countQuery += didCondition;
        }
  
        // Add ordering
        const validOrderColumns = ['created_at', 'updated_at', 'wallet_address', 'did'];
        const validOrderDirections = ['ASC', 'DESC'];
        
        const safeOrderBy = validOrderColumns.includes(orderBy) ? orderBy : 'created_at';
        const safeOrder = validOrderDirections.includes(order.toUpperCase()) ? order.toUpperCase() : 'DESC';
        
        query += ` ORDER BY ${safeOrderBy} ${safeOrder}`;
  
        // Add pagination
        query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(limit, offset);
  
        // Execute queries
        const [usersResult, countResult] = await Promise.all([
          this.db.query(query, params),
          this.db.query(countQuery, params.slice(0, paramIndex - 2)) // Remove limit and offset params
        ]);
  
        return {
          users: usersResult.rows,
          total: parseInt(countResult.rows[0].total),
          limit,
          offset
        };
      } catch (error) {
        console.error('Error getting users:', error);
        throw new Error(`Failed to get users: ${error.message}`);
      }
    }
  
    /**
     * Count users
     * @param {Object} criteria - Filter criteria
     * @returns {Promise<Number>} - User count
     */
    async count(criteria = {}) {
      try {
        const { hasDid } = criteria;
  
        let query = `
          SELECT COUNT(*) as count
          FROM users
          WHERE 1=1
        `;
  
        const params = [];
  
        if (hasDid !== undefined) {
          query += hasDid ? ` AND did IS NOT NULL` : ` AND did IS NULL`;
        }
  
        const result = await this.db.query(query, params);
        return parseInt(result.rows[0].count);
      } catch (error) {
        console.error('Error counting users:', error);
        throw new Error(`Failed to count users: ${error.message}`);
      }
    }
  
    /**
     * Get users registered in the last N days
     * @param {Number} days - Number of days
     * @returns {Promise<Array>} - Recent users
     */
    async getRecentUsers(days = 7) {
      try {
        const query = `
          SELECT id, wallet_address, did, created_at
          FROM users
          WHERE created_at >= NOW() - INTERVAL '${days} days'
          ORDER BY created_at DESC
        `;
  
        const result = await this.db.query(query);
        return result.rows;
      } catch (error) {
        console.error('Error getting recent users:', error);
        throw new Error(`Failed to get recent users: ${error.message}`);
      }
    }
  }
  
  module.exports = UserModel;