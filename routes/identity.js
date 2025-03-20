const express = require('express');
const router = express.Router();
const { ownsDID, hasRole } = require('../middleware/auth');
const DIDService = require('../services/did');
const { authenticateJWT } = require('../middleware/auth');

router.post('/did', authenticateJWT, async (req, res) => {
  try {
    const { chain } = req.body;
    const walletAddress = req.user.walletAddress;
   
    // Initialize DID service
    const db = req.app.get('db');
    const redis = req.app.get('redis');
    const didService = new DIDService(db, redis);
   
    // Generate a new DID with atomic SBT minting
    const result = await didService.generateDID(walletAddress, chain || 'polygon');
   
    // The result contains both DID and token ID information
    res.status(201).json({
      success: true,
      did: result.did,
      sbtTokenId: result.sbtTokenId,  // Make sure we use the numeric token ID
      transactionHash: result.transactionHash || null,
      message: 'DID and SBT generated successfully'
    });
  } catch (error) {
    console.error('Error generating DID:', error);
    res.status(500).json({
      success: false,
      message: `Failed to generate DID: ${error.message}`
    });
  }
});
router.get('/did/:did', async (req, res) => {
  try {
    const { did } = req.params;
    
    // Initialize DID service
    const db = req.app.get('db');
    const redis = req.app.get('redis');
    const didService = new DIDService(db, redis);
    
    // Resolve the DID
    const didDocument = await didService.resolveDID(did);
    
    res.status(200).json({
      success: true,
      did,
      didDocument
    });
  } catch (error) {
    console.error('Error resolving DID:', error);
    res.status(404).json({
      success: false,
      message: `Failed to resolve DID: ${error.message}`
    });
  }
});

/**
 * Update a DID document
 */
router.put('/did/:did', ownsDID(req => req.params.did), async (req, res) => {
  try {
    const { did } = req.params;
    const { updates } = req.body;
    const walletAddress = req.user.walletAddress;
    
    // Initialize DID service
    const db = req.app.get('db');
    const redis = req.app.get('redis');
    const didService = new DIDService(db, redis);
    
    // Update the DID document
    const updatedDocument = await didService.updateDIDDocument(did, updates, walletAddress);
    
    res.status(200).json({
      success: true,
      did,
      didDocument: updatedDocument,
      message: 'DID document updated successfully'
    });
  } catch (error) {
    console.error('Error updating DID document:', error);
    res.status(400).json({
      success: false,
      message: `Failed to update DID document: ${error.message}`
    });
  }
});

/**
 * Add a controller to a DID
 */
router.post('/did/:did/controllers', ownsDID(req => req.params.did), async (req, res) => {
  try {
    const { did } = req.params;
    const { controllerDid } = req.body;
    const walletAddress = req.user.walletAddress;
    
    if (!controllerDid) {
      return res.status(400).json({
        success: false,
        message: 'Controller DID is required'
      });
    }
    
    // Initialize DID service
    const db = req.app.get('db');
    const redis = req.app.get('redis');
    const didService = new DIDService(db, redis);
    
    // Add controller
    const updatedDocument = await didService.addController(did, controllerDid, walletAddress);
    
    res.status(200).json({
      success: true,
      did,
      controllerDid,
      didDocument: updatedDocument,
      message: 'Controller added successfully'
    });
  } catch (error) {
    console.error('Error adding controller:', error);
    res.status(400).json({
      success: false,
      message: `Failed to add controller: ${error.message}`
    });
  }
});

/**
 * Add a chain identity to a DID
 */
router.post('/did/:did/chain-identities', ownsDID(req => req.params.did), async (req, res) => {
  try {
    const { did } = req.params;
    const { chain, address } = req.body;
    const walletAddress = req.user.walletAddress;
    
    if (!chain || !address) {
      return res.status(400).json({
        success: false,
        message: 'Chain and address are required'
      });
    }
    
    // Initialize DID service
    const db = req.app.get('db');
    const redis = req.app.get('redis');
    const didService = new DIDService(db, redis);
    
    // Add chain identity
    const success = await didService.addChainIdentity(did, chain, address, walletAddress);
    
    if (success) {
      res.status(200).json({
        success: true,
        did,
        chain,
        address,
        message: 'Chain identity added successfully'
      });
    } else {
      throw new Error('Failed to add chain identity');
    }
  } catch (error) {
    console.error('Error adding chain identity:', error);
    res.status(400).json({
      success: false,
      message: `Failed to add chain identity: ${error.message}`
    });
  }
});

/**
 * Get all chain identities for a DID
 */
router.get('/did/:did/chain-identities', async (req, res) => {
  try {
    const { did } = req.params;
    
    // Query database for chain identities
    const db = req.app.get('db');
    
    const query = `
      SELECT chain_id, address, created_at
      FROM chain_identities
      WHERE did = $1 AND is_active = true
    `;
    
    const result = await db.query(query, [did]);
    
    res.status(200).json({
      success: true,
      did,
      chainIdentities: result.rows
    });
  } catch (error) {
    console.error('Error getting chain identities:', error);
    res.status(500).json({
      success: false,
      message: `Failed to get chain identities: ${error.message}`
    });
  }
});

/**
 * Admin: Trigger cross-chain DID resolution
 */
router.post('/admin/resolve-did', hasRole('BRIDGE_ADMIN'), async (req, res) => {
  try {
    const { did, targetChain } = req.body;
    
    if (!did || !targetChain) {
      return res.status(400).json({
        success: false,
        message: 'DID and target chain are required'
      });
    }
    
    // Get the Polygon service
    const polygonService = require('../services/polygon');
    
    // Trigger resolution
    const requestId = await polygonService.resolveDID(did, targetChain);
    
    res.status(200).json({
      success: true,
      requestId,
      did,
      targetChain,
      message: 'DID resolution requested'
    });
  } catch (error) {
    console.error('Error resolving DID cross-chain:', error);
    res.status(500).json({
      success: false,
      message: `Failed to resolve DID cross-chain: ${error.message}`
    });
  }
});


module.exports = router;