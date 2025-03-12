const { validationResult } = require('express-validator');

/**
 * Validation middleware
 */
const validationMiddleware = {
  /**
   * Validate request using express-validator
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next middleware
   */
  validate: (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    next();
  },
  
  /**
   * Sanitize request body
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next middleware
   */
  sanitize: (req, res, next) => {
    // Basic sanitation for request body
    if (req.body) {
      Object.keys(req.body).forEach(key => {
        if (typeof req.body[key] === 'string') {
          // Trim strings
          req.body[key] = req.body[key].trim();
          
          // Replace potentially dangerous characters
          req.body[key] = req.body[key]
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        }
      });
    }
    
    next();
  },
  
  /**
   * Validate Ethereum address format
   * @param {string} address - Ethereum address
   * @returns {boolean} Whether address is valid
   */
  isValidEthereumAddress: (address) => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  },
  
  /**
   * Validate DID format
   * @param {string} did - DID to validate
   * @returns {boolean} Whether DID is valid
   */
  isValidDID: (did) => {
    // Basic DID format validation
    return /^did:[a-z0-9]+:.+$/.test(did);
  },
  
  /**
   * Validate chain ID format
   * @param {string} chainId - Chain ID to validate
   * @returns {boolean} Whether chain ID is valid
   */
  isValidChainId: (chainId) => {
    // Add supported chain IDs
    const supportedChains = [
      'eth-mainnet',
      'eth-goerli',
      'eth-sepolia',
      'polygon-mainnet',
      'polygon-mumbai',
      'solana-mainnet',
      'solana-devnet',
      'polygon-amoy'
    ];
    
    return supportedChains.includes(chainId);
  },
  
  /**
   * Middleware for validating Ethereum address
   * @param {string} field - Field to validate
   * @returns {Function} Middleware function
   */
  validateEthereumAddress: (field) => {
    return (req, res, next) => {
      const address = req.body[field];
      
      if (!address || !validationMiddleware.isValidEthereumAddress(address)) {
        return res.status(400).json({
          success: false,
          message: `Invalid Ethereum address: ${field}`
        });
      }
      
      next();
    };
  },
  
  /**
   * Middleware for validating DID
   * @param {string} field - Field to validate
   * @returns {Function} Middleware function
   */
  validateDID: (field) => {
    return (req, res, next) => {
      const did = req.body[field];
      
      if (!did || !validationMiddleware.isValidDID(did)) {
        return res.status(400).json({
          success: false,
          message: `Invalid DID format: ${field}`
        });
      }
      
      next();
    };
  },
  
  /**
   * Middleware for validating chain ID
   * @param {string} field - Field to validate
   * @returns {Function} Middleware function
   */
  validateChainId: (field) => {
    return (req, res, next) => {
      const chainId = req.body[field];
      
      if (!chainId || !validationMiddleware.isValidChainId(chainId)) {
        return res.status(400).json({
          success: false,
          message: `Invalid or unsupported chain ID: ${field}`
        });
      }
      
      next();
    };
  }
};

module.exports = validationMiddleware;