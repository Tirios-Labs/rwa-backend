/**
 * Request validation middleware for the Identity Bridge API
 */
const { body, param, query, validationResult } = require('express-validator');
const { ValidationError } = require('./error');
const didUtils = require('../utils/did');

/**
 * Process validation errors and convert to a standardized format
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (errors.isEmpty()) {
    return next();
  }
  
  // Format validation errors
  const formattedErrors = errors.array().map(error => ({
    field: error.param,
    message: error.msg,
    value: error.value
  }));
  
  // Create a validation error
  const validationError = new ValidationError(
    'Validation failed',
    formattedErrors
  );
  
  next(validationError);
};

/**
 * Common validation rules
 */
const rules = {
  // DID validation rules
  did: () => param('did')
    .trim()
    .notEmpty().withMessage('DID is required')
    .custom(value => {
      if (!didUtils.isValidDID(value)) {
        throw new Error('Invalid DID format');
      }
      return true;
    }),
  
  // Wallet address validation
  walletAddress: (field = 'walletAddress') => body(field)
    .trim()
    .notEmpty().withMessage('Wallet address is required')
    .custom(value => {
      // For Ethereum/Polygon addresses
      if (value.startsWith('0x')) {
        if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
          throw new Error('Invalid Ethereum address format');
        }
      } 
      // For Solana addresses
      else {
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) {
          throw new Error('Invalid Solana address format');
        }
      }
      return true;
    }),
  
  // Blockchain chain validation
  chain: (field = 'chain') => body(field)
    .optional()
    .trim()
    .isIn(['polygon', 'ethereum', 'solana']).withMessage('Unsupported blockchain'),
  
  // Credential hash validation
  credentialHash: () => param('credentialHash')
    .trim()
    .notEmpty().withMessage('Credential hash is required')
    .matches(/^(0x)?[a-fA-F0-9]{64}$/).withMessage('Invalid credential hash format'),
  
  // Pagination validation
  pagination: () => [
    query('page')
      .optional()
      .isInt({ min: 1 }).withMessage('Page must be a positive integer')
      .toInt(),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
      .toInt()
  ],
  
  // UUID validation
  uuid: (paramName) => param(paramName)
    .trim()
    .notEmpty().withMessage(`${paramName} is required`)
    .matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    .withMessage(`Invalid ${paramName} format`),
};

/**
 * Validation schemas for different API endpoints
 */
const schemas = {
  // Authentication
  auth: {
    challenge: [
      rules.walletAddress(),
      rules.chain(),
      validate
    ],
    
    verify: [
      rules.walletAddress(),
      body('signature')
        .trim()
        .notEmpty().withMessage('Signature is required'),
      rules.chain(),
      validate
    ]
  },
  
  // DID operations
  did: {
    createDID: [
      rules.walletAddress(),
      rules.chain(),
      validate
    ],
    
    getDID: [
      rules.did(),
      validate
    ],
    
    updateDID: [
      rules.did(),
      body('updates')
        .isObject().withMessage('Updates must be an object'),
      validate
    ],
    
    addController: [
      rules.did(),
      body('controllerDid')
        .trim()
        .notEmpty().withMessage('Controller DID is required')
        .custom(value => {
          if (!didUtils.isValidDID(value)) {
            throw new Error('Invalid controller DID format');
          }
          return true;
        }),
      validate
    ],
    
    addChainIdentity: [
      rules.did(),
      body('chain')
        .trim()
        .notEmpty().withMessage('Chain is required')
        .isIn(['polygon', 'ethereum', 'solana']).withMessage('Unsupported blockchain'),
      body('address')
        .trim()
        .notEmpty().withMessage('Address is required'),
      validate
    ]
  },
  
  // Credential operations
  credential: {
    issueCredential: [
      body('issuerDid')
        .trim()
        .notEmpty().withMessage('Issuer DID is required')
        .custom(value => {
          if (!didUtils.isValidDID(value)) {
            throw new Error('Invalid issuer DID format');
          }
          return true;
        }),
      body('subjectDid')
        .trim()
        .notEmpty().withMessage('Subject DID is required')
        .custom(value => {
          if (!didUtils.isValidDID(value)) {
            throw new Error('Invalid subject DID format');
          }
          return true;
        }),
      body('claims')
        .isObject().withMessage('Claims must be an object')
        .notEmpty().withMessage('Claims cannot be empty'),
      body('type')
        .optional()
        .isString().withMessage('Type must be a string'),
      body('expirationDate')
        .optional()
        .isISO8601().withMessage('Expiration date must be in ISO format'),
      validate
    ],
    
    verifyCredential: [
      body('credentialHash')
        .optional()
        .matches(/^(0x)?[a-fA-F0-9]{64}$/).withMessage('Invalid credential hash format'),
      body('ipfsCid')
        .optional()
        .isString().withMessage('IPFS CID must be a string'),
      validate
    ],
    
    revokeCredential: [
      body('credentialHash')
        .trim()
        .notEmpty().withMessage('Credential hash is required')
        .matches(/^(0x)?[a-fA-F0-9]{64}$/).withMessage('Invalid credential hash format'),
      body('reason')
        .optional()
        .isString().withMessage('Reason must be a string'),
      validate
    ],
    
    getCredential: [
      rules.credentialHash(),
      validate
    ],
    
    listCredentials: [
      param('did')
        .trim()
        .notEmpty().withMessage('DID is required')
        .custom(value => {
          if (!didUtils.isValidDID(value)) {
            throw new Error('Invalid DID format');
          }
          return true;
        }),
      query('status')
        .optional()
        .isIn(['ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED']).withMessage('Invalid status'),
      ...rules.pagination(),
      validate
    ]
  },
  
  // Admin operations
  admin: {
    assignRole: [
      rules.uuid('userId'),
      body('roleName')
        .trim()
        .notEmpty().withMessage('Role name is required'),
      body('chainId')
        .optional()
        .isString().withMessage('Chain ID must be a string'),
      validate
    ],
    
    sendCrossChainMessage: [
      body('targetChain')
        .trim()
        .notEmpty().withMessage('Target chain is required'),
      body('messageType')
        .trim()
        .notEmpty().withMessage('Message type is required')
        .isIn(['VERIFICATION', 'CREDENTIAL', 'ROLE_SYNC', 'CUSTOM']).withMessage('Invalid message type'),
      body('data')
        .isObject().withMessage('Data must be an object'),
      validate
    ],
    
    approveKYC: [
      rules.uuid('verificationId'),
      validate
    ]
  },
  
  // KYC operations
  kyc: {
    initVerification: [
      body('level')
        .trim()
        .notEmpty().withMessage('Verification level is required')
        .isIn(['BASIC', 'ADVANCED', 'BUSINESS']).withMessage('Invalid verification level'),
      body('provider')
        .optional()
        .isString().withMessage('Provider must be a string'),
      body('userData')
        .isObject().withMessage('User data must be an object')
        .custom(value => {
          if (!value.firstName || !value.lastName) {
            throw new Error('First name and last name are required');
          }
          return true;
        }),
      validate
    ]
  }
};

module.exports = {
  validate,
  rules,
  schemas
};