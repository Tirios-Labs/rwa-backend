const crypto = require('crypto');
const ethers = require('ethers');
const ipfsService = require('./ipfs');
const polygonService = require('./polygon');
const solanaService = require('./solana');

class CredentialService {
  constructor(db, redis, didService) {
    this.db = db;
    this.redis = redis;
    this.didService = didService;
  }

  /**
   * Issue a new verifiable credential
   * @param {String} issuerDid - The issuer's DID
   * @param {String} subjectDid - The subject's DID
   * @param {Object} claims - The credential claims
   * @param {String} issuerWalletAddress - The issuer's wallet address
   * @param {Object} options - Additional options (type, expirationDate, etc.)
   * @returns {Promise<Object>} - The issued credential
   */
  async issueCredential(issuerDid, subjectDid, claims, issuerWalletAddress, options = {}) {
    try {
      // Verify that the issuer controls the DID
      const isController = await this.didService.verifyController(issuerDid, issuerWalletAddress);
      if (!isController) {
        throw new Error('Not authorized to issue credentials from this DID');
      }
      
      // Get issuer DID document
      const issuerDidDocument = await this.didService.resolveDID(issuerDid);
      if (!issuerDidDocument) {
        throw new Error('Issuer DID not found');
      }
      // Get the subject's SBT token ID
    const sbtTokenId = await this._getSbtTokenIdFromDid(subjectDid);
    if (!sbtTokenId) {
      throw new Error('Subject has no associated SBT token');
    }
      
      // Verify subject DID exists
      const subjectDidDocument = await this.didService.resolveDID(subjectDid);
      if (!subjectDidDocument) {
        throw new Error('Subject DID not found');
      }
      
      // Generate credential ID
      const credentialId = `urn:credential:${crypto.randomBytes(16).toString('hex')}`;
      
      // Create issuance date
      const issuanceDate = new Date().toISOString();
      
      // Set expiration date if provided or default to 1 year
      const expirationDate = options.expirationDate 
        ? new Date(options.expirationDate).toISOString()
        : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();


         // Add SBT token ID to the credential claims
    const enhancedClaims = {
      ...claims,
      sbtTokenId: sbtTokenId.toString() // Include the SBT token ID in the credential
    };
      
      // Create credential
      const credential = {
        '@context': [
          'https://www.w3.org/2018/credentials/v1',
          'https://www.w3.org/2018/credentials/examples/v1'
        ],
        id: credentialId,
        type: ['VerifiableCredential', ...(options.type ? [options.type] : [])],
        issuer: issuerDid,
        issuanceDate,
        expirationDate,
        credentialSubject: {
          id: subjectDid,
          ...enhancedClaims
        }
      };
      
      // Add optional schema if provided
      if (options.credentialSchema) {
        credential.credentialSchema = {
          id: options.credentialSchema,
          type: 'JsonSchemaValidator2018'
        };
      }
      
      // Sign the credential
      const signedCredential = await this.signCredential(credential, issuerDid, issuerWalletAddress);
      
      // Store in IPFS
      const cid = await ipfsService.pinCredential(signedCredential, issuerDid, subjectDid);
      
      // Calculate credential hash for on-chain reference
      const credentialHash = ipfsService.hashCredential(signedCredential);
      
      // Store in database
      const query = `
        INSERT INTO credentials (
          credential_hash, issuer_did, subject_did, credential_type, 
          credential_schema, issuance_date, expiration_date, 
          status, metadata, ipfs_cid, proof,sbt_token_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, credential_hash,sbt_token_id
      `;
      
      const params = [
        credentialHash,
        issuerDid,
        subjectDid,
        Array.isArray(options.type) ? options.type[0] : (options.type || 'VerifiableCredential'),
        options.credentialSchema || null,
        new Date(issuanceDate),
        new Date(expirationDate),
        'ACTIVE',
        JSON.stringify(options.metadata || {}),
        cid,
        JSON.stringify(signedCredential.proof),
        sbtTokenId
        
      ];
      
      const result = await this.db.query(query, params);

      
      
      // Register on blockchain (could be async)
      await this.registerCredentialOnChain(
        issuerDid, 
        subjectDid, 
        credentialHash, 
        issuerWalletAddress
      );
      await this._updateSbtWithCredential(sbtTokenId, credentialHash, true);
      return {
        credential: signedCredential,
        credentialHash,
        ipfsCid: cid,
        sbtTokenId
      };
    } catch (error) {
      console.error('Error issuing credential:', error);
      throw new Error(`Failed to issue credential: ${error.message}`);
    }
}


/**
 * Revoke a credential and update its status on the blockchain
 * @param {String} credentialHash - The credential hash
 * @param {String} reason - Reason for revocation
 * @param {String} revokerWalletAddress - Wallet address of the revoker
 * @returns {Promise<Object>} - Revocation result
 */
async revokeCredential(credentialHash, reason, revokerWalletAddress) {
  try {
    // Get credential details from database
    const query = `
      SELECT issuer_did, sbt_token_id
      FROM credentials
      WHERE credential_hash = $1
    `;
    
    const result = await this.db.query(query, [credentialHash]);
    
    if (result.rows.length === 0) {
      throw new Error('Credential not found');
    }
    
    const { issuer_did, sbt_token_id } = result.rows[0];
    
    // Verify if revoker controls the issuer DID
    const isController = await this.didService.verifyController(issuer_did, revokerWalletAddress);
    if (!isController) {
      throw new Error('Not authorized to revoke this credential');
    }
    
    // Update credential status in database
    const updateQuery = `
      UPDATE credentials
      SET status = 'REVOKED', revocation_date = NOW()
      WHERE credential_hash = $1
      RETURNING credential_hash, revocation_date
    `;
    
    const updateResult = await this.db.query(updateQuery, [credentialHash]);
    
    // Update the SBT on blockchain to mark this credential as invalid
    await this._updateSbtWithCredential(sbt_token_id, credentialHash, false);
    
    return {
      revoked: true,
      credentialHash,
      revocationDate: updateResult.rows[0].revocation_date,
      reason
    };
  } catch (error) {
    console.error('Error revoking credential:', error);
    throw new Error(`Failed to revoke credential: ${error.message}`);
  }
}

/**
 * Get token ID from DID
 * @private
 * @param {String} did - The DID to check
 * @returns {Promise<Number|null>} - Token ID or null
 */
async _getSbtTokenIdFromDid(did) {
  try {
    const query = `
      SELECT sbt_token_id FROM did_to_sbt
      WHERE did = $1
    `;
    
    const result = await this.db.query(query, [did]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return parseInt(result.rows[0].sbt_token_id);
  } catch (error) {
    console.error('Error getting SBT token ID:', error);
    return null;
  }
}

/**
 * Update SBT token with credential status on blockchain
 * @private
 * @param {Number} sbtTokenId - The SBT token ID
 * @param {String} credentialHash - The credential hash
 * @param {Boolean} isValid - Whether the credential is valid
 */
async _updateSbtWithCredential(sbtTokenId, credentialHash, isValid) {
  try {
    // Get blockchain service
    const blockchainService = require('../services/polygon');
    
    // Update credential in the SBT
    await blockchainService.updateSbtCredential(sbtTokenId, credentialHash, isValid);
    
    console.log(`Updated SBT #${sbtTokenId} with credential ${credentialHash}, valid: ${isValid}`);
  } catch (error) {
    console.error('Error updating SBT with credential:', error);
    throw new Error(`Failed to update SBT: ${error.message}`);
  }
}

/**
 * Find all credentials for a specific SBT token
 * @param {Number} sbtTokenId - SBT token ID
 * @returns {Promise<Array>} - List of credentials
 */
async findCredentialsBySbt(sbtTokenId) {
  try {
    const query = `
      SELECT 
        credential_hash, ipfs_cid, issuer_did, subject_did, 
        status, issuance_date, credential_type
      FROM credentials
      WHERE sbt_token_id = $1
      ORDER BY issuance_date DESC
    `;
    
    const result = await this.db.query(query, [sbtTokenId]);
    return result.rows;
  } catch (error) {
    console.error('Error finding credentials by SBT:', error);
    throw new Error(`Failed to find credentials: ${error.message}`);
  }
}

}
module.exports = CredentialService;