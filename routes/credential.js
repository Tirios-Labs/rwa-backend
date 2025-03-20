const express = require('express');
const router = express.Router();
const { ownsDID, hasRole } = require('../middleware/auth');
const DIDService = require('../services/did');
const CredentialService = require('../services/credential');
const ipfsService = require('../services/ipfs');
const { authenticateJWT } = require('../middleware/auth');

/**
 * Issue a new credential
 */
router.post('/issue', hasRole('CREDENTIAL_ISSUER'), async (req, res) => {
  try {
    const { issuerDid, subjectDid, claims, type, expirationDate, credentialSchema } = req.body;
    const walletAddress = req.user.walletAddress;
    
    // Validate request
    if (!issuerDid || !subjectDid || !claims) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: issuerDid, subjectDid, and claims are required'
      });
    }

    // Initialize services
    const db = req.app.get('db');
    const redis = req.app.get('redis');
    const didService = new DIDService(db, redis);
    const credentialService = new CredentialService(db, redis, didService);
    
    // Verify that the issuer controls the DID
    const isController = await didService.verifyController(issuerDid, walletAddress);
    if (!isController) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to issue credentials from this DID'
      });
    }

    // Issue the credential
    const options = {
      type: type || 'VerifiableCredential',
      expirationDate,
      credentialSchema
    };

    const result = await credentialService.issueCredential(
      issuerDid,
      subjectDid,
      claims,
      walletAddress,
      options
    );

    res.status(201).json({
      success: true,
      credential: result.credential,
      credentialHash: result.credentialHash,
      ipfsCid: result.ipfsCid,
      message: 'Credential issued successfully'
    });
  } catch (error) {
    console.error('Error issuing credential:', error);
    res.status(500).json({
      success: false,
      message: `Failed to issue credential: ${error.message}`
    });
  }
});

/**
 * Verify a credential
 */
router.post('/verify', async (req, res) => {
  try {
    const { credential, credentialHash, ipfsCid } = req.body;
    
    // Validate request
    if ((!credential && !ipfsCid) || !credentialHash) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: either credential or ipfsCid, plus credentialHash are required'
      });
    }

    // Initialize services
    const db = req.app.get('db');
    const redis = req.app.get('redis');
    const didService = new DIDService(db, redis);
    const credentialService = new CredentialService(db, redis, didService);
    
    // Get the credential content
    let credentialContent;
    if (credential) {
      credentialContent = typeof credential === 'string' ? JSON.parse(credential) : credential;
    } else if (ipfsCid) {
      credentialContent = await ipfsService.getFromIPFS(ipfsCid);
    }

    if (!credentialContent) {
      return res.status(400).json({
        success: false,
        message: 'Could not retrieve credential content'
      });
    }

    // Verify the credential
    const verificationResult = await credentialService.verifyCredential(
      credentialContent,
      credentialHash
    );

    res.status(200).json({
      success: true,
      verified: verificationResult.verified,
      status: verificationResult.status,
      issuer: verificationResult.issuer,
      subject: verificationResult.subject,
      expirationDate: verificationResult.expirationDate,
      issuanceDate: verificationResult.issuanceDate,
      details: verificationResult.details
    });
  } catch (error) {
    console.error('Error verifying credential:', error);
    res.status(500).json({
      success: false,
      message: `Failed to verify credential: ${error.message}`
    });
  }
});

/**
 * Revoke a credential
 */
router.post('/revoke', hasRole('CREDENTIAL_ISSUER'), async (req, res) => {
  try {
    const { credentialHash, reason } = req.body;
    const walletAddress = req.user.walletAddress;
    
    // Validate request
    if (!credentialHash) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: credentialHash'
      });
    }

    // Initialize services
    const db = req.app.get('db');
    const redis = req.app.get('redis');
    const didService = new DIDService(db, redis);
    const credentialService = new CredentialService(db, redis, didService);
    
    // Get credential details to verify ownership
    const query = `
      SELECT issuer_did, subject_did, status
      FROM credentials
      WHERE credential_hash = $1
    `;
    
    const result = await db.query(query, [credentialHash]);
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Credential not found'
      });
    }
    
    const { issuer_did, status } = result.rows[0];
    
    if (status === 'REVOKED') {
      return res.status(400).json({
        success: false,
        message: 'Credential has already been revoked'
      });
    }
    
    // Verify that the user controls the issuer DID
    const isController = await didService.verifyController(issuer_did, walletAddress);
    if (!isController) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to revoke this credential'
      });
    }
    
    // Revoke the credential
    const revocationResult = await credentialService.revokeCredential(
      credentialHash,
      reason || 'No reason provided',
      walletAddress
    );
    
    res.status(200).json({
      success: true,
      credentialHash,
      status: 'REVOKED',
      revocationDate: revocationResult.revocationDate,
      message: 'Credential revoked successfully'
    });
  } catch (error) {
    console.error('Error revoking credential:', error);
    res.status(500).json({
      success: false,
      message: `Failed to revoke credential: ${error.message}`
    });
  }
});

/**
 * Get credential by hash
 */
router.get('/:credentialHash', async (req, res) => {
  try {
    const { credentialHash } = req.params;
    
    // Initialize services
    const db = req.app.get('db');
    
    // Query database for credential
    const query = `
      SELECT 
        credential_hash, 
        issuer_did, 
        subject_did, 
        credential_type,
        credential_schema, 
        issuance_date, 
        expiration_date,
        revocation_date, 
        status, 
        ipfs_cid
      FROM credentials
      WHERE credential_hash = $1
    `;
    
    const result = await db.query(query, [credentialHash]);
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Credential not found'
      });
    }
    
    const credential = result.rows[0];
    
    // Get the full credential from IPFS if available
    let fullCredential = null;
    if (credential.ipfs_cid) {
      try {
        fullCredential = await ipfsService.getFromIPFS(credential.ipfs_cid);
      } catch (ipfsError) {
        console.error('Error fetching credential from IPFS:', ipfsError);
      }
    }
    
    res.status(200).json({
      success: true,
      credential: {
        ...credential,
        fullCredential
      }
    });
  } catch (error) {
    console.error('Error getting credential:', error);
    res.status(500).json({
      success: false,
      message: `Failed to get credential: ${error.message}`
    });
  }
});

/**
 * List credentials where user is subject
 */
router.get('/subject/:did', async (req, res) => {
  try {
    const { did } = req.params;
    const { status } = req.query;
    
    // Initialize services
    const db = req.app.get('db');
    
    let query = `
      SELECT 
        credential_hash, 
        issuer_did, 
        credential_type,
        credential_schema, 
        issuance_date, 
        expiration_date,
        status, 
        ipfs_cid
      FROM credentials
      WHERE subject_did = $1
    `;
    
    const params = [did];
    
    if (status) {
      query += ` AND status = $2`;
      params.push(status);
    }
    
    query += ` ORDER BY issuance_date DESC`;
    
    const result = await db.query(query, params);
    
    res.status(200).json({
      success: true,
      credentials: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error listing subject credentials:', error);
    res.status(500).json({
      success: false,
      message: `Failed to list credentials: ${error.message}`
    });
  }
});

/**
 * List credentials issued by a DID
 */
router.get('/issuer/:did', async (req, res) => {
  try {
    const { did } = req.params;
    const { status } = req.query;
    
    // Initialize services
    const db = req.app.get('db');
    
    let query = `
      SELECT 
        credential_hash, 
        subject_did, 
        credential_type,
        credential_schema, 
        issuance_date, 
        expiration_date,
        status, 
        ipfs_cid
      FROM credentials
      WHERE issuer_did = $1
    `;
    
    const params = [did];
    
    if (status) {
      query += ` AND status = $2`;
      params.push(status);
    }
    
    query += ` ORDER BY issuance_date DESC`;
    
    const result = await db.query(query, params);
    
    res.status(200).json({
      success: true,
      credentials: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error listing issuer credentials:', error);
    res.status(500).json({
      success: false,
      message: `Failed to list credentials: ${error.message}`
    });
  }
});

/**
 * Cross-chain credential verification
 */
router.post('/verify-cross-chain', hasRole('VERIFIER'), async (req, res) => {
  try {
    const { credentialHash, targetChain } = req.body;
    
    // Validate request
    if (!credentialHash || !targetChain) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: credentialHash and targetChain'
      });
    }

    // Initialize services
    const db = req.app.get('db');
    const redis = req.app.get('redis');
    const didService = new DIDService(db, redis);
    const credentialService = new CredentialService(db, redis, didService);
    
    // Get blockchain service based on current chain
    let blockchainService;
    if (req.user.chain === 'polygon') {
      blockchainService = require('../services/polygon');
    } else if (req.user.chain === 'solana') {
      blockchainService = require('../services/solana');
    } else {
      return res.status(400).json({
        success: false,
        message: `Unsupported chain: ${req.user.chain}`
      });
    }
    
    // Request cross-chain verification
    const requestId = await blockchainService.requestCredentialVerification(
      credentialHash,
      targetChain
    );
    
    // Store the verification request
    const insertQuery = `
      INSERT INTO verification_requests (
        request_id, source_chain, target_chain, credential_hash, verification_type, status
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;
    
    await db.query(insertQuery, [
      requestId,
      req.user.chain,
      targetChain,
      credentialHash,
      'CREDENTIAL',
      'PENDING'
    ]);
    
    res.status(200).json({
      success: true,
      requestId,
      credentialHash,
      targetChain,
      status: 'PENDING',
      message: 'Cross-chain credential verification requested'
    });
  } catch (error) {
    console.error('Error requesting cross-chain credential verification:', error);
    res.status(500).json({
      success: false,
      message: `Failed to request cross-chain verification: ${error.message}`
    });
  }
});


/**
 * List credentials for an SBT token
 */
router.get('/sbt/:tokenId', authenticateJWT, async (req, res) => {
  try {
    const { tokenId } = req.params;
    
    // Initialize services
    const db = req.app.get('db');
    const redis = req.app.get('redis');
    const didService = new DIDService(db, redis);
    const credentialService = new CredentialService(db, redis, didService);
    
    // Find credentials by SBT token ID
    const credentials = await credentialService.findCredentialsBySbt(tokenId);
    
    res.status(200).json({
      success: true,
      credentials,
      count: credentials.length
    });
  } catch (error) {
    console.error('Error listing SBT credentials:', error);
    res.status(500).json({
      success: false,
      message: `Failed to list credentials: ${error.message}`
    });
  }
});

module.exports = router;