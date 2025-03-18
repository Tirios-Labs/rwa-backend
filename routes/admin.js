const express = require('express');
const router = express.Router();
const { hasRole } = require('../middleware/auth');
const { ValidationError } = require('../middleware/error');
const DIDService = require('../services/did');
const ipfsService = require('../services/ipfs');
const KYCService = require('../services/kyc');

/**
 * Administrator-only routes protected by the ADMIN role
 */

// Get system statistics
router.get('/stats', hasRole('ADMIN'), async (req, res) => {
  try {
    const db = req.app.get('db');
    
    // Get user count
    const userQuery = `SELECT COUNT(*) as count FROM users`;
    const userResult = await db.query(userQuery);
    
    // Get DID count
    const didQuery = `SELECT COUNT(*) as count FROM users WHERE did IS NOT NULL`;
    const didResult = await db.query(didQuery);
    
    // Get credential count
    const credentialQuery = `SELECT COUNT(*) as count FROM credentials`;
    const credentialResult = await db.query(credentialQuery);
    
    // Get active verification count
    const verificationQuery = `
      SELECT COUNT(*) as count FROM kyc_verifications 
      WHERE status = 'PENDING' OR status = 'IN_PROGRESS'
    `;
    const verificationResult = await db.query(verificationQuery);
    
    // Get today's stats
    const todayQuery = `
      SELECT 
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '24 HOURS' THEN 1 END) as users_today,
        COUNT(CASE WHEN did IS NOT NULL AND created_at >= NOW() - INTERVAL '24 HOURS' THEN 1 END) as dids_today
      FROM users
    `;
    const todayResult = await db.query(todayQuery);
    
    res.status(200).json({
      success: true,
      stats: {
        users: {
          total: parseInt(userResult.rows[0].count),
          today: parseInt(todayResult.rows[0].users_today || 0)
        },
        dids: {
          total: parseInt(didResult.rows[0].count),
          today: parseInt(todayResult.rows[0].dids_today || 0)
        },
        credentials: {
          total: parseInt(credentialResult.rows[0].count)
        },
        verifications: {
          active: parseInt(verificationResult.rows[0].count)
        }
      }
    });
  } catch (error) {
    console.error('Error getting admin stats:', error);
    res.status(500).json({
      success: false,
      message: `Failed to get stats: ${error.message}`
    });
  }
});

/**
 * User management
 */

// List users
router.get('/users', hasRole('ADMIN'), async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (page - 1) * limit;
    
    const db = req.app.get('db');
    
    let query = `
      SELECT u.id, u.wallet_address, u.did, u.created_at, u.updated_at,
        (SELECT COUNT(*) FROM credentials WHERE subject_did = u.did) as credential_count
      FROM users u
    `;
    
    const params = [];
    
    // Add search condition if provided
    if (search) {
      query += ` WHERE u.wallet_address ILIKE $1 OR u.did ILIKE $1`;
      params.push(`%${search}%`);
    }
    
    // Add pagination
    query += ` ORDER BY u.created_at DESC LIMIT ${params.length + 1} OFFSET ${params.length + 2}`;
    params.push(limit, offset);
    
    const result = await db.query(query, params);
    
    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) FROM users`;
    if (search) {
      countQuery += ` WHERE wallet_address ILIKE $1 OR did ILIKE $1`;
    }
    
    const countResult = await db.query(countQuery, search ? [`%${search}%`] : []);
    const total = parseInt(countResult.rows[0].count);
    
    res.status(200).json({
      success: true,
      users: result.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({
      success: false,
      message: `Failed to list users: ${error.message}`
    });
  }
});

// Get user details
router.get('/users/:userId', hasRole('ADMIN'), async (req, res) => {
  try {
    const { userId } = req.params;
    const db = req.app.get('db');
    
    // Get user details
    const userQuery = `
      SELECT u.id, u.wallet_address, u.did, u.created_at, u.updated_at
      FROM users u
      WHERE u.id = $1
    `;
    
    const userResult = await db.query(userQuery, [userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const user = userResult.rows[0];
    
    // Get user roles
    const rolesQuery = `
      SELECT r.name, r.description, ur.chain_id
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = $1 AND ur.is_active = true
    `;
    
    const rolesResult = await db.query(rolesQuery, [userId]);
    
    // Get chain identities
    const chainQuery = `
      SELECT chain_id, address, created_at
      FROM chain_identities
      WHERE did = $1 AND is_active = true
    `;
    
    const chainResult = user.did ? await db.query(chainQuery, [user.did]) : { rows: [] };
    
    // Get credentials
    const credentialQuery = `
      SELECT 
        credential_hash, issuer_did, credential_type, status, issuance_date
      FROM credentials
      WHERE subject_did = $1
      ORDER BY issuance_date DESC
      LIMIT 10
    `;
    
    const credentialResult = user.did ? await db.query(credentialQuery, [user.did]) : { rows: [] };
    
    // Get KYC verifications
    const kycQuery = `
      SELECT id, verification_level, provider, status, submitted_at, verified_at
      FROM kyc_verifications
      WHERE user_id = $1
      ORDER BY submitted_at DESC
    `;
    
    const kycResult = await db.query(kycQuery, [userId]);
    
    res.status(200).json({
      success: true,
      user: {
        ...user,
        roles: rolesResult.rows,
        chainIdentities: chainResult.rows,
        credentials: credentialResult.rows,
        verifications: kycResult.rows
      }
    });
  } catch (error) {
    console.error('Error getting user details:', error);
    res.status(500).json({
      success: false,
      message: `Failed to get user details: ${error.message}`
    });
  }
});

/**
 * Role management
 */

// List all roles
router.get('/roles', hasRole('ADMIN'), async (req, res) => {
  try {
    const db = req.app.get('db');
    
    const query = `
      SELECT id, name, description, created_at,
        (SELECT COUNT(*) FROM user_roles WHERE role_id = roles.id AND is_active = true) as user_count
      FROM roles
      ORDER BY name
    `;
    
    const result = await db.query(query);
    
    res.status(200).json({
      success: true,
      roles: result.rows
    });
  } catch (error) {
    console.error('Error listing roles:', error);
    res.status(500).json({
      success: false,
      message: `Failed to list roles: ${error.message}`
    });
  }
});

// Create a new role
router.post('/roles', hasRole('ADMIN'), async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      throw new ValidationError('Role name is required');
    }
    
    const db = req.app.get('db');
    
    // Check if role already exists
    const checkQuery = `SELECT id FROM roles WHERE name = $1`;
    const checkResult = await db.query(checkQuery, [name]);
    
    if (checkResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Role '${name}' already exists`
      });
    }
    
    // Create the role
    const insertQuery = `
      INSERT INTO roles (name, description)
      VALUES ($1, $2)
      RETURNING id, name, description, created_at
    `;
    
    const result = await db.query(insertQuery, [name, description || null]);
    
    res.status(201).json({
      success: true,
      role: result.rows[0],
      message: 'Role created successfully'
    });
  } catch (error) {
    console.error('Error creating role:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: `Failed to create role: ${error.message}`
    });
  }
});

// Assign role to user
router.post('/users/:userId/roles', hasRole('ADMIN'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { roleName, chainId } = req.body;
    
    if (!roleName) {
      throw new ValidationError('Role name is required');
    }
    
    const db = req.app.get('db');
    
    // Check if user exists
    const userQuery = `SELECT id FROM users WHERE id = $1`;
    const userResult = await db.query(userQuery, [userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Get the role ID
    const roleQuery = `SELECT id FROM roles WHERE name = $1`;
    const roleResult = await db.query(roleQuery, [roleName]);
    
    if (roleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Role '${roleName}' not found`
      });
    }
    
    const roleId = roleResult.rows[0].id;
    
    // Assign the role
    const insertQuery = `
      INSERT INTO user_roles (user_id, role_id, chain_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, role_id, chain_id) 
      DO UPDATE SET is_active = true, assigned_at = NOW()
      RETURNING user_id, role_id, chain_id, assigned_at
    `;
    
    const result = await db.query(insertQuery, [
      userId, 
      roleId, 
      chainId || 'global'
    ]);
    
    // Log the action
    const logQuery = `
      INSERT INTO audit_logs (
        user_id, action, resource_type, resource_id, metadata, ip_address, user_agent
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    
    await db.query(logQuery, [
      req.user.id,
      'ASSIGN_ROLE',
      'USER_ROLE',
      userId,
      JSON.stringify({ roleName, chainId }),
      req.ip,
      req.headers['user-agent']
    ]);
    
    res.status(200).json({
      success: true,
      assignment: {
        userId,
        roleName,
        chainId: chainId || 'global',
        assignedAt: result.rows[0].assigned_at
      },
      message: `Role '${roleName}' assigned successfully`
    });
  } catch (error) {
    console.error('Error assigning role:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: `Failed to assign role: ${error.message}`
    });
  }
});

/**
 * Credential management
 */

// List credentials with filtering
router.get('/credentials', hasRole('ADMIN'), async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type, issuer, subject } = req.query;
    const offset = (page - 1) * limit;
    
    const db = req.app.get('db');
    
    let query = `
      SELECT 
        credential_hash, issuer_did, subject_did, credential_type,
        credential_schema, issuance_date, expiration_date, status, ipfs_cid
      FROM credentials
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    // Add filters
    if (status) {
      query += ` AND status = ${paramIndex++}`;
      params.push(status);
    }
    
    if (type) {
      query += ` AND credential_type = ${paramIndex++}`;
      params.push(type);
    }
    
    if (issuer) {
      query += ` AND issuer_did = ${paramIndex++}`;
      params.push(issuer);
    }
    
    if (subject) {
      query += ` AND subject_did = ${paramIndex++}`;
      params.push(subject);
    }
    
    // Add pagination
    query += ` ORDER BY issuance_date DESC LIMIT ${paramIndex++} OFFSET ${paramIndex++}`;
    params.push(limit, offset);
    
    const result = await db.query(query, params);
    
    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) FROM credentials
      WHERE 1=1
    `;
    
    const countParams = [];
    let countParamIndex = 1;
    
    if (status) {
      countQuery += ` AND status = ${countParamIndex++}`;
      countParams.push(status);
    }
    
    if (type) {
      countQuery += ` AND credential_type = ${countParamIndex++}`;
      countParams.push(type);
    }
    
    if (issuer) {
      countQuery += ` AND issuer_did = ${countParamIndex++}`;
      countParams.push(issuer);
    }
    
    if (subject) {
      countQuery += ` AND subject_did = ${countParamIndex++}`;
      countParams.push(subject);
    }
    
    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);
    
    res.status(200).json({
      success: true,
      credentials: result.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error listing credentials:', error);
    res.status(500).json({
      success: false,
      message: `Failed to list credentials: ${error.message}`
    });
  }
});

/**
 * Cross-chain operations
 */

// Send a cross-chain message
router.post('/cross-chain/message', hasRole('BRIDGE_ADMIN'), async (req, res) => {
  try {
    const { targetChain, messageType, data } = req.body;
    
    if (!targetChain || !messageType) {
      throw new ValidationError('Target chain and message type are required');
    }
    
    // Get blockchain service
    const blockchainService = 
      req.user.chain === 'solana' ? 
      require('../services/solana') : 
      require('../services/polygon');
    
    // Send the message
    let result;
    switch (messageType) {
      case 'VERIFICATION':
        if (!data.did) {
          throw new ValidationError('DID is required for verification messages');
        }
        result = await blockchainService.requestVerification(data.did, targetChain);
        break;
        
      case 'CREDENTIAL':
        if (!data.credentialHash) {
          throw new ValidationError('Credential hash is required for credential messages');
        }
        result = await blockchainService.requestCredentialVerification(data.credentialHash, targetChain);
        break;
        
      case 'ROLE_SYNC':
        if (!data.role || !data.account || data.isGrant === undefined) {
          throw new ValidationError('Role, account and isGrant flag are required for role sync messages');
        }
        result = await blockchainService.syncRole(data.role, data.account, data.isGrant, targetChain);
        break;
        
      case 'CUSTOM':
        result = await blockchainService.sendCustomMessage(targetChain, JSON.stringify(data));
        break;
        
      default:
        throw new ValidationError(`Unsupported message type: ${messageType}`);
    }
    
    // Store the cross-chain message
    const db = req.app.get('db');
    const insertQuery = `
      INSERT INTO cross_chain_messages (
        message_id, message_type, source_chain, target_chain, payload, status
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;
    
    await db.query(insertQuery, [
      result.toString(), 
      messageType,
      req.user.chain || 'polygon',
      targetChain,
      JSON.stringify(data),
      'SENT'
    ]);
    
    res.status(200).json({
      success: true,
      messageId: result.toString(),
      messageType,
      targetChain,
      status: 'SENT',
      message: 'Cross-chain message sent successfully'
    });
  } catch (error) {
    console.error('Error sending cross-chain message:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: `Failed to send cross-chain message: ${error.message}`
    });
  }
});

// Get IPFS status
router.get('/ipfs/status', hasRole('ADMIN'), async (req, res) => {
  try {
    // Simple IPFS health check
    const status = await ipfsService.checkPinataStatus();
    
    res.status(200).json({
      success: true,
      ipfs: {
        provider: 'Pinata',
        status: status ? 'connected' : 'disconnected',
        apiKey: process.env.PINATA_API_KEY ? 'configured' : 'missing'
      }
    });
  } catch (error) {
    console.error('Error checking IPFS status:', error);
    res.status(500).json({
      success: false,
      message: `Failed to check IPFS status: ${error.message}`
    });
  }
});

// KYC operations
router.get('/kyc/verifications', hasRole('ADMIN'), async (req, res) => {
  try {
    const { status, provider, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    const db = req.app.get('db');
    
    let query = `
      SELECT 
        kv.id, kv.user_id, u.wallet_address, u.did,
        kv.verification_level, kv.provider, kv.status,
        kv.submitted_at, kv.verified_at
      FROM kyc_verifications kv
      JOIN users u ON kv.user_id = u.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (status) {
      query += ` AND kv.status = ${paramIndex++}`;
      params.push(status);
    }
    
    if (provider) {
      query += ` AND kv.provider = ${paramIndex++}`;
      params.push(provider);
    }
    
    query += ` ORDER BY kv.submitted_at DESC LIMIT ${paramIndex++} OFFSET ${paramIndex++}`;
    params.push(limit, offset);
    
    const result = await db.query(query, params);
    
    // Get total count
    let countQuery = `
      SELECT COUNT(*) FROM kyc_verifications kv
      WHERE 1=1
    `;
    
    const countParams = [];
    let countParamIndex = 1;
    
    if (status) {
      countQuery += ` AND kv.status = ${countParamIndex++}`;
      countParams.push(status);
    }
    
    if (provider) {
      countQuery += ` AND kv.provider = ${countParamIndex++}`;
      countParams.push(provider);
    }
    
    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);
    
    res.status(200).json({
      success: true,
      verifications: result.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error listing KYC verifications:', error);
    res.status(500).json({
      success: false,
      message: `Failed to list KYC verifications: ${error.message}`
    });
  }
});

// Manual KYC approval (for testing)
router.post('/kyc/approve/:verificationId', hasRole('ADMIN'), async (req, res) => {
  try {
    const { verificationId } = req.params;
    const { notes } = req.body;
    
    const db = req.app.get('db');
    
    // Check if verification exists
    const checkQuery = `
      SELECT id, user_id, status, verification_level
      FROM kyc_verifications
      WHERE id = $1
    `;
    
    const checkResult = await db.query(checkQuery, [verificationId]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Verification not found'
      });
    }
    
    const verification = checkResult.rows[0];
    
    if (verification.status === 'APPROVED') {
      return res.status(400).json({
        success: false,
        message: 'Verification is already approved'
      });
    }
    
    // Update verification status
    const updateQuery = `
      UPDATE kyc_verifications
      SET status = 'APPROVED', verified_at = NOW(),
          metadata = jsonb_set(coalesce(metadata, '{}'), '{admin_notes}', $1::jsonb)
      WHERE id = $2
      RETURNING id, status, verified_at
    `;
    
    const updateResult = await db.query(updateQuery, [
      JSON.stringify(notes || 'Manually approved by admin'),
      verificationId
    ]);
    
    // Initialize KYC service to trigger credential issuance
    const redis = req.app.get('redis');
    const kycService = new KYCService(db, redis);
    
    // Issue verification credential
    await kycService._issueVerificationCredential(
      verification.user_id,
      verification.verification_level,
      verificationId
    );
    
    res.status(200).json({
      success: true,
      verification: updateResult.rows[0],
      message: 'KYC verification approved successfully'
    });
  } catch (error) {
    console.error('Error approving KYC verification:', error);
    res.status(500).json({
      success: false,
      message: `Failed to approve KYC verification: ${error.message}`
    });
  }
});

// System health check
router.get('/health', hasRole('ADMIN'), async (req, res) => {
  try {
    const db = req.app.get('db');
    const redis = req.app.get('redis');
    
    // Check database connection
    const dbCheck = await db.query('SELECT NOW()');
    const dbConnected = !!dbCheck.rows[0];
    
    // Check Redis connection
    let redisConnected = false;
    try {
      await redis.ping();
      redisConnected = true;
    } catch (redisError) {
      console.error('Redis connection error:', redisError);
    }
    
    // Check IPFS connection
    let ipfsConnected = false;
    try {
      ipfsConnected = await ipfsService.checkPinataStatus();
    } catch (ipfsError) {
      console.error('IPFS connection error:', ipfsError);
    }
    
    res.status(200).json({
      success: true,
      health: {
        status: dbConnected && redisConnected ? 'healthy' : 'degraded',
        database: dbConnected ? 'connected' : 'disconnected',
        redis: redisConnected ? 'connected' : 'disconnected',
        ipfs: ipfsConnected ? 'connected' : 'disconnected',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error checking system health:', error);
    res.status(500).json({
      success: false,
      health: {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

module.exports = router;