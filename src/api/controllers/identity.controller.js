const Identity = require('../../models/identity.model');
const ethereumService = require('../../services/blockchain/ethereum.service');
const polygonAmoyService = require('../../services/blockchain/polygon.service');

/**
 * Identity controller for API endpoints
 */
const identityController = {
  /**
   * Register a new identity
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */





  
  register: async (req, res) => {
    try {
      const { address, did, verifiableCredential } = req.body;
      
      // Create identity in database
      const identity = await Identity.create({
        did,
        address,
        verifiableCredential
      });
      
      return res.status(201).json({
        success: true,
        message: 'Identity registered successfully',
        data: identity
      });
    } catch (error) {
      console.error('Error registering identity:', error);
      return res.status(500).json({
        success: false,
        message: 'Error registering identity',
        error: error.message
      });
    }
  },
  
  /**
   * Update an identity with token ID
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  update: async (req, res) => {
    try {
      const { did, tokenId } = req.body;
      
      const identity = await Identity.updateWithTokenId(did, tokenId);
      
      return res.status(200).json({
        success: true,
        message: 'Identity updated successfully',
        data: identity
      });
    } catch (error) {
      console.error('Error updating identity:', error);
      return res.status(500).json({
        success: false,
        message: 'Error updating identity',
        error: error.message
      });
    }
  },
  
  /**
   * Add a chain identity to an existing identity
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  addChainIdentity: async (req, res) => {
    try {
      const { tokenId, chainId, chainAddress } = req.body;
      
      // Validate token ID exists
      const identity = await Identity.findByTokenId(tokenId);
      if (!identity) {
        return res.status(404).json({
          success: false,
          message: 'Identity not found'
        });
      }
      
      // Add chain identity
      const chainIdentity = await Identity.addChainIdentity(tokenId, chainId, chainAddress);
      
      // For Polygon Amoy, we also add it to the blockchain
      if (chainId === 'polygon-amoy' && polygonAmoyService.soulboundNFTContract) {
        try {
          await polygonAmoyService.addChainIdentity({
            tokenId,
            chainId,
            chainAddress
          });
        } catch (blockchainError) {
          console.error('Error adding chain identity to blockchain:', blockchainError);
          // Continue with database update even if blockchain update fails
        }
      }
      
      return res.status(200).json({
        success: true,
        message: 'Chain identity added successfully',
        data: chainIdentity
      });
    } catch (error) {
      console.error('Error adding chain identity:', error);
      return res.status(500).json({
        success: false,
        message: 'Error adding chain identity',
        error: error.message
      });
    }
  },
  
  /**
   * Get identity by DID
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  getByDID: async (req, res) => {
    try {
      const { did } = req.params;
      
      const identity = await Identity.findByDID(did);
      if (!identity) {
        return res.status(404).json({
          success: false,
          message: 'Identity not found'
        });
      }
      
      return res.status(200).json({
        success: true,
        data: identity
      });
    } catch (error) {
      console.error('Error getting identity by DID:', error);
      return res.status(500).json({
        success: false,
        message: 'Error retrieving identity',
        error: error.message
      });
    }
  },
  
  /**
   * Get identity by token ID
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  getByTokenId: async (req, res) => {
    try {
      const { tokenId } = req.params;
      
      const identity = await Identity.findByTokenId(tokenId);
      if (!identity) {
        return res.status(404).json({
          success: false,
          message: 'Identity not found'
        });
      }
      
      return res.status(200).json({
        success: true,
        data: identity
      });
    } catch (error) {
      console.error('Error getting identity by token ID:', error);
      return res.status(500).json({
        success: false,
        message: 'Error retrieving identity',
        error: error.message
      });
    }
  },
  
  /**
   * Verify a chain address for an identity
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  verifyChainAddress: async (req, res) => {
    try {
      const { tokenId, chainId, chainAddress } = req.body;
      const verifier = req.user.id;
      
      // First, check if the address matches
      const isValid = await Identity.verifyChainAddress(tokenId, chainId, chainAddress);
      
      if (!isValid) {
        return res.status(400).json({
          success: false,
          message: 'Invalid chain address for this identity'
        });
      }
      
      // If valid, mark it as verified
      const result = await Identity.verifyChainIdentity(tokenId, chainId, verifier);
      
      return res.status(200).json({
        success: true,
        message: 'Chain address verified successfully',
        data: result
      });
    } catch (error) {
      console.error('Error verifying chain address:', error);
      return res.status(500).json({
        success: false,
        message: 'Error verifying chain address',
        error: error.message
      });
    }
  },
  
  /**
   * Get all chain identities for a token
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  getChainIdentities: async (req, res) => {
    try {
      const { tokenId } = req.params;
      
      const chainIdentities = await Identity.getChainIdentities(tokenId);
      
      return res.status(200).json({
        success: true,
        data: chainIdentities
      });
    } catch (error) {
      console.error('Error getting chain identities:', error);
      return res.status(500).json({
        success: false,
        message: 'Error retrieving chain identities',
        error: error.message
      });
    }
  }
};

exports.verifyIdentity = async (req, res) => {
  try {
    const { address, did, vc } = req.body;
    const receipt = await polygonService.verifyIdentity(address, did, vc);
    res.json({ success: true, txHash: receipt.transactionHash });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getIdentity = async (req, res) => {
  try {
    const { tokenId, fields } = req.query; // e.g., fields=ownership
    const credentialHash = await polygonService.getCredentialHash(tokenId);
    
    // Assume CID is stored off-chain or passed (for simplicity, you'd need a mapping)
    const cid = req.query.cid; // In practice, store CID somewhere (e.g., database)
    const vc = await polygonService.getVcFromIpfs(cid);
    
    // Filter VC based on requested fields
    const filteredVc = fields ? { [fields]: vc.credentialSubject[fields] } : vc;
    res.json({ credentialHash, vc: filteredVc });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = identityController;