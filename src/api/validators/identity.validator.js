const { body, param } = require('express-validator');

/**
 * Validators for identity operations
 */
const identityValidator = {
  /**
   * Validate identity registration
   */
  validateRegisterIdentity: [
    body('address')
      .notEmpty().withMessage('Address is required')
      .matches(/^0x[a-fA-F0-9]{40}$/).withMessage('Invalid Ethereum address format'),
    body('did')
      .notEmpty().withMessage('DID is required')
      .isString().withMessage('DID must be a string'),
    body('verifiableCredential')
      .notEmpty().withMessage('Verifiable credential is required')
      .isString().withMessage('Verifiable credential must be a string')
      .custom(value => {
        try {
          JSON.parse(value);
          return true;
        } catch (error) {
          throw new Error('Verifiable credential must be a valid JSON string');
        }
      })
  ],

  /**
   * Validate identity update
   */
  validateUpdateIdentity: [
    body('did')
      .notEmpty().withMessage('DID is required')
      .isString().withMessage('DID must be a string'),
    body('tokenId')
      .notEmpty().withMessage('Token ID is required')
      .isString().withMessage('Token ID must be a string')
  ],

  /**
   * Validate adding chain identity
   */
  validateAddChainIdentity: [
    body('tokenId')
      .notEmpty().withMessage('Token ID is required')
      .isString().withMessage('Token ID must be a string'),
    body('chainId')
      .notEmpty().withMessage('Chain ID is required')
      .isString().withMessage('Chain ID must be a string'),
    body('chainAddress')
      .notEmpty().withMessage('Chain address is required')
      .isString().withMessage('Chain address must be a string')
  ],

  /**
   * Validate verify chain address
   */
  validateVerifyChainAddress: [
    body('tokenId')
      .notEmpty().withMessage('Token ID is required')
      .isString().withMessage('Token ID must be a string'),
    body('chainId')
      .notEmpty().withMessage('Chain ID is required')
      .isString().withMessage('Chain ID must be a string'),
    body('chainAddress')
      .notEmpty().withMessage('Chain address is required')
      .isString().withMessage('Chain address must be a string')
  ]
};

module.exports = identityValidator;