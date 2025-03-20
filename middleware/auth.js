/**
 * Authentication middleware for the Identity Bridge API
 */
const jwt = require('jsonwebtoken');
const { AuthorizationError, ForbiddenError } = require('./error');
const RoleModel = require('../models/role');
const DIDModel = require('../models/did');

/**
 * Middleware to verify JWT token and add user to request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authenticateJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return next(new AuthorizationError('Authentication required'));
    }
    
    const parts = authHeader.split(' ');
    
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return next(new AuthorizationError('Invalid authentication format'));
    }
    
    const token = parts[1];
    
    // Verify token
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      
      // Check if token is revoked or session is invalid
      const db = req.app.get('db');
      const query = `
        SELECT s.id, s.expires_at, u.wallet_address, u.did
        FROM auth_sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = $1
      `;
      
      const result = await db.query(query, [token]);
      
      if (result.rows.length === 0) {
        throw new Error('Session not found or revoked');
      }
      
      const { expires_at, wallet_address, did } = result.rows[0];
      
      // Check expiration
      if (new Date(expires_at) < new Date()) {
        throw new Error('Session expired');
      }
      
      // Add user to request
      req.user = {
        id: decoded.sub,
        walletAddress: wallet_address,
        did,
        chain: decoded.chain || 'polygon'
      };
      
      next();
    } catch (error) {
      return next(new AuthorizationError(`Invalid or expired token: ${error.message}`));
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to check if user has a specific role
 * @param {String} roleName - Role name to check
 * @returns {Function} - Express middleware
 */
const hasRole = (roleName) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return next(new AuthorizationError('Authentication required'));
      }
      
      const db = req.app.get('db');
      const roleModel = new RoleModel(db);
      
      // Get chain ID if specified in query
      const chainId = req.query.chainId || null;
      
      // Check if user has the required role
      const hasRequiredRole = await roleModel.userHasRole(req.user.id, roleName, chainId);
      
      if (!hasRequiredRole) {
        return next(new ForbiddenError(`Requires role: ${roleName}`));
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to check if user owns a DID
 * @param {Function} didExtractor - Function to extract DID from request
 * @returns {Function} - Express middleware
 */
const ownsDID = (didExtractor) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return next(new AuthorizationError('Authentication required'));
      }
      
      // Extract the DID from the request
      const did = typeof didExtractor === 'function' ? didExtractor(req) : didExtractor;
      
      if (!did) {
        return next(new ForbiddenError('Invalid DID'));
      }
      
      // If user has the same DID, allow access
      if (req.user.did === did) {
        return next();
      }
      
      // Check if the user controls this DID
      const db = req.app.get('db');
      const didModel = new DIDModel(db);
      
      // Check if the user's DID is a controller of the target DID
      if (req.user.did) {
        const isController = await didModel.isControlledBy(did, req.user.did);
        if (isController) {
          return next();
        }
      }
      
      // Check if the user's wallet address is associated with the DID
      const controlsWallet = await checkWalletControl(db, did, req.user.walletAddress);
      
      if (controlsWallet) {
        return next();
      }
      
      return next(new ForbiddenError('Not authorized to access this DID'));
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check if a wallet address controls a DID
 * @param {Object} db - Database instance
 * @param {String} did - The DID to check
 * @param {String} walletAddress - Wallet address to check
 * @returns {Promise<Boolean>} - Whether wallet controls DID
 */
const checkWalletControl = async (db, did, walletAddress) => {
  try {
    // Check direct wallet association
    const userQuery = `
      SELECT id FROM users
      WHERE did = $1 AND wallet_address = $2
    `;
    
    const userResult = await db.query(userQuery, [did, walletAddress]);
    if (userResult.rows.length > 0) {
      return true;
    }
    
    // Check chain identity match
    const chainQuery = `
      SELECT id FROM chain_identities
      WHERE did = $1 AND address = $2 AND is_active = true
    `;
    
    const chainResult = await db.query(chainQuery, [did, walletAddress]);
    if (chainResult.rows.length > 0) {
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error checking wallet control:', error);
    return false;
  }
};

/**
 * Middleware to rate limit requests
 * @param {Object} options - Rate limiting options
 * @returns {Function} - Express middleware
 */
const rateLimit = (options = {}) => {
  const {
    windowMs = 60 * 1000, // 1 minute by default
    max = 100, // 100 requests per windowMs by default
    message = 'Too many requests, please try again later.',
    keyGenerator = (req) => req.ip,
    skip = () => false
  } = options;
  
  const requests = new Map();
  
  // Clean up the requests map periodically
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [key, data] of requests.entries()) {
      if (now - data.start > windowMs) {
        requests.delete(key);
      }
    }
  }, windowMs);
  
  // Ensure the interval is cleared when the process exits
  if (interval.unref) interval.unref();
  
  return (req, res, next) => {
    try {
      // Skip rate limiting if the skip function returns true
      if (skip(req)) {
        return next();
      }
      
      const key = keyGenerator(req);
      const now = Date.now();
      
      // Get or initialize request data
      if (!requests.has(key)) {
        requests.set(key, {
          count: 0,
          start: now
        });
      }
      
      const data = requests.get(key);
      
      // Reset if window has expired
      if (now - data.start > windowMs) {
        data.count = 0;
        data.start = now;
      }
      
      // Increment request count
      data.count++;
      
      // Check if rate limit is exceeded
      if (data.count > max) {
        return res.status(429).json({
          success: false,
          error: {
            type: 'RATE_LIMIT',
            message,
            status: 429,
            retryAfter: Math.ceil((data.start + windowMs - now) / 1000)
          }
        });
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };

  function isAdmin(req, res, next) {
    if (!req.user || !req.user.roles.some(r => r.name === 'ADMIN')) {
      return res.status(403).json({ error: 'Admin access required' });  
    }
    next();
  }
};

module.exports = {
  authenticateJWT,
  hasRole,
  ownsDID,
  rateLimit,
};