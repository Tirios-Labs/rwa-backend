const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

// Import routes
const identityRoutes = require('./routes/identity');
const credentialRoutes = require('./routes/credential');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

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

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use(errorHandler);

// Export app for testing
module.exports = app;