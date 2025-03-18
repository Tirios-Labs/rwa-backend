/**
 * Role model for interacting with roles and user role assignments
 */
class RoleModel {
    constructor(db) {
      this.db = db;
    }
  
    /**
     * Create a new role
     * @param {String} name - Role name
     * @param {String} description - Role description
     * @returns {Promise<Object>} - Created role
     */
    async create(name, description) {
      try {
        const query = `
          INSERT INTO roles (name, description)
          VALUES ($1, $2)
          RETURNING id, name, description, created_at
        `;
  
        const result = await this.db.query(query, [name, description]);
        return result.rows[0];
      } catch (error) {
        console.error('Error creating role:', error);
        throw new Error(`Failed to create role: ${error.message}`);
      }
    }
  
    /**
     * Find a role by name
     * @param {String} name - Role name
     * @returns {Promise<Object>} - Role or null
     */
    async findByName(name) {
      try {
        const query = `
          SELECT id, name, description, created_at, updated_at
          FROM roles
          WHERE name = $1
        `;
  
        const result = await this.db.query(query, [name]);
        return result.rows.length > 0 ? result.rows[0] : null;
      } catch (error) {
        console.error('Error finding role by name:', error);
        throw new Error(`Failed to find role: ${error.message}`);
      }
    }
  
    /**
     * Find a role by ID
     * @param {String} id - Role ID
     * @returns {Promise<Object>} - Role or null
     */
    async findById(id) {
      try {
        const query = `
          SELECT id, name, description, created_at, updated_at
          FROM roles
          WHERE id = $1
        `;
  
        const result = await this.db.query(query, [id]);
        return result.rows.length > 0 ? result.rows[0] : null;
      } catch (error) {
        console.error('Error finding role by ID:', error);
        throw new Error(`Failed to find role: ${error.message}`);
      }
    }
  
    /**
     * Get all roles
     * @returns {Promise<Array>} - Array of roles
     */
    async getAll() {
      try {
        const query = `
          SELECT id, name, description, created_at, updated_at
          FROM roles
          ORDER BY name
        `;
  
        const result = await this.db.query(query);
        return result.rows;
      } catch (error) {
        console.error('Error getting all roles:', error);
        throw new Error(`Failed to get roles: ${error.message}`);
      }
    }
  
    /**
     * Update a role
     * @param {String} id - Role ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} - Updated role
     */
    async update(id, updates) {
      try {
        const { name, description } = updates;
        
        let query = `UPDATE roles SET updated_at = NOW()`;
        const params = [];
        let paramIndex = 1;
  
        if (name) {
          query += `, name = $${paramIndex++}`;
          params.push(name);
        }
  
        if (description !== undefined) {
          query += `, description = $${paramIndex++}`;
          params.push(description);
        }
  
        query += ` WHERE id = $${paramIndex++} RETURNING id, name, description, updated_at`;
        params.push(id);
  
        const result = await this.db.query(query, params);
        
        if (result.rows.length === 0) {
          throw new Error(`Role not found: ${id}`);
        }
  
        return result.rows[0];
      } catch (error) {
        console.error('Error updating role:', error);
        throw new Error(`Failed to update role: ${error.message}`);
      }
    }
  
    /**
     * Assign a role to a user
     * @param {String} userId - User ID
     * @param {String} roleId - Role ID
     * @param {String} chainId - Chain ID (default: 'global')
     * @returns {Promise<Object>} - Assignment record
     */
    async assignToUser(userId, roleId, chainId = 'global') {
      try {
        const query = `
          INSERT INTO user_roles (user_id, role_id, chain_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id, role_id, chain_id) 
          DO UPDATE SET is_active = true, assigned_at = NOW()
          RETURNING user_id, role_id, chain_id, assigned_at
        `;
  
        const result = await this.db.query(query, [userId, roleId, chainId]);
        return result.rows[0];
      } catch (error) {
        console.error('Error assigning role to user:', error);
        throw new Error(`Failed to assign role: ${error.message}`);
      }
    }
  
    /**
     * Revoke a role from a user
     * @param {String} userId - User ID
     * @param {String} roleId - Role ID
     * @param {String} chainId - Chain ID (optional)
     * @returns {Promise<Boolean>} - Success status
     */
    async revokeFromUser(userId, roleId, chainId = null) {
      try {
        let query = `
          UPDATE user_roles
          SET is_active = false
          WHERE user_id = $1 AND role_id = $2
        `;
  
        const params = [userId, roleId];
        
        if (chainId) {
          query += ` AND chain_id = $3`;
          params.push(chainId);
        }
  
        query += ` RETURNING user_id`;
  
        const result = await this.db.query(query, params);
        return result.rowCount > 0;
      } catch (error) {
        console.error('Error revoking role from user:', error);
        throw new Error(`Failed to revoke role: ${error.message}`);
      }
    }
  
    /**
     * Check if a user has a specific role
     * @param {String} userId - User ID
     * @param {String} roleName - Role name
     * @param {String} chainId - Chain ID (optional)
     * @returns {Promise<Boolean>} - Whether user has the role
     */
    async userHasRole(userId, roleName, chainId = null) {
      try {
        let query = `
          SELECT 1
          FROM user_roles ur
          JOIN roles r ON ur.role_id = r.id
          WHERE ur.user_id = $1 AND r.name = $2 AND ur.is_active = true
        `;
  
        const params = [userId, roleName];
        
        if (chainId) {
          query += ` AND ur.chain_id = $3`;
          params.push(chainId);
        }
  
        const result = await this.db.query(query, params);
        return result.rows.length > 0;
      } catch (error) {
        console.error('Error checking user role:', error);
        return false;
      }
    }
  
    /**
     * Get all roles assigned to a user
     * @param {String} userId - User ID
     * @param {String} chainId - Chain ID (optional)
     * @returns {Promise<Array>} - User's roles
     */
    async getUserRoles(userId, chainId = null) {
      try {
        let query = `
          SELECT r.name, r.description, ur.chain_id, ur.assigned_at
          FROM user_roles ur
          JOIN roles r ON ur.role_id = r.id
          WHERE ur.user_id = $1 AND ur.is_active = true
        `;
  
        const params = [userId];
        
        if (chainId) {
          query += ` AND ur.chain_id = $2`;
          params.push(chainId);
        }
  
        query += ` ORDER BY r.name, ur.chain_id`;
  
        const result = await this.db.query(query, params);
        return result.rows;
      } catch (error) {
        console.error('Error getting user roles:', error);
        throw new Error(`Failed to get user roles: ${error.message}`);
      }
    }
  
    /**
     * Get all users with a specific role
     * @param {String} roleId - Role ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} - Users with the role
     */
    async getUsersWithRole(roleId, options = {}) {
      try {
        const { chainId, limit = 100, offset = 0 } = options;
  
        let query = `
          SELECT u.id, u.wallet_address, u.did, ur.chain_id, ur.assigned_at
          FROM user_roles ur
          JOIN users u ON ur.user_id = u.id
          WHERE ur.role_id = $1 AND ur.is_active = true
        `;
  
        const params = [roleId];
        let paramIndex = 2;
  
        if (chainId) {
          query += ` AND ur.chain_id = $${paramIndex++}`;
          params.push(chainId);
        }
  
        query += ` ORDER BY ur.assigned_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(limit, offset);
  
        const result = await this.db.query(query, params);
        return result.rows;
      } catch (error) {
        console.error('Error getting users with role:', error);
        throw new Error(`Failed to get users with role: ${error.message}`);
      }
    }
  
    /**
     * Initialize default system roles
     * @returns {Promise<Array>} - Created roles
     */
    async initializeDefaultRoles() {
      try {
        const defaultRoles = [
          { name: 'ADMIN', description: 'System administrator with full access' },
          { name: 'VERIFIER', description: 'Can verify identities and credentials' },
          { name: 'CREDENTIAL_ISSUER', description: 'Can issue verifiable credentials' },
          { name: 'BRIDGE_ADMIN', description: 'Can manage cross-chain operations' },
          { name: 'USER', description: 'Standard user role' }
        ];
  
        const createdRoles = [];
  
        for (const role of defaultRoles) {
          const existingRole = await this.findByName(role.name);
          
          if (!existingRole) {
            const created = await this.create(role.name, role.description);
            createdRoles.push(created);
          }
        }
  
        return createdRoles;
      } catch (error) {
        console.error('Error initializing default roles:', error);
        throw new Error(`Failed to initialize default roles: ${error.message}`);
      }
    }
  }
  
  module.exports = RoleModel;