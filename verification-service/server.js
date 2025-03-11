// backend/verification-service/server.js
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const { body, validationResult } = require('express-validator');
const ethers = require('ethers');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4002;

// Middleware
app.use(cors());
app.use(helmet());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/verification-service', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Verification Request Schema
const VerificationRequestSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  did: {
    type: String,
    required: true
  },
  blockchains: {
    type: [String],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  verificationType: {
    type: String,
    enum: ['kyc', 'kyb'],
    required: true
  },
  verifiableCredential: {
    type: String,
    default: ''
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

const VerificationRequest = mongoose.model('VerificationRequest', VerificationRequestSchema);

// Authentication middleware
const authenticateRequest = (req, res, next) => {
  const userId = req.headers['x-user-id'];
  const userRole = req.headers['x-user-role'];
  
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized: User ID missing' });
  }
  
  req.userId = userId;
  req.userRole = userRole || 'user';
  next();
};

// Admin authorization middleware
const authorizeAdmin = (req, res, next) => {
  if (req.userRole !== 'admin' && req.userRole !== 'verifier') {
    return res.status(403).json({ message: 'Forbidden: Admin access required' });
  }
  
  next();
};

// Submit verification request
app.post('/api/submit', authenticateRequest, [
  body('verificationType').isIn(['kyc', 'kyb']).withMessage('Invalid verification type'),
  body('did').exists().withMessage('DID is required'),
  body('blockchains').isArray().withMessage('Blockchains must be an array')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  const { verificationType, did, blockchains, metadata } = req.body;
  
  try {
    // Check if there's already a pending or approved request for this user
    const existingRequest = await VerificationRequest.findOne({
      userId: req.userId,
      status: { $in: ['pending', 'approved'] }
    });
    
    if (existingRequest) {
      return res.status(400).json({
        message: 'You already have a verification request pending or approved',
        requestId: existingRequest._id,
        status: existingRequest.status
      });
    }
    
    // Create new verification request
    const verificationRequest = new VerificationRequest({
      userId: req.userId,
      did,
      blockchains,
      verificationType,
      metadata: metadata || {}
    });
    
    await verificationRequest.save();
    
    // Notify identity service about the verification request
    try {
      await axios.post(
        `${process.env.IDENTITY_SERVICE_URL}/api/internal/verification-submitted`,
        {
          userId: req.userId,
          requestId: verificationRequest._id,
          status: 'pending'
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.INTERNAL_API_KEY}`
          }
        }
      );
    } catch (notifyError) {
      console.error('Failed to notify identity service:', notifyError);
      // Continue anyway, this is just a notification
    }
    
    res.status(201).json({
      message: 'Verification request submitted successfully',
      requestId: verificationRequest._id,
      status: verificationRequest.status
    });
  } catch (err) {
    console.error('Error submitting verification request:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get verification status
app.get('/api/status/:requestId', authenticateRequest, async (req, res) => {
  const { requestId } = req.params;
  
  try {
    const verificationRequest = await VerificationRequest.findById(requestId);
    
    if (!verificationRequest) {
      return res.status(404).json({ message: 'Verification request not found' });
    }
    
    // Check if the user is authorized to view this request
    if (verificationRequest.userId !== req.userId && req.userRole !== 'admin' && req.userRole !== 'verifier') {
      return res.status(403).json({ message: 'Forbidden: Not authorized to view this request' });
    }
    
    res.json({
      status: verificationRequest.status,
      verificationType: verificationRequest.verificationType,
      did: verificationRequest.did,
      blockchains: verificationRequest.blockchains,
      createdAt: verificationRequest.createdAt,
      updatedAt: verificationRequest.updatedAt
    });
  } catch (err) {
    console.error('Error getting verification status:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all verification requests (admin only)
app.get('/api/requests', authenticateRequest, authorizeAdmin, async (req, res) => {
  const { status, verificationType } = req.query;
  
  try {
    const filter = {};
    
    if (status) {
      filter.status = status;
    }
    
    if (verificationType) {
      filter.verificationType = verificationType;
    }
    
    const verificationRequests = await VerificationRequest.find(filter)
      .sort({ createdAt: -1 })
      .limit(100);
    
    res.json(verificationRequests);
  } catch (err) {
    console.error('Error getting verification requests:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Approve verification request (admin only)
app.post('/api/approve/:requestId', authenticateRequest, authorizeAdmin, async (req, res) => {
  const { requestId } = req.params;
  const { verifiableCredential } = req.body;
  
  try {
    const verificationRequest = await VerificationRequest.findById(requestId);
    
    if (!verificationRequest) {
      return res.status(404).json({ message: 'Verification request not found' });
    }
    
    if (verificationRequest.status !== 'pending') {
      return res.status(400).json({ message: 'Verification request is not pending' });
    }
    
    // Update the verification request
    verificationRequest.status = 'approved';
    verificationRequest.verifiableCredential = verifiableCredential || '';
    verificationRequest.updatedAt = Date.now();
    
    await verificationRequest.save();
    
    // Notify identity service about the approval
    try {
      await axios.post(
        `${process.env.IDENTITY_SERVICE_URL}/api/internal/verification-approved`,
        {
          userId: verificationRequest.userId,
          requestId: verificationRequest._id,
          did: verificationRequest.did,
          verifiableCredential: verificationRequest.verifiableCredential
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.INTERNAL_API_KEY}`
          }
        }
      );
    } catch (notifyError) {
      console.error('Failed to notify identity service:', notifyError);
      // Continue anyway, this is just a notification
    }
    
    // Call the blockchain service to issue the SoulboundNFT
    try {
      await axios.post(
        `${process.env.BLOCKCHAIN_SERVICE_URL}/api/issue-soulbound`,
        {
          userId: verificationRequest.userId,
          did: verificationRequest.did,
          verifiableCredential: verificationRequest.verifiableCredential,
          blockchains: verificationRequest.blockchains
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.INTERNAL_API_KEY}`
          }
        }
      );
    } catch (blockchainError) {
      console.error('Failed to issue SoulboundNFT:', blockchainError);
      // Log the error but don't fail the request
    }
    
    res.json({
      message: 'Verification request approved successfully',
      requestId: verificationRequest._id,
      status: verificationRequest.status
    });
  } catch (err) {
    console.error('Error approving verification request:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reject verification request (admin only)
app.post('/api/reject/:requestId', authenticateRequest, authorizeAdmin, async (req, res) => {
  const { requestId } = req.params;
  const { reason } = req.body;
  
  try {
    const verificationRequest = await VerificationRequest.findById(requestId);
    
    if (!verificationRequest) {
      return res.status(404).json({ message: 'Verification request not found' });
    }
    
    if (verificationRequest.status !== 'pending') {
      return res.status(400).json({ message: 'Verification request is not pending' });
    }
    
    // Update the verification request
    verificationRequest.status = 'rejected';
    verificationRequest.metadata = {
      ...verificationRequest.metadata,
      rejectionReason: reason || 'No reason provided'
    };
    verificationRequest.updatedAt = Date.now();
    
    await verificationRequest.save();
    
    // Notify identity service about the rejection
    try {
      await axios.post(
        `${process.env.IDENTITY_SERVICE_URL}/api/internal/verification-rejected`,
        {
          userId: verificationRequest.userId,
          requestId: verificationRequest._id,
          reason: reason || 'No reason provided'
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.INTERNAL_API_KEY}`
          }
        }
      );
    } catch (notifyError) {
      console.error('Failed to notify identity service:', notifyError);
      // Continue anyway, this is just a notification
    }
    
    res.json({
      message: 'Verification request rejected successfully',
      requestId: verificationRequest._id,
      status: verificationRequest.status
    });
  } catch (err) {
    console.error('Error rejecting verification request:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'verification-service' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Verification Service running on port ${PORT}`);
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

module.exports = app;