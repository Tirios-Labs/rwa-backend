// backend/api-gateway/server.js
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(helmet());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// JWT Authentication middleware
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) {
        return res.sendStatus(403);
      }
      
      req.user = user;
      next();
    });
  } else {
    res.sendStatus(401);
  }
};

// Routes for public API endpoints
app.use('/api/auth', createProxyMiddleware({
  target: process.env.IDENTITY_SERVICE_URL || 'http://localhost:4001',
  changeOrigin: true,
  pathRewrite: {
    '^/api/auth': '/api', // rewrite path
  },
}));

// Protected routes
app.use('/api/identity', authenticateJWT, createProxyMiddleware({
  target: process.env.IDENTITY_SERVICE_URL || 'http://localhost:4001',
  changeOrigin: true,
  pathRewrite: {
    '^/api/identity': '/api/protected', // rewrite path
  },
  onProxyReq: (proxyReq, req) => {
    // Add the user info to the request headers
    if (req.user) {
      proxyReq.setHeader('X-User-Id', req.user.id);
      proxyReq.setHeader('X-User-Role', req.user.role);
    }
  }
}));

app.use('/api/verification', authenticateJWT, createProxyMiddleware({
  target: process.env.VERIFICATION_SERVICE_URL || 'http://localhost:4002',
  changeOrigin: true,
  pathRewrite: {
    '^/api/verification': '/api', // rewrite path
  },
  onProxyReq: (proxyReq, req) => {
    // Add the user info to the request headers
    if (req.user) {
      proxyReq.setHeader('X-User-Id', req.user.id);
      proxyReq.setHeader('X-User-Role', req.user.role);
    }
  }
}));

app.use('/api/bridge', authenticateJWT, createProxyMiddleware({
  target: process.env.BRIDGE_SERVICE_URL || 'http://localhost:4003',
  changeOrigin: true,
  pathRewrite: {
    '^/api/bridge': '/api', // rewrite path
  },
  onProxyReq: (proxyReq, req) => {
    // Add the user info to the request headers
    if (req.user) {
      proxyReq.setHeader('X-User-Id', req.user.id);
      proxyReq.setHeader('X-User-Role', req.user.role);
    }
  }
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'api-gateway' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

module.exports = app;