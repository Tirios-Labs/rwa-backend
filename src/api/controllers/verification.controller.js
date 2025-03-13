const VerificationRequest = require('../../models/verification.model');
const Identity = require('../../models/identity.model');
const ethereumService = require('../../services/blockchain/ethereum.service');
const polygonAmoyService = require('../../services/blockchain/polygon.service');

/**
 * Verification controller for API endpoints
 */
const verificationController = {
  /**
   * Request verification for a DID on a target chain
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  requestVerification: async (req, res) => {
    try {
      const { did, targetChain, sourceChain } = req.body;
      
      // Validate DID exists
      const identity = await Identity.findByDID(did);
      if (!identity) {
        return res.status(404).json({
          success: false,
          message: 'Identity not found'
        });
      }
      
      // Create a verification request ID
      const requestId = `vr-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      // Create verification request in database
      const verificationRequest = await VerificationRequest.create({
        requestId,
        did,
        sourceChain,
        targetChain
      });
      
      // If Polygon Amoy is involved, use the appropriate service
      let blockchainResult = null;
      if (sourceChain === 'polygon-amoy' && polygonAmoyService.crossChainBridgeContract) {
        try {
          blockchainResult = await polygonAmoyService.requestCrossChainVerification({
            did,
            targetChain
          });
          
          // Update with transaction hash
          await VerificationRequest.updateStatus(
            requestId, 
            'pending', 
            { transactionHash: blockchainResult.transactionHash }
          );
        } catch (blockchainError) {
          console.error('Error requesting verification on blockchain:', blockchainError);
          // Continue with database request even if blockchain request fails
        }
      }
      
      return res.status(201).json({
        success: true,
        message: 'Verification request submitted',
        data: {
          request: verificationRequest,
          blockchain: blockchainResult
        }
      });
    } catch (error) {
      console.error('Error requesting verification:', error);
      return res.status(500).json({
        success: false,
        message: 'Error requesting verification',
        error: error.message
      });
    }
  },
  
  /**
   * Get verification request by ID
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  getById: async (req, res) => {
    try {
      const { requestId } = req.params;
      
      const request = await VerificationRequest.findById(requestId);
      if (!request) {
        return res.status(404).json({
          success: false,
          message: 'Verification request not found'
        });
      }
      
      return res.status(200).json({
        success: true,
        data: request
      });
    } catch (error) {
      console.error('Error getting verification request:', error);
      return res.status(500).json({
        success: false,
        message: 'Error retrieving verification request',
        error: error.message
      });
    }
  },
  
  /**
   * Get all verification requests for a DID
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  getByDID: async (req, res) => {
    try {
      const { did } = req.params;
      
      const requests = await VerificationRequest.findByDID(did);
      
      return res.status(200).json({
        success: true,
        data: requests
      });
    } catch (error) {
      console.error('Error getting verification requests by DID:', error);
      return res.status(500).json({
        success: false,
        message: 'Error retrieving verification requests',
        error: error.message
      });
    }
  },
  
  /**
   * Update verification request status
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  updateStatus: async (req, res) => {
    try {
      const { requestId } = req.params;
      const { status, message } = req.body;
      
      const request = await VerificationRequest.updateStatus(requestId, status, message);
      
      return res.status(200).json({
        success: true,
        message: 'Verification request status updated',
        data: request
      });
    } catch (error) {
      console.error('Error updating verification request status:', error);
      return res.status(500).json({
        success: false,
        message: 'Error updating verification request',
        error: error.message
      });
    }
  },
  
  /**
   * Complete a verification request
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  completeVerification: async (req, res) => {
    try {
      const { requestId } = req.params;
      const { isVerified, message } = req.body;
      
      // Verify the user is authorized (verifier or admin)
      if (req.user.role !== 'verifier' && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to complete verification'
        });
      }
      
      const request = await VerificationRequest.complete(requestId, isVerified, message);
      
      // If Polygon Amoy is involved and it's verified, use the appropriate service
      if (isVerified && request.targetChain === 'polygon-amoy' && polygonAmoyService.crossChainBridgeContract) {
        try {
          await polygonAmoyService.completeVerification(requestId, isVerified);
        } catch (blockchainError) {
          console.error('Error completing verification on blockchain:', blockchainError);
          // Continue with database update even if blockchain update fails
        }
      }
      
      return res.status(200).json({
        success: true,
        message: `Verification ${isVerified ? 'approved' : 'rejected'}`,
        data: request
      });
    } catch (error) {
      console.error('Error completing verification:', error);
      return res.status(500).json({
        success: false,
        message: 'Error completing verification',
        error: error.message
      });
    }
  },
  
  /**
   * Get all pending verification requests
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  getPendingRequests: async (req, res) => {
    try {
      const requests = await VerificationRequest.getPendingRequests();
      
      return res.status(200).json({
        success: true,
        data: requests
      });
    } catch (error) {
      console.error('Error getting pending verification requests:', error);
      return res.status(500).json({
        success: false,
        message: 'Error retrieving pending verification requests',
        error: error.message
      });
    }
  }
};

module.exports = verificationController;