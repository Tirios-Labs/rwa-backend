const express = require('express');
const router = express.Router();
const kycController = require('../controllers/kycController');
const { authenticateJWT } = require('../middleware/auth');

// Get all verifications for a user
router.get('/verifications', authenticateJWT, kycController.getUserVerifications);

// Initialize verification and get SDK token
router.post('/init-verification', authenticateJWT, kycController.initVerification);

// Get verification status
router.get('/verifications/:verificationId', authenticateJWT, kycController.getVerificationStatus);

// Webhook endpoint for Onfido events - use express.raw middleware
router.post('/webhook', express.raw({ type: 'application/json' }), kycController.handleWebhook);

module.exports = router;