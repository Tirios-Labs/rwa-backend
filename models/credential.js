/**
 * Credential model for interacting with credential data
 */
class CredentialModel {
    constructor(db) {
      this.db = db;
    }
  
    /**
     * Create a new credential in the database
     * @param {Object} credentialData - Credential data
     * @returns {Promise<Object>} - Created credential
     */
    async create(credentialData) {
      try {
        const {
          credentialHash,
          issuerDid,
          subjectDid,
          credentialType,
          credentialSchema,
          issuanceDate,
          expirationDate,
          status,
          metadata,
          ipfsCid,
          proof
        } = credentialData;
  
        const query = `
          INSERT INTO credentials (
            credential_hash, issuer_did, subject_did, credential_type,
            credential_schema, issuance_date, expiration_date,
            status, metadata, ipfs_cid, proof
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id, credential_hash, created_at
        `;
  
        const params = [
          credentialHash,
          issuerDid,
          subjectDid,
          credentialType,
          credentialSchema || null,
          issuanceDate ? new Date(issuanceDate) : new Date(),
          expirationDate ? new Date(expirationDate) : null,
          status || 'ACTIVE',
          metadata ? JSON.stringify(metadata) : null,
          ipfsCid,
          proof ? JSON.stringify(proof) : null
        ];
  
        const result = await this.db.query(query, params);
        return result.rows[0];
      } catch (error) {
        console.error('Error creating credential:', error);
        throw new Error(`Failed to create credential: ${error.message}`);
      }
    }
  
    /**
     * Find a credential by its hash
     * @param {String} credentialHash - Hash of the credential
     * @returns {Promise<Object>} - Credential or null
     */
    async findByHash(credentialHash) {
      try {
        const query = `
          SELECT 
            id, credential_hash, issuer_did, subject_did, credential_type,
            credential_schema, issuance_date, expiration_date, revocation_date,
            status, metadata, ipfs_cid, proof, created_at, updated_at
          FROM credentials
          WHERE credential_hash = $1
        `;
  
        const result = await this.db.query(query, [credentialHash]);
        return result.rows.length > 0 ? result.rows[0] : null;
      } catch (error) {
        console.error('Error finding credential by hash:', error);
        throw new Error(`Failed to find credential: ${error.message}`);
      }
    }
  
    /**
     * Get credentials issued by a specific DID
     * @param {String} issuerDid - Issuer's DID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} - Array of credentials
     */
    async findByIssuer(issuerDid, options = {}) {
      try {
        const { status, type, limit = 100, offset = 0 } = options;
  
        let query = `
          SELECT 
            id, credential_hash, subject_did, credential_type,
            credential_schema, issuance_date, expiration_date, revocation_date,
            status, ipfs_cid, created_at
          FROM credentials
          WHERE issuer_did = $1
        `;
  
        const params = [issuerDid];
        let paramIndex = 2;
  
        if (status) {
          query += ` AND status = $${paramIndex++}`;
          params.push(status);
        }
  
        if (type) {
          query += ` AND credential_type = $${paramIndex++}`;
          params.push(type);
        }
  
        query += ` ORDER BY issuance_date DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(limit, offset);
  
        const result = await this.db.query(query, params);
        return result.rows;
      } catch (error) {
        console.error('Error finding credentials by issuer:', error);
        throw new Error(`Failed to find credentials: ${error.message}`);
      }
    }
  
    /**
     * Get credentials owned by a specific DID
     * @param {String} subjectDid - Subject's DID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} - Array of credentials
     */
    async findBySubject(subjectDid, options = {}) {
      try {
        const { status, type, limit = 100, offset = 0 } = options;
  
        let query = `
          SELECT 
            id, credential_hash, issuer_did, credential_type,
            credential_schema, issuance_date, expiration_date, revocation_date,
            status, ipfs_cid, created_at
          FROM credentials
          WHERE subject_did = $1
        `;
  
        const params = [subjectDid];
        let paramIndex = 2;
  
        if (status) {
          query += ` AND status = $${paramIndex++}`;
          params.push(status);
        }
  
        if (type) {
          query += ` AND credential_type = $${paramIndex++}`;
          params.push(type);
        }
  
        query += ` ORDER BY issuance_date DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(limit, offset);
  
        const result = await this.db.query(query, params);
        return result.rows;
      } catch (error) {
        console.error('Error finding credentials by subject:', error);
        throw new Error(`Failed to find credentials: ${error.message}`);
      }
    }
  
    /**
     * Update a credential's status
     * @param {String} credentialHash - Hash of the credential
     * @param {String} status - New status
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} - Updated credential
     */
    async updateStatus(credentialHash, status, options = {}) {
      try {
        const { reason, revocationDate } = options;
  
        let query = `
          UPDATE credentials
          SET 
            status = $1, 
            updated_at = NOW()
        `;
  
        const params = [status];
        let paramIndex = 2;
  
        if (status === 'REVOKED' && revocationDate) {
          query += `, revocation_date = $${paramIndex++}`;
          params.push(new Date(revocationDate));
        } else if (status === 'REVOKED') {
          query += `, revocation_date = NOW()`;
        }
  
        if (reason) {
          query += `, metadata = jsonb_set(coalesce(metadata, '{}'), '{revocation_reason}', $${paramIndex++}::jsonb)`;
          params.push(JSON.stringify(reason));
        }
  
        query += ` WHERE credential_hash = $${paramIndex++} RETURNING id, credential_hash, status, revocation_date`;
        params.push(credentialHash);
  
        const result = await this.db.query(query, params);
        
        if (result.rows.length === 0) {
          throw new Error(`Credential not found: ${credentialHash}`);
        }
  
        return result.rows[0];
      } catch (error) {
        console.error('Error updating credential status:', error);
        throw new Error(`Failed to update credential status: ${error.message}`);
      }
    }
  
    /**
     * Check if a credential is valid
     * @param {String} credentialHash - Hash of the credential
     * @returns {Promise<Object>} - Validation result
     */
    async validateCredential(credentialHash) {
      try {
        const query = `
          SELECT 
            id, credential_hash, issuer_did, subject_did, credential_type,
            issuance_date, expiration_date, revocation_date, status
          FROM credentials
          WHERE credential_hash = $1
        `;
  
        const result = await this.db.query(query, [credentialHash]);
        
        if (result.rows.length === 0) {
          return {
            valid: false,
            status: 'NOT_FOUND',
            reason: 'Credential not found in the registry'
          };
        }
  
        const credential = result.rows[0];
        const now = new Date();
  
        // Check if revoked
        if (credential.status === 'REVOKED') {
          return {
            valid: false,
            status: 'REVOKED',
            reason: 'Credential has been revoked',
            revocationDate: credential.revocation_date
          };
        }
  
        // Check if expired
        if (credential.expiration_date && new Date(credential.expiration_date) < now) {
          return {
            valid: false,
            status: 'EXPIRED',
            reason: 'Credential has expired',
            expirationDate: credential.expiration_date
          };
        }
  
        // Check if suspended
        if (credential.status === 'SUSPENDED') {
          return {
            valid: false,
            status: 'SUSPENDED',
            reason: 'Credential has been suspended'
          };
        }
  
        // Credential is valid
        return {
          valid: true,
          status: 'VALID',
          issuanceDate: credential.issuance_date,
          expirationDate: credential.expiration_date,
          issuer: credential.issuer_did,
          subject: credential.subject_did,
          type: credential.credential_type
        };
      } catch (error) {
        console.error('Error validating credential:', error);
        throw new Error(`Failed to validate credential: ${error.message}`);
      }
    }
  
    /**
     * Count credentials by criteria
     * @param {Object} criteria - Filter criteria
     * @returns {Promise<Number>} - Count of matching credentials
     */
    async count(criteria = {}) {
      try {
        const { issuerDid, subjectDid, status, type } = criteria;
  
        let query = `
          SELECT COUNT(*) as count
          FROM credentials
          WHERE 1=1
        `;
  
        const params = [];
        let paramIndex = 1;
  
        if (issuerDid) {
          query += ` AND issuer_did = $${paramIndex++}`;
          params.push(issuerDid);
        }
  
        if (subjectDid) {
          query += ` AND subject_did = $${paramIndex++}`;
          params.push(subjectDid);
        }
  
        if (status) {
          query += ` AND status = $${paramIndex++}`;
          params.push(status);
        }
  
        if (type) {
          query += ` AND credential_type = $${paramIndex++}`;
          params.push(type);
        }
  
        const result = await this.db.query(query, params);
        return parseInt(result.rows[0].count || 0);
      } catch (error) {
        console.error('Error counting credentials:', error);
        throw new Error(`Failed to count credentials: ${error.message}`);
      }
    }
  }
  
  module.exports = CredentialModel;