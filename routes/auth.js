const express = require('express');
const router = express.Router();
const AuthService = require('../services/auth');
const { authenticateJWT } = require('../middleware/auth');

/**
 * Generate a challenge for wallet signature authentication
 */
router.post('/challenge', async (req, res) => {
  try {
    const { walletAddress, chain } = req.body;
    
    // Validate request
    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        message: 'Wallet address is required'
      });
    }
    
    // Initialize auth service
    const db = req.app.get('db');
    const redis = req.app.get('redis');
    const authService = new AuthService(db, redis);
    
    // Generate the challenge
    const challenge = await authService.generateChallenge(walletAddress, chain || 'polygon');
    
    res.status(200).json({
      success: true,
      walletAddress,
      challenge,
      chain: chain || 'polygon'
    });
  } catch (error) {
    console.error('Error generating auth challenge:', error);
    res.status(500).json({
      success: false,
      message: `Failed to generate challenge: ${error.message}`
    });
  }
});

/**
 * Verify a signature and authenticate the user
 */
router.post('/verify', async (req, res) => {
  try {
    const { walletAddress, signature, chain } = req.body;
    
    // Validate request
    if (!walletAddress || !signature) {
      return res.status(400).json({
        success: false,
        message: 'Wallet address and signature are required'
      });
    }
    
    // Initialize auth service
    const db = req.app.get('db');
    const redis = req.app.get('redis');
    const authService = new AuthService(db, redis);
    
    // Collect metadata for auditing
    const metadata = {
      ip: req.ip,
      userAgent: req.headers['user-agent']
    };
    
    // Verify the signature
    const result = await authService.verifySignature(
      walletAddress,
      signature,
      chain || 'polygon',
      metadata
    );
    
    if (!result.authenticated) {
      return res.status(401).json({
        success: false,
        message: `Authentication failed: ${result.error || 'Invalid signature'}`
      });
    }
    
    // Log successful authentication
    const logQuery = `
      INSERT INTO audit_logs (
        user_id, action, resource_type, resource_id, metadata, ip_address, user_agent
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    
    await db.query(logQuery, [
      result.user.id,
      'USER_LOGIN',
      'AUTH_SESSION',
      walletAddress,
      JSON.stringify({ chain: chain || 'polygon' }),
      req.ip,
      req.headers['user-agent']
    ]);
    
    res.status(200).json({
      success: true,
      token: result.token,
      user: {
        id: result.user.id,
        walletAddress: result.user.walletAddress,
        did: result.user.did,
        chain: result.user.chain
      },
      message: 'Authentication successful'
    });
  } catch (error) {
    console.error('Error verifying signature:', error);
    res.status(500).json({
      success: false,
      message: `Authentication failed: ${error.message}`
    });
  }
});

/**
 * Logout (revoke the token)
 */
router.post('/logout', authenticateJWT, async (req, res) => {
  try {
    const token = req.headers.authorization.split(' ')[1];
    
    // Initialize auth service
    const db = req.app.get('db');
    const redis = req.app.get('redis');
    const authService = new AuthService(db, redis);
    
    // Revoke the token
    const success = await authService.revokeToken(token);
    
    if (success) {
      // Log logout
      const logQuery = `
        INSERT INTO audit_logs (
          user_id, action, resource_type, resource_id, ip_address, user_agent
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `;
      
      await db.query(logQuery, [
        req.user.id,
        'USER_LOGOUT',
        'AUTH_SESSION',
        req.user.walletAddress,
        req.ip,
        req.headers['user-agent']
      ]);
      
      res.status(200).json({
        success: true,
        message: 'Logged out successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Failed to logout'
      });
    }
  } catch (error) {
    console.error('Error logging out:', error);
    res.status(500).json({
      success: false,
      message: `Logout failed: ${error.message}`
    });
  }
});

/**
 * Get current user profile
 */
router.get('/profile', authenticateJWT, async (req, res) => {
  try {
    // Initialize services
    const db = req.app.get('db');
    
    // Get user details
    const query = `
      SELECT u.id, u.wallet_address, u.did, u.created_at,
        (SELECT COUNT(*) FROM credentials WHERE subject_did = u.did) AS credential_count
      FROM users u
      WHERE u.id = $1
    `;
    
    const result = await db.query(query, [req.user.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const user = result.rows[0];
    
    // Get user roles
    const rolesQuery = `
      SELECT r.name, r.description, ur.chain_id
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = $1 AND ur.is_active = true
    `;
    
    const rolesResult = await db.query(rolesQuery, [req.user.id]);
    
    // Get chain identities
    const chainQuery = `
      SELECT chain_id, address, created_at
      FROM chain_identities
      WHERE did = $1 AND is_active = true
    `;
    
    const chainResult = user.did ? await db.query(chainQuery, [user.did]) : { rows: [] };
    
    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        walletAddress: user.wallet_address,
        did: user.did,
        createdAt: user.created_at,
        credentialCount: parseInt(user.credential_count),
        roles: rolesResult.rows,
        chainIdentities: chainResult.rows
      }
    });
  } catch (error) {
    console.error('Error getting user profile:', error);
    res.status(500).json({
      success: false,
      message: `Failed to get profile: ${error.message}`
    });
  }
});

/**
 * Check if token is valid
 */
router.get('/validate', authenticateJWT, async (req, res) => {
  // If middleware passed, token is valid
  res.status(200).json({
    success: true,
    user: {
      id: req.user.id,
      walletAddress: req.user.walletAddress,
      did: req.user.did
    },
    message: 'Token is valid'
  });
});

module.exports = router;