const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const Redis = require('ioredis'); // Import Redis

// Import routes
const identityRoutes = require('./routes/identity');
const credentialRoutes = require('./routes/credential');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const kycRoutes = require('./routes/kycRoutes');

// Import middleware
const { errorHandler } = require('./middleware/error');
const { authenticateJWT } = require('./middleware/auth');

// Initialize express app
const app = express();

// Setup database connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'identity_bridge',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5432,
});

app.set('db', pool);

// Setup Redis connection
const setupRedis = () => {
  try {
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

    const redisClient = new Redis(redisConfig);
    
    redisClient.on('error', (err) => {
      console.error('Redis client error:', err);
    });
    
    redisClient.on('connect', () => {
      console.log(`Redis client connected to ${redisConfig.host}:${redisConfig.port}`);
    });
    
    return redisClient;
  } catch (error) {
    console.error('Error creating Redis client:', error);
    // Fallback to memory cache if Redis connection fails
    const memoryCache = require('./services/memoryCache');
    console.warn('Using in-memory cache as fallback');
    return memoryCache;
  }
};

// Initialize Redis client or fallback to memory cache
const useRedis = process.env.USE_REDIS === 'true';
const cacheClient = useRedis ? setupRedis() : require('./services/memoryCache');
app.set('redis', cacheClient);

console.log(`Cache mode: ${useRedis ? 'Redis' : 'In-memory'}`);

// Middleware to capture raw body for webhook verification
app.use('/api/kyc/webhook', express.raw({ type: 'application/json' }));

// Basic security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for whitelisted IPs or admin users if needed
    return false;
  }
});

// Apply rate limiting to all routes
app.use(apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/identity', authenticateJWT, identityRoutes);
app.use('/api/credential', authenticateJWT, credentialRoutes);
app.use('/api/admin', authenticateJWT, adminRoutes);
app.use('/api/kyc', kycRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  const redisStatus = cacheClient.status || 'unknown';
  res.status(200).json({
    status: 'ok',
    database: 'connected',
    cache: useRedis ? 'redis' : 'memory',
    cacheStatus: redisStatus,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use(errorHandler);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  
  if (useRedis && cacheClient.quit) {
    console.log('Closing Redis connection...');
    await cacheClient.quit();
  }
  
  await pool.end();
  console.log('Database connections closed');
  
  process.exit(0);
});

// Export app for testing
module.exports = app;