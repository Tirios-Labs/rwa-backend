const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

// Database configuration
const config = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'postgres',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
};

const pool = new Pool(config);

class DIDService {
  /**
   * Generate a DID from a wallet address
   * @param {string} walletAddress - The wallet address
   * @param {number} tokenId - Optional SBT token ID (if already minted)
   * @param {string} chainId - The blockchain chain ID (default: 'polygon')
   * @returns {Promise<object>} - The generated DID or error
   */
  static async generateDID(walletAddress, tokenId = null, chainId = 'polygon') {
    const client = await pool.connect();
    
    try {
      // Start a transaction
      await client.query('BEGIN');
      
      // First, check if this wallet already has a DID
      const existingDID = await this.getDIDByWalletWithClient(client, walletAddress, chainId);
      if (existingDID.success) {
        await client.query('COMMIT');
        return existingDID;
      }

      // Generate a unique DID
      const didMethod = process.env.DID_METHOD || 'did:example';
      const randomBytes = crypto.randomBytes(16).toString('hex');
      const walletHash = crypto.createHash('sha256')
        .update(walletAddress.toLowerCase())
        .digest('hex')
        .slice(0, 16);
      
      const did = `${didMethod}:${walletHash}${randomBytes.slice(0, 8)}`;
      
      // Generate token ID if not provided
      const sbtTokenId = tokenId || Math.floor(Math.random() * 1000000000);
      
      // First check if did_documents table exists
      const didDocumentsExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public'
          AND table_name = 'did_documents'
        );
      `);
      
      if (didDocumentsExists.rows[0].exists) {
        // Create the DID document first (required by foreign key)
        const didDocument = {
          '@context': 'https://www.w3.org/ns/did/v1',
          id: did,
          verificationMethod: [{
            id: `${did}#keys-1`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: did,
            blockchainAccountId: `eip155:${chainId}:${walletAddress}`
          }],
          authentication: [`${did}#keys-1`]
        };
        
        await client.query(`
          INSERT INTO did_documents (did, document)
          VALUES ($1, $2)
          ON CONFLICT (did) DO NOTHING
        `, [did, didDocument]);
      }
      
      // Check if did_to_sbt table exists
      const didToSbtExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public'
          AND table_name = 'did_to_sbt'
        );
      `);
      
      if (!didToSbtExists.rows[0].exists) {
        // Create the table without foreign key (since we can't guarantee did_documents exists)
        await client.query(`
          CREATE TABLE did_to_sbt (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            did VARCHAR(255) NOT NULL UNIQUE,
            sbt_token_id BIGINT NOT NULL,
            chain_id VARCHAR(50) NOT NULL DEFAULT 'polygon',
            wallet_address VARCHAR(42),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
          
          CREATE INDEX IF NOT EXISTS idx_did_to_sbt_wallet 
          ON did_to_sbt(wallet_address);
        `);
      }
      
      // Store the DID in the database
      try {
        await client.query(`
          INSERT INTO did_to_sbt (did, sbt_token_id, chain_id, wallet_address)
          VALUES ($1, $2, $3, $4)
        `, [did, sbtTokenId, chainId, walletAddress]);
      } catch (insertErr) {
        // If the error is a foreign key constraint, we need to create the did_documents entry
        if (insertErr.message.includes('violates foreign key constraint')) {
          console.warn('Foreign key constraint error, creating did_documents entry...');
          
          if (!didDocumentsExists.rows[0].exists) {
            // Create the did_documents table if it doesn't exist
            await client.query(`
              CREATE TABLE IF NOT EXISTS did_documents (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                did VARCHAR(255) NOT NULL UNIQUE,
                document JSONB NOT NULL,
                ipfs_cid VARCHAR(255),
                version INTEGER NOT NULL DEFAULT 1,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
              );
            `);
          }
          
          // Create the DID document
          const didDocument = {
            '@context': 'https://www.w3.org/ns/did/v1',
            id: did,
            verificationMethod: [{
              id: `${did}#keys-1`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              blockchainAccountId: `eip155:${chainId}:${walletAddress}`
            }],
            authentication: [`${did}#keys-1`]
          };
          
          await client.query(`
            INSERT INTO did_documents (did, document)
            VALUES ($1, $2)
            ON CONFLICT (did) DO NOTHING
          `, [did, didDocument]);
          
          // Try inserting into did_to_sbt again
          await client.query(`
            INSERT INTO did_to_sbt (did, sbt_token_id, chain_id, wallet_address)
            VALUES ($1, $2, $3, $4)
          `, [did, sbtTokenId, chainId, walletAddress]);
        } else {
          // For other errors, just rethrow
          throw insertErr;
        }
      }
      
      // Commit the transaction
      await client.query('COMMIT');
      
      return {
        success: true,
        did,
        tokenId: sbtTokenId,
        walletAddress,
        isNew: true,
        message: 'DID generated successfully'
      };
    } catch (err) {
      // Rollback in case of error
      await client.query('ROLLBACK');
      
      console.error('Failed to generate DID:', err);
      return {
        success: false,
        message: `Failed to generate DID: ${err.message}`,
        error: err
      };
    } finally {
      client.release();
    }
  }
  
  /**
   * Get a DID by wallet address (with client)
   * @param {object} client - Database client
   * @param {string} walletAddress - The wallet address
   * @param {string} chainId - The blockchain chain ID
   * @returns {Promise<object>} - The DID information or error
   */
  static async getDIDByWalletWithClient(client, walletAddress, chainId) {
    try {
      // Check if table exists
      const tableExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public'
          AND table_name = 'did_to_sbt'
        );
      `);
      
      if (!tableExists.rows[0].exists) {
        return {
          success: false,
          message: 'did_to_sbt table does not exist',
          walletAddress
        };
      }
      
      // Check if wallet_address column exists
      const columnExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_schema = 'public'
          AND table_name = 'did_to_sbt'
          AND column_name = 'wallet_address'
        );
      `);
      
      if (!columnExists.rows[0].exists) {
        await client.query(`
          ALTER TABLE did_to_sbt ADD COLUMN wallet_address VARCHAR(42);
        `);
      }
      
      const result = await client.query(`
        SELECT * FROM did_to_sbt
        WHERE wallet_address = $1 AND chain_id = $2
        LIMIT 1
      `, [walletAddress, chainId]);
      
      if (result.rows.length === 0) {
        return {
          success: false,
          message: 'No DID found for this wallet address',
          walletAddress
        };
      }
      
      return {
        success: true,
        did: result.rows[0].did,
        tokenId: result.rows[0].sbt_token_id,
        walletAddress,
        isNew: false,
        message: 'DID retrieved successfully'
      };
    } catch (err) {
      console.error('Failed to get DID by wallet:', err);
      return {
        success: false,
        message: `Failed to get DID: ${err.message}`,
        error: err
      };
    }
  }
  
  /**
   * Get a DID by wallet address
   * @param {string} walletAddress - The wallet address
   * @param {string} chainId - The blockchain chain ID (default: 'polygon')
   * @returns {Promise<object>} - The DID information or error
   */
  static async getDIDByWallet(walletAddress, chainId = 'polygon') {
    const client = await pool.connect();
    
    try {
      const result = await this.getDIDByWalletWithClient(client, walletAddress, chainId);
      return result;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get a DID by token ID
   * @param {number} tokenId - The SBT token ID
   * @param {string} chainId - The blockchain chain ID (default: 'polygon')
   * @returns {Promise<object>} - The DID information or error
   */
  static async getDIDByTokenId(tokenId, chainId = 'polygon') {
    const client = await pool.connect();
    
    try {
      // Check if table exists
      const tableExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public'
          AND table_name = 'did_to_sbt'
        );
      `);
      
      if (!tableExists.rows[0].exists) {
        return {
          success: false,
          message: 'did_to_sbt table does not exist',
          tokenId
        };
      }
      
      const result = await client.query(`
        SELECT * FROM did_to_sbt
        WHERE sbt_token_id = $1 AND chain_id = $2
        LIMIT 1
      `, [tokenId, chainId]);
      
      if (result.rows.length === 0) {
        return {
          success: false,
          message: 'No DID found for this token ID',
          tokenId
        };
      }
      
      return {
        success: true,
        did: result.rows[0].did,
        tokenId,
        walletAddress: result.rows[0].wallet_address,
        isNew: false,
        message: 'DID retrieved successfully'
      };
    } catch (err) {
      console.error('Failed to get DID by token ID:', err);
      return {
        success: false,
        message: `Failed to get DID: ${err.message}`,
        error: err
      };
    } finally {
      client.release();
    }
  }
}

module.exports = DIDService;