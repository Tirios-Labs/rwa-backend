const jwt = require('jsonwebtoken');
const { pool } = require('../../config/database.config');

/**
 * Authentication middleware
 */
const authMiddleware = {
  /**
   * Authenticate user with JWT token
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next middleware
   */
  authenticate: async (req, res, next) => {
    try {
      // Get token from Authorization header
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      
      const token = authHeader.split(' ')[1];
      
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Check if user exists
      const result = await pool.query(
        'SELECT * FROM users WHERE id = $1 AND is_active = true',
        [decoded.id]
      );
      
      if (result.rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'User not found or inactive'
        });
      }
      
      // Add user to request
      req.user = {
        id: result.rows[0].id,
        username: result.rows[0].username,
        email: result.rows[0].email,
        role: result.rows[0].role
      };
      
      next();
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token'
        });
      }
      
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expired'
        });
      }
      
      console.error('Authentication error:', error);
      return res.status(500).json({
        success: false,
        message: 'Authentication error'
      });
    }
  },
  
  /**
   * Authorize user roles
   * @param {Array} roles - Allowed roles
   * @returns {Function} Middleware function
   */
  authorize: (roles) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }
      
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized access'
        });
      }
      
      next();
    };
  },
  
  /**
   * Check if user is admin
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next middleware
   */
  isAdmin: (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }
    
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    
    next();
  },
  
  /**
   * Check if user is verifier
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next middleware
   */
  isVerifier: (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }
    
    if (req.user.role !== 'verifier' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Verifier access required'
      });
    }
    
    next();
  }
};

module.exports = authMiddleware;