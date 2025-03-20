/**
 * Configuration for the Identity Bridge backend
 * Environment variables are used for sensitive data
 */

require('dotenv').config();

module.exports = {
  // App configuration
  app: {
    name: process.env.APP_NAME || 'copym-polygon',
    id: process.env.APP_ID || 'd19mjyc4d45yyjyw',
    url: process.env.APP_URL || 'http://localhost:3000'
  },
  
  // Server configuration
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
  },
  
  // Database configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres', 
    database: process.env.DB_NAME || 'identity_bridge',
    ssl: process.env.DB_SSL === 'true',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '10')
  },
  
  // Redis configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    // password: process.env.REDIS_PASSWORD || '',
    ttl: parseInt(process.env.REDIS_TTL || '3600') // Default 1 hour
  },
  
  // JWT configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key-for-development-only',
    expiry: process.env.JWT_EXPIRY || '24h'
  },
  
  // Polygon configuration
  polygon: {
    rpcUrl: process.env.POLYGON_RPC_URL || process.env.AMOY_RPC_URL,
    chainId: process.env.POLYGON_CHAIN_ID || '80002', // Amoy testnet
    bridgeAddress: process.env.POLYGON_BRIDGE_ADDRESS || '0xEDe05747FB7d095d3562e7169B5632A3fBe6e9Bd',
    soulboundNFTAddress: process.env.POLYGON_SOULBOUND_ADDRESS || '0x224434fd5e24Cc3EA7E227327B6f4be0A43969F9 ',
    privateKey: process.env.POLYGON_PRIVATE_KEY || process.env.PRIVATE_KEY,
    gasLimit: parseInt(process.env.POLYGON_GAS_LIMIT || '3000000')
  },
  
  // Solana configuration
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    programId: process.env.SOLANA_IDENTITY_PROGRAM_ID || '6WoHuYtwfizZgBmEfCq9bVkUJW5L9PgkgQ8JuZFhLxa9',
    walletAddress: process.env.SOLANA_WALLET_ADDRESS || 'HU18d3qUrvLK52mQ2AoNKEnV6m1B6VreZ8M7eUE5GBew',
    keypairPath: process.env.SOLANA_KEYPAIR_PATH,
    keypair: process.env.SOLANA_KEYPAIR
  },
  
  // IPFS configuration
  ipfs: {
    pinataApiKey: process.env.PINATA_API_KEY || '18425fb04dde96b39d7d',
    pinataSecretApiKey: process.env.PINATA_API_SECRET || '25483cc13e252dee0e1a3006ad18dccdb06ef9a7acc687f38e269d6e33665fcb',
    pinataJWT: process.env.PINATA_JWT,
    gateway: process.env.IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/'
  },
  
  // DID method configuration
  did: {
    method: process.env.DID_METHOD || 'did:example',
    // How long to cache DID documents in seconds
    cacheTTL: parseInt(process.env.DID_CACHE_TTL || '3600')
  },
  
  // Wormhole configuration
  wormhole: {
    polygon: {
      address: process.env.WORMHOLE_POLYGON_ADDRESS
    },
    solana: {
      address: process.env.WORMHOLE_SOLANA_ADDRESS
    }
  },
  
  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'combined'
  }
};