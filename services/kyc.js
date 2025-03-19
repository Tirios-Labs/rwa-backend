/**
 * KYC (Know Your Customer) Service
 * Handles identity verification and KYC compliance functionality
 */

// Try to load config, use defaults if not available
let config;
try {
  config = require('../config');
} catch (error) {
  console.warn('Config file not found, using default KYC config');
  config = {
    kyc: {
      provider: process.env.KYC_PROVIDER || 'mock',
      apiKey: process.env.KYC_API_KEY
    }
  };
}

class KYCService {
  constructor(db, redis) {
    this.db = db;
    this.redis = redis;
    this.provider = config.kyc?.provider || 'mock';
    this.apiKey = config.kyc?.apiKey;
  }

  /**
   * Create a new KYC verification request
   * @param {String} userId - User ID
   * @param {String} level - Verification level (BASIC, ADVANCED, FULL)
   * @param {Object} userData - User data for verification
   * @returns {Promise<Object>} - Verification request details
   */
  async createVerificationRequest(userId, level, userData) {
    try {
      // Validate inputs
      if (!userId || !level) {
        throw new Error('User ID and verification level are required');
      }

      // Check for existing verification
      const existingQuery = `
        SELECT id, status FROM kyc_verifications
        WHERE user_id = $1 AND verification_level = $2
        ORDER BY submitted_at DESC
        LIMIT 1
      `;
      
      const existingResult = await this.db.query(existingQuery, [userId, level]);
      
      if (existingResult.rows.length > 0) {
        const existing = existingResult.rows[0];
        if (existing.status === 'VERIFIED') {
          return { 
            success: false, 
            message: 'User already verified at this level',
            verificationId: existing.id
          };
        }
        
        if (existing.status === 'PENDING') {
          return { 
            success: false, 
            message: 'Verification already in progress',
            verificationId: existing.id
          };
        }
      }
      
      // Insert new verification request
      const insertQuery = `
        INSERT INTO kyc_verifications (
          user_id, verification_level, provider, status, verification_data, 
          metadata, submitted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id, status, submitted_at
      `;
      
      const params = [
        userId,
        level,
        this.provider,
        'PENDING',
        JSON.stringify(userData),
        JSON.stringify({ source: 'api' })
      ];
      
      const result = await this.db.query(insertQuery, params);
      
      if (result.rows.length === 0) {
        throw new Error('Failed to create verification request');
      }
      
      const verificationId = result.rows[0].id;
      
      // In a real implementation, initiate verification with external provider
      if (this.provider !== 'mock') {
        // Call external KYC provider API
        // This would be an async call to a real KYC provider
        console.log(`Initiating ${level} KYC verification for user ${userId} with ${this.provider}`);
      } else {
        // For mock provider, simulate async verification
        setTimeout(() => this._processMockVerification(verificationId, userId, level), 5000);
      }
      
      return {
        success: true,
        message: 'Verification request submitted',
        verificationId,
        status: 'PENDING',
        submittedAt: result.rows[0].submitted_at
      };
    } catch (error) {
      console.error('Error creating KYC verification request:', error);
      throw new Error(`Failed to create verification request: ${error.message}`);
    }
  }

  /**
   * Get verification status
   * @param {String} verificationId - Verification ID
   * @returns {Promise<Object>} - Verification status
   */
  async getVerificationStatus(verificationId) {
    try {
      const query = `
        SELECT v.id, v.user_id, v.verification_level, v.status, 
               v.provider, v.submitted_at, v.verified_at, v.expires_at,
               u.did
        FROM kyc_verifications v
        JOIN users u ON v.user_id = u.id
        WHERE v.id = $1
      `;
      
      const result = await this.db.query(query, [verificationId]);
      
      if (result.rows.length === 0) {
        throw new Error('Verification request not found');
      }
      
      return {
        success: true,
        verification: result.rows[0]
      };
    } catch (error) {
      console.error('Error getting verification status:', error);
      throw new Error(`Failed to get verification status: ${error.message}`);
    }
  }

  /**
   * Update verification status
   * @param {String} verificationId - Verification ID
   * @param {String} status - New status (VERIFIED, REJECTED, PENDING)
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} - Updated verification
   */
  async updateVerificationStatus(verificationId, status, metadata = {}) {
    try {
      let expires_at = null;
      
      if (status === 'VERIFIED') {
        // Set expiration date (1 year from now)
        expires_at = new Date();
        expires_at.setFullYear(expires_at.getFullYear() + 1);
      }
      
      const query = `
        UPDATE kyc_verifications
        SET status = $1, 
            verified_at = CASE WHEN $1 = 'VERIFIED' THEN NOW() ELSE verified_at END,
            expires_at = $2,
            metadata = metadata || $3::jsonb
        WHERE id = $4
        RETURNING id, user_id, status, verified_at, expires_at
      `;
      
      const params = [
        status,
        expires_at,
        JSON.stringify(metadata),
        verificationId
      ];
      
      const result = await this.db.query(query, params);
      
      if (result.rows.length === 0) {
        throw new Error('Verification request not found');
      }
      
      // If status is VERIFIED, issue credential
      if (status === 'VERIFIED') {
        await this._issueKYCCredential(result.rows[0].user_id, metadata.level || 'BASIC');
      }
      
      return {
        success: true,
        message: `Verification status updated to ${status}`,
        verification: result.rows[0]
      };
    } catch (error) {
      console.error('Error updating verification status:', error);
      throw new Error(`Failed to update verification status: ${error.message}`);
    }
  }

  /**
   * Check if a user is verified to a specific level
   * @param {String} userId - User ID
   * @param {String} level - Verification level to check (BASIC, ADVANCED, FULL)
   * @returns {Promise<Boolean>} - Whether the user is verified
   */
  async isUserVerified(userId, level) {
    try {
      const query = `
        SELECT 1 FROM kyc_verifications
        WHERE user_id = $1 
          AND verification_level = $2
          AND status = 'VERIFIED'
          AND (expires_at IS NULL OR expires_at > NOW())
          AND (revoked_at IS NULL)
        LIMIT 1
      `;
      
      const result = await this.db.query(query, [userId, level]);
      
      return result.rows.length > 0;
    } catch (error) {
      console.error('Error checking user verification:', error);
      return false;
    }
  }

  /**
   * Get all verifications for a user
   * @param {String} userId - User ID
   * @returns {Promise<Array>} - User's verifications
   */
  async getUserVerifications(userId) {
    try {
      const query = `
        SELECT id, verification_level, provider, status, submitted_at, 
               verified_at, expires_at, revoked_at
        FROM kyc_verifications
        WHERE user_id = $1
        ORDER BY submitted_at DESC
      `;
      
      const result = await this.db.query(query, [userId]);
      
      return {
        success: true,
        verifications: result.rows
      };
    } catch (error) {
      console.error('Error getting user verifications:', error);
      throw new Error(`Failed to get user verifications: ${error.message}`);
    }
  }

  /**
   * Revoke a verification
   * @param {String} verificationId - Verification ID
   * @param {String} reason - Revocation reason
   * @returns {Promise<Object>} - Revocation result
   */
  async revokeVerification(verificationId, reason) {
    try {
      const query = `
        UPDATE kyc_verifications
        SET status = 'REVOKED', 
            revoked_at = NOW(),
            metadata = metadata || $2::jsonb
        WHERE id = $1
        RETURNING id, user_id
      `;
      
      const params = [
        verificationId,
        JSON.stringify({ revocation_reason: reason })
      ];
      
      const result = await this.db.query(query, params);
      
      if (result.rows.length === 0) {
        throw new Error('Verification not found');
      }
      
      // TODO: Revoke any credentials issued based on this verification
      
      return {
        success: true,
        message: 'Verification revoked successfully'
      };
    } catch (error) {
      console.error('Error revoking verification:', error);
      throw new Error(`Failed to revoke verification: ${error.message}`);
    }
  }

  /**
   * Process mock verification (for development/testing)
   * @private
   */
  async _processMockVerification(verificationId, userId, level) {
    try {
      // Simulate verification process
      // In a real system, this would be triggered by a callback from the KYC provider
      
      // Randomly approve (80%) or reject (20%)
      const approved = Math.random() < 0.8;
      
      const status = approved ? 'VERIFIED' : 'REJECTED';
      const metadata = {
        mock: true,
        level,
        verificationId,
        processed: new Date().toISOString()
      };
      
      await this.updateVerificationStatus(verificationId, status, metadata);
      
      console.log(`Mock verification ${verificationId} for user ${userId} completed with status: ${status}`);
    } catch (error) {
      console.error('Error processing mock verification:', error);
    }
  }

  /**
   * Issue a KYC credential based on verification
   * @private
   */
  async _issueKYCCredential(userId, level) {
    try {
      // Get user DID
      const userQuery = `SELECT did FROM users WHERE id = $1`;
      const userResult = await this.db.query(userQuery, [userId]);
      
      if (userResult.rows.length === 0 || !userResult.rows[0].did) {
        console.warn(`Cannot issue KYC credential: User ${userId} has no DID`);
        return;
      }
      
      const did = userResult.rows[0].did;
      
      // In a real implementation, this would use the CredentialService
      // to issue a proper verifiable credential
      console.log(`Issuing KYC credential for user ${userId} with DID ${did} at level ${level}`);
      
      // Mock credential issuance
      const credentialHash = `0x${Buffer.from(`kyc:${userId}:${level}:${Date.now()}`).toString('hex')}`;
      
      console.log(`KYC credential issued with hash: ${credentialHash}`);
    } catch (error) {
      console.error('Error issuing KYC credential:', error);
    }
  }


  /**
 * Generate a zero-knowledge proof for KYC verification
 * @param {String} userId - User ID
 * @param {String} verificationId - KYC verification ID
 * @returns {Promise<Object>} - The ZK proof
 */
async generateKycProof(userId, verificationId) {
  try {
    // Get verification data
    const verificationQuery = `
      SELECT verification_level, status, provider, verification_data
      FROM kyc_verifications
      WHERE id = $1 AND user_id = $2
    `;
    
    const result = await this.db.query(verificationQuery, [verificationId, userId]);
    
    if (result.rows.length === 0) {
      throw new Error('Verification not found');
    }
    
    const verification = result.rows[0];
    
    if (verification.status !== 'VERIFIED') {
      throw new Error('KYC verification is not complete');
    }
    
    // Get the user's DID and SBT
    const userQuery = `
      SELECT u.did, s.sbt_token_id
      FROM users u
      JOIN did_to_sbt s ON u.did = s.did
      WHERE u.id = $1
    `;
    
    const userResult = await this.db.query(userQuery, [userId]);
    
    if (userResult.rows.length === 0) {
      throw new Error('User DID or SBT not found');
    }
    
    const { did, sbt_token_id } = userResult.rows[0];
    
    // Load the ZK proof service
    const zkProofService = require('./zkProofService');
    
    // Prepare the data for the ZK proof
    const zkData = {
      did,
      sbtTokenId: sbt_token_id,
      kycLevel: verification.verification_level,
      provider: verification.provider,
      verificationTimestamp: Date.now()
    };
    
    // Generate the proof
    const proof = await zkProofService.generateProof('kyc', zkData);
    
    // Store the proof reference
    const proofQuery = `
      INSERT INTO zk_proofs (
        user_id, verification_id, proof_type, proof_data, public_inputs, 
        expires_at, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING id
    `;
    
    const proofResult = await this.db.query(proofQuery, [
      userId,
      verificationId,
      'KYC',
      JSON.stringify(proof.proof),
      JSON.stringify(proof.publicInputs),
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days expiry
    ]);
    
    // Return the proof data
    return {
      proofId: proofResult.rows[0].id,
      zkProof: proof.proof,
      publicInputs: proof.publicInputs,
      sbtTokenId: sbt_token_id
    };
  } catch (error) {
    console.error('Error generating KYC proof:', error);
    throw new Error(`Failed to generate KYC proof: ${error.message}`);
  }
}
}


module.exports = KYCService;