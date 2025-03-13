const express = require('express');
const router = express.Router();
const bridgeController = require('../controllers/bridge.controller');
const authMiddleware = require('../middleware/auth.middleware');

/**
 * @route   POST /api/bridge/message
 * @desc    Send a cross-chain message
 * @access  Public
 */
router.post(
  '/message',
  bridgeController.sendMessage
);

/**
 * @route   GET /api/bridge/message/:messageId
 * @desc    Get bridge message by ID
 * @access  Public
 */
router.get(
  '/message/:messageId',
  bridgeController.getById
);

/**
 * @route   GET /api/bridge/chains/:sourceChain/:targetChain
 * @desc    Get all bridge messages between chains
 * @access  Public
 */
router.get(
  '/chains/:sourceChain/:targetChain',
  bridgeController.getByChains
);

/**
 * @route   PUT /api/bridge/status/:messageId
 * @desc    Update bridge message status
 * @access  Protected
 */
router.put(
  '/status/:messageId',
  authMiddleware.authenticate,
  bridgeController.updateStatus
);

/**
 * @route   GET /api/bridge/pending/:targetChain
 * @desc    Get all pending bridge messages for a target chain
 * @access  Public
 */
router.get(
  '/pending/:targetChain',
  bridgeController.getPendingMessages
);

module.exports = router;