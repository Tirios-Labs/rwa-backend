const express = require('express');
const router = express.Router();
const verificationController = require('../controllers/verification.controller');
const authMiddleware = require('../middleware/auth.middleware');

/**
 * @route   POST /api/verification/request
 * @desc    Request a verification
 * @access  Public
 */
router.post(
  '/request',
  verificationController.requestVerification
);

/**
 * @route   GET /api/verification/request/:requestId
 * @desc    Get verification request by ID
 * @access  Public
 */
router.get(
  '/request/:requestId',
  verificationController.getById
);

/**
 * @route   GET /api/verification/did/:did
 * @desc    Get all verification requests for a DID
 * @access  Public
 */
router.get(
  '/did/:did',
  verificationController.getByDID
);

/**
 * @route   PUT /api/verification/status/:requestId
 * @desc    Update verification request status
 * @access  Protected
 */
router.put(
  '/status/:requestId',
  authMiddleware.authenticate,
  verificationController.updateStatus
);

/**
 * @route   POST /api/verification/complete/:requestId
 * @desc    Complete a verification request
 * @access  Protected
 */
router.post(
  '/complete/:requestId',
  authMiddleware.authenticate,
  authMiddleware.authorize(['verifier', 'admin']),
  verificationController.completeVerification
);

/**
 * @route   GET /api/verification/pending
 * @desc    Get all pending verification requests
 * @access  Protected
 */
router.get(
  '/pending',
  authMiddleware.authenticate,
  authMiddleware.authorize(['verifier', 'admin']),
  verificationController.getPendingRequests
);

module.exports = router;