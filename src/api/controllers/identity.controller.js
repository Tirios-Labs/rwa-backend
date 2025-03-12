const identityService = require('../../services/identity/soulbound.service');
const { validationResult } = require('express-validator');

/**
 * Identity controller for handling identity-related operations
 */
class IdentityController {
  /**
   * Register a new identity
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next middleware
   */
  async register(req, res, next) {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false, 
          message: 'Validation failed', 
          errors: errors.array() 
        });
      }

      const { address, did, verifiableCredential } = req.body;

      // Register identity
      const result = await identityService.registerIdentity({
        address,
        did,
        verifiableCredential
      });

      return res.status(201).json({
        success: true,
        message: 'Identity registered successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update an identity with token ID
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next middleware
   */
  async update(req, res, next) {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false, 
          message: 'Validation failed', 
          errors: errors.array() 
        });
      }

      const { did, tokenId } = req.body;

      // Update identity
      const result = await identityService.updateIdentity(did, tokenId);

      return res.status(200).json({
        success: true,
        message: 'Identity updated successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Add a chain identity
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next middleware
   */
  async addChainIdentity(req, res, next) {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false, 
          message: 'Validation failed', 
          errors: errors.array() 
        });
      }

      const { tokenId, chainId, chainAddress } = req.body;

      // Add chain identity
      const result = await identityService.addChainIdentity(tokenId, chainId, chainAddress);

      return res.status(201).json({
        success: true,
        message: 'Chain identity added successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get identity by DID
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next middleware
   */
  async getByDID(req, res, next) {
    try {
      const { did } = req.params;

      // Get identity
      const identity = await identityService.getIdentityByDID(did);

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
      next(error);
    }
  }

  /**
   * Get identity by token ID
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next middleware
   */
  async getByTokenId(req, res, next) {
    try {
      const { tokenId } = req.params;

      // Get identity
      const identity = await identityService.getIdentityByTokenId(tokenId);

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
      next(error);
    }
  }

  /**
   * Verify identity chain address
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next middleware
   */
  async verifyChainAddress(req, res, next) {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false, 
          message: 'Validation failed', 
          errors: errors.array() 
        });
      }

      const { tokenId, chainId, chainAddress } = req.body;

      // Verify chain address
      const result = await identityService.verifyChainAddress(tokenId, chainId, chainAddress);

      return res.status(200).json({
        success: true,
        message: 'Chain address verification completed',
        data: {
          isVerified: result,
          tokenId,
          chainId,
          chainAddress
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all chain identities for a token
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next middleware
   */
  async getChainIdentities(req, res, next) {
    try {
      const { tokenId } = req.params;

      // Get chain identities
      const chainIdentities = await identityService.getChainIdentities(tokenId);

      return res.status(200).json({
        success: true,
        data: chainIdentities
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new IdentityController();