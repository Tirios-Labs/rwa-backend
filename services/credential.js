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
          ...claims
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
          status, metadata, ipfs_cid, proof
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, credential_hash
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
        JSON.stringify(signedCredential.proof)
      ];
      
      const result = await this.db.query(query, params);
      
      // Register on blockchain (could be async)
      await this.registerCredentialOnChain(
        issuerDid, 
        subjectDid, 
        credentialHash, 
        issuerWalletAddress
      );
      
      return {
        credential: signedCredential,
        credentialHash,
        ipfsCid: cid
      };
    } catch (error) {
      console.error('Error issuing credential:', error);
      throw new Error(`Failed to issue credential: ${error.message}`);
    }
}}
module.exports = CredentialService;