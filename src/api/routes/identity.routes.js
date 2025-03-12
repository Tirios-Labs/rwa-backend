const express = require('express');
const router = express.Router();
const identityController = require('../controllers/identity.controller');
const identityValidator = require('../validators/identity.validator');
const authMiddleware = require('../middleware/auth.middleware');

/**
 * @route   POST /api/identity/register
 * @desc    Register a new identity
 * @access  Public
 */
router.post(
  '/register',
  identityValidator.validateRegisterIdentity,
  identityController.register
);

/**
 * @route   POST /api/identity/update
 * @desc    Update an identity with token ID
 * @access  Public
 */
router.post(
  '/update',
  identityValidator.validateUpdateIdentity,
  identityController.update
);

/**
 * @route   POST /api/identity/chain
 * @desc    Add a chain identity
 * @access  Public
 */
router.post(
  '/chain',
  identityValidator.validateAddChainIdentity,
  identityController.addChainIdentity
);

/**
 * @route   GET /api/identity/did/:did
 * @desc    Get identity by DID
 * @access  Public
 */
router.get(
  '/did/:did',
  identityController.getByDID
);

/**
 * @route   GET /api/identity/token/:tokenId
 * @desc    Get identity by token ID
 * @access  Public
 */
router.get(
  '/token/:tokenId',
  identityController.getByTokenId
);

/**
 * @route   POST /api/identity/verify-chain
 * @desc    Verify identity chain address
 * @access  Protected
 */
router.post(
  '/verify-chain',
  authMiddleware.authenticate,
  authMiddleware.authorize(['verifier', 'admin']),
  identityValidator.validateVerifyChainAddress,
  identityController.verifyChainAddress
);

/**
 * @route   GET /api/identity/chain/:tokenId
 * @desc    Get all chain identities for a token
 * @access  Public
 */
router.get(
  '/chain/:tokenId',
  identityController.getChainIdentities
);

module.exports = router;