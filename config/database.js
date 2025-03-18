/**
 * Database configuration for the Identity Bridge API
 */
const { Pool } = require('pg');
const Redis = require('ioredis');
require('dotenv').config();

/**
 * PostgreSQL configuration
 */
const pgConfig = {
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'identity_bridge',
  password: process.env.DB_PASSWORD || 'postgres',
  port: parseInt(process.env.DB_PORT) || 5432,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  // Connection pool settings
  max: parseInt(process.env.DB_POOL_MAX) || 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 2000, // How long to wait for a connection to become available
};

/**
 * Redis configuration
 */
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || null,
  db: parseInt(process.env.REDIS_DB) || 0,
  // Connection options
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  keepAlive: 10000,
};

/**
 * Create a PostgreSQL pool
 */
const createPgPool = () => {
  try {
    const pool = new Pool(pgConfig);
    
    // Testing pool connection
    pool.on('error', (err, client) => {
      console.error('Unexpected error on idle client', err);
    });
    
    // Log connection status
    console.log(`PostgreSQL connection pool created for ${pgConfig.database}@${pgConfig.host}`);
    
    return pool;
  } catch (error) {
    console.error('Error creating PostgreSQL pool:', error);
    throw new Error(`Failed to create PostgreSQL pool: ${error.message}`);
  }
};

/**
 * Create a Redis client
 */
const createRedisClient = () => {
  try {
    const client = new Redis(redisConfig);
    
    client.on('error', (err) => {
      console.error('Redis client error:', err);
    });
    
    client.on('connect', () => {
      console.log(`Redis client connected to ${redisConfig.host}:${redisConfig.port}`);
    });
    
    return client;
  } catch (error) {
    console.error('Error creating Redis client:', error);
    throw new Error(`Failed to create Redis client: ${error.message}`);
  }
};

/**
 * Test database connection
 */
const testConnection = async () => {
  const pool = createPgPool();
  
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as now');
    const now = result.rows[0].now;
    
    console.log('Database connection test successful at:', now);
    
    client.release();
    await pool.end();
    
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    
    try {
      await pool.end();
    } catch (endError) {
      console.error('Error ending pool:', endError);
    }
    
    return false;
  }
};

/**
 * Initialize database schema
 * This should typically be done through migrations
 */
const initSchema = async (pool) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    
    const client = await pool.connect();
    await client.query(schemaSQL);
    client.release();
    
    console.log('Database schema initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize database schema:', error);
    return false;
  }
};

/**
 * Check if a specific table exists
 */
const tableExists = async (pool, tableName) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      );
    `, [tableName]);
    
    client.release();
    return result.rows[0].exists;
  } catch (error) {
    console.error(`Error checking if table ${tableName} exists:`, error);
    return false;
  }
};

module.exports = {
  pgConfig,
  redisConfig,
  createPgPool,
  createRedisClient,
  testConnection,
  initSchema,
  tableExists
};