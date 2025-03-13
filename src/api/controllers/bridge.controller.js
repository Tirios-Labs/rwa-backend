const BridgeMessage = require('../../models/bridge.model');
const ethereumService = require('../../services/blockchain/ethereum.service');
const polygonAmoyService = require('../../services/blockchain/polygon.service');

/**
 * Bridge controller for API endpoints
 */
const bridgeController = {
  /**
   * Send a message across chains
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  sendMessage: async (req, res) => {
    try {
      const { sourceChain, targetChain, messageData } = req.body;
      
      // Create a message ID
      const messageId = `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      // Create bridge message in database
      const bridgeMessage = await BridgeMessage.create({
        messageId,
        sourceChain,
        targetChain,
        messageData
      });
      
      // If Polygon Amoy is involved, use the appropriate service
      let blockchainResult = null;
      if (sourceChain === 'polygon-amoy' && polygonAmoyService.crossChainBridgeContract) {
        try {
          blockchainResult = await polygonAmoyService.sendCrossChainMessage({
            targetChain,
            data: messageData
          });
          
          // Update with transaction hash if available
          if (blockchainResult && blockchainResult.transactionHash) {
            await BridgeMessage.updateStatus(messageId, 'sent');
          }
        } catch (blockchainError) {
          console.error('Error sending cross-chain message on blockchain:', blockchainError);
          // Continue with database message even if blockchain message fails
        }
      }
      
      return res.status(201).json({
        success: true,
        message: 'Bridge message sent',
        data: {
          message: bridgeMessage,
          blockchain: blockchainResult
        }
      });
    } catch (error) {
      console.error('Error sending bridge message:', error);
      return res.status(500).json({
        success: false,
        message: 'Error sending bridge message',
        error: error.message
      });
    }
  },
  
  /**
   * Get bridge message by ID
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  getById: async (req, res) => {
    try {
      const { messageId } = req.params;
      
      const message = await BridgeMessage.findById(messageId);
      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'Bridge message not found'
        });
      }
      
      return res.status(200).json({
        success: true,
        data: message
      });
    } catch (error) {
      console.error('Error getting bridge message:', error);
      return res.status(500).json({
        success: false,
        message: 'Error retrieving bridge message',
        error: error.message
      });
    }
  },
  
  /**
   * Get bridge messages by source and target chains
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  getByChains: async (req, res) => {
    try {
      const { sourceChain, targetChain } = req.params;
      
      const messages = await BridgeMessage.findByChains(sourceChain, targetChain);
      
      return res.status(200).json({
        success: true,
        data: messages
      });
    } catch (error) {
      console.error('Error getting bridge messages by chains:', error);
      return res.status(500).json({
        success: false,
        message: 'Error retrieving bridge messages',
        error: error.message
      });
    }
  },
  
  /**
   * Update bridge message status
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  updateStatus: async (req, res) => {
    try {
      const { messageId } = req.params;
      const { status } = req.body;
      
      const message = await BridgeMessage.updateStatus(messageId, status);
      
      return res.status(200).json({
        success: true,
        message: 'Bridge message status updated',
        data: message
      });
    } catch (error) {
      console.error('Error updating bridge message status:', error);
      return res.status(500).json({
        success: false,
        message: 'Error updating bridge message',
        error: error.message
      });
    }
  },
  
  /**
   * Get pending bridge messages for a target chain
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  getPendingMessages: async (req, res) => {
    try {
      const { targetChain } = req.params;
      
      const messages = await BridgeMessage.getPendingByTargetChain(targetChain);
      
      return res.status(200).json({
        success: true,
        data: messages
      });
    } catch (error) {
      console.error('Error getting pending bridge messages:', error);
      return res.status(500).json({
        success: false,
        message: 'Error retrieving pending bridge messages',
        error: error.message
      });
    }
  }
};

module.exports = bridgeController;