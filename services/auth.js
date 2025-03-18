const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const ethers = require('ethers');
const { PublicKey, Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');

class AuthService {
  constructor(db, redis) {
    this.db = db;
    this.redis = redis;
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    this.jwtExpiry = process.env.JWT_EXPIRY || '24h';
  }

  /**
   * Generate a challenge for wallet signature
   * @param {String} walletAddress - The wallet address
   * @param {String} chain - The blockchain (polygon/solana)
   * @returns {Promise<String>} - The challenge string
   */
  async generateChallenge(walletAddress, chain = 'polygon') {
    try {
      // Generate a random nonce
      const nonce = crypto.randomBytes(32).toString('hex');
      
      // Create a clear message that user will sign
      let message;
      if (chain === 'polygon') {
        message = `Sign this message to authenticate with the Identity Bridge.\n\nNonce: ${nonce}\nWallet: ${walletAddress}\nTimestamp: ${Date.now()}`;
      } else if (chain === 'solana') {
        message = `Sign this message to authenticate with the Identity Bridge.\n\nNonce: ${nonce}\nWallet: ${walletAddress}\nTimestamp: ${Date.now()}`;
      } else {
        throw new Error(`Unsupported chain: ${chain}`);
      }
      
      // Store the nonce in database
      const query = `
        INSERT INTO users (wallet_address, nonce)
        VALUES ($1, $2)
        ON CONFLICT (wallet_address) DO UPDATE
        SET nonce = $2, updated_at = NOW()
        RETURNING id
      `;
      
      await this.db.query(query, [walletAddress, nonce]);
      
      // Cache challenge for quick verification
      await this.redis.set(
        `challenge:${walletAddress}`, 
        message,
        'EX',
        300 // 5 minutes expiry
      );
      
      return message;
    } catch (error) {
      console.error('Error generating challenge:', error);
      throw new Error(`Failed to generate challenge: ${error.message}`);
    }
  }

  /**
   * Verify a challenge signature and issue token
   * @param {String} walletAddress - The wallet address
   * @param {String} signature - The signature
   * @param {String} chain - The blockchain (polygon/solana)
   * @param {Object} metadata - Additional info (IP, user agent)
   * @returns {Promise<Object>} - Authentication result with token
   */
  async verifySignature(walletAddress, signature, chain = 'polygon', metadata = {}) {
    try {
      // Get challenge from cache
      const challenge = await this.redis.get(`challenge:${walletAddress}`);
      if (!challenge) {
        throw new Error('Challenge expired or not found');
      }
      
      // Query nonce from database
      const query = `
        SELECT id, nonce, did 
        FROM users 
        WHERE wallet_address = $1
      `;
      
      const result = await this.db.query(query, [walletAddress]);
      if (result.rows.length === 0) {
        throw new Error('User not found');
      }
      
      const { id, nonce, did } = result.rows[0];
      
      // Verify signature based on chain
      let isValid = false;
      
      if (chain === 'polygon') {
        // Ethereum signature verification
        try {
          const recoveredAddress = ethers.utils.verifyMessage(challenge, signature);
          isValid = recoveredAddress.toLowerCase() === walletAddress.toLowerCase();
        } catch (err) {
          console.error('Ethereum signature verification error:', err);
          isValid = false;
        }
      } else if (chain === 'solana') {
        // Solana signature verification
        try {
          const publicKey = new PublicKey(walletAddress);
          const signatureUint8 = bs58.decode(signature);
          const messageBytes = Buffer.from(challenge);
          
          isValid = this._verifySolanaSignature(messageBytes, signatureUint8, publicKey);
        } catch (err) {
          console.error('Solana signature verification error:', err);
          isValid = false;
        }
      } else {
        throw new Error(`Unsupported chain: ${chain}`);
      }
      
      if (!isValid) {
        throw new Error('Invalid signature');
      }
      
      // Generate token
      const token = this.generateToken(id, walletAddress, did, chain);
      
      // Store session
      const sessionQuery = `
        INSERT INTO auth_sessions (
          user_id, 
          token, 
          expires_at, 
          ip_address, 
          user_agent
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `;
      
      const expiryDate = new Date();
      expiryDate.setTime(expiryDate.getTime() + this._parseJwtExpiry(this.jwtExpiry));
      
      await this.db.query(sessionQuery, [
        id,
        token,
        expiryDate,
        metadata.ip || null,
        metadata.userAgent || null
      ]);
      
      // Clear the challenge
      await this.redis.del(`challenge:${walletAddress}`);
      
      return {
        authenticated: true,
        token,
        user: {
          id,
          walletAddress,
          did: did || null,
          chain
        }
      };
    } catch (error) {
      console.error('Error verifying signature:', error);
      return {
        authenticated: false,
        error: error.message
      };
    }
  }

  /**
   * Generate a JWT token
   * @param {String} userId - The user ID
   * @param {String} walletAddress - The wallet address
   * @param {String} did - The user's DID (if any)
   * @param {String} chain - The blockchain
   * @returns {String} - JWT token
   */
  generateToken(userId, walletAddress, did, chain) {
    const payload = {
      sub: userId,
      wallet: walletAddress,
      did: did || null,
      chain,
      iat: Math.floor(Date.now() / 1000)
    };
    
    return jwt.sign(payload, this.jwtSecret, { expiresIn: this.jwtExpiry });
  }

  /**
   * Verify a JWT token
   * @param {String} token - The JWT token
   * @returns {Promise<Object>} - Verification result
   */
  async verifyToken(token) {
    try {
      // First do basic JWT verification
      const decoded = jwt.verify(token, this.jwtSecret);
      
      // Check if token is revoked or session is invalid
      const query = `
        SELECT s.id, s.expires_at, u.wallet_address, u.did
        FROM auth_sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = $1
      `;
      
      const result = await this.db.query(query, [token]);
      
      if (result.rows.length === 0) {
        throw new Error('Session not found or revoked');
      }
      
      const { expires_at, wallet_address, did } = result.rows[0];
      
      // Check expiration
      if (new Date(expires_at) < new Date()) {
        throw new Error('Session expired');
      }
      
      return {
        valid: true,
        decoded,
        user: {
          id: decoded.sub,
          walletAddress: wallet_address,
          did
        }
      };
    } catch (error) {
      console.error('Error verifying token:', error);
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Revoke a user's token/session
   * @param {String} token - The JWT token to revoke
   * @returns {Promise<Boolean>} - Success status
   */
  async revokeToken(token) {
    try {
      const query = `
        DELETE FROM auth_sessions
        WHERE token = $1
        RETURNING id
      `;
      
      const result = await this.db.query(query, [token]);
      
      return result.rowCount > 0;
    } catch (error) {
      console.error('Error revoking token:', error);
      throw new Error(`Failed to revoke token: ${error.message}`);
    }
  }

  /**
   * Logout a user (revoke all sessions)
   * @param {String} userId - The user ID
   * @returns {Promise<Boolean>} - Success status
   */
  async logoutUser(userId) {
    try {
      const query = `
        DELETE FROM auth_sessions
        WHERE user_id = $1
        RETURNING id
      `;
      
      const result = await this.db.query(query, [userId]);
      
      return result.rowCount > 0;
    } catch (error) {
      console.error('Error logging out user:', error);
      throw new Error(`Failed to log out user: ${error.message}`);
    }
  }
  
  /**
   * Get user's active roles
   * @param {String} userId - The user ID
   * @param {String} chainId - Optional chain ID to filter roles
   * @returns {Promise<Array>} - List of active roles
   */
  async getUserRoles(userId, chainId = null) {
    try {
      let query = `
        SELECT r.name, r.description, ur.chain_id
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = $1 AND ur.is_active = true
      `;
      
      const params = [userId];
      
      if (chainId) {
        query += ` AND ur.chain_id = $2`;
        params.push(chainId);
      }
      
      const result = await this.db.query(query, params);
      
      return result.rows;
    } catch (error) {
      console.error('Error getting user roles:', error);
      throw new Error(`Failed to get user roles: ${error.message}`);
    }
  }
  
  /**
   * Check if a user has a specific role
   * @param {String} userId - The user ID
   * @param {String} roleName - The role name to check
   * @param {String} chainId - Optional chain ID
   * @returns {Promise<Boolean>} - Whether the user has the role
   */
  async hasRole(userId, roleName, chainId = null) {
    try {
      let query = `
        SELECT 1
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = $1 AND r.name = $2 AND ur.is_active = true
      `;
      
      const params = [userId, roleName];
      
      if (chainId) {
        query += ` AND ur.chain_id = $3`;
        params.push(chainId);
      }
      
      const result = await this.db.query(query, params);
      
      return result.rows.length > 0;
    } catch (error) {
      console.error('Error checking user role:', error);
      return false;
    }
  }
  
  /**
   * Parse JWT expiry string to milliseconds
   * @param {String} expiry - Expiry string (e.g., '1h', '7d')
   * @returns {Number} - Milliseconds
   */
  _parseJwtExpiry(expiry) {
    const match = expiry.match(/^(\d+)([smhdw])$/);
    if (!match) {
      return 24 * 60 * 60 * 1000; // Default to 24 hours
    }
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case 's':
        return value * 1000; // seconds
      case 'm':
        return value * 60 * 1000; // minutes
      case 'h':
        return value * 60 * 60 * 1000; // hours
      case 'd':
        return value * 24 * 60 * 60 * 1000; // days
      case 'w':
        return value * 7 * 24 * 60 * 60 * 1000; // weeks
      default:
        return 24 * 60 * 60 * 1000; // Default to 24 hours
    }
  }
  
  /**
   * Verify a Solana signature
   * @param {Buffer} message - The message that was signed
   * @param {Uint8Array} signature - The signature
   * @param {PublicKey} publicKey - The public key
   * @returns {Boolean} - Whether the signature is valid
   */
  _verifySolanaSignature(message, signature, publicKey) {
    // This is a simplified version - in a real implementation, 
    // we would use the appropriate Solana verification libraries
    try {
      // For now, we'll rely on an external library (not implemented here)
      // return nacl.sign.detached.verify(message, signature, publicKey.toBytes());
      
      // Placeholder implementation
      console.log('Verifying Solana signature for', publicKey.toString());
      return true; // Replace with actual verification
    } catch (error) {
      console.error('Solana signature verification error:', error);
      return false;
    }
  }
  
  /**
   * Encrypt sensitive data
   * @param {String} data - Data to encrypt
   * @returns {String} - Encrypted data
   */
  _encrypt(data) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(this.jwtSecret, 'salt', 32);
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return `${iv.toString('hex')}:${encrypted}`;
  }
  
  /**
   * Decrypt sensitive data
   * @param {String} encryptedData - Data to decrypt
   * @returns {String} - Decrypted data
   */
  _decrypt(encryptedData) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(this.jwtSecret, 'salt', 32);
    
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}
module.exports = AuthService;
