// backend/identity-service/server.js
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const ethers = require('ethers');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4001;

// Middleware
app.use(cors());
app.use(helmet());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/identity-service', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// User Schema
const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  ethereumAddress: {
    type: String,
    required: false,
    unique: true,
    sparse: true
  },
  solanaAddress: {
    type: String,
    required: false,
    unique: true,
    sparse: true
  },
  polygonAddress: {
    type: String,
    required: false,
    unique: true,
    sparse: true
  },
  did: {
    type: String,
    required: false,
    unique: true,
    sparse: true
  },
  soulboundTokenId: {
    type: Number,
    required: false,
    unique: true,
    sparse: true
  },
  verificationStatus: {
    type: String,
    enum: ['unverified', 'pending', 'verified'],
    default: 'unverified'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const User = mongoose.model('User', model);

// Authentication middleware
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({ message: 'Invalid token' });
      }
      
      req.user = user;
      next();
    });
  } else {
    res.status(401).json({ message: 'Authorization token required' });
  }
};

// Register a new user
app.post('/api/register', [
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  const { email, password } = req.body;
  
  try {
    // Check if user already exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create new user
    user = new User({
      email,
      password: hashedPassword
    });
    
    await user.save();
    
    // Create JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        verificationStatus: user.verificationStatus
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login
app.post('/api/login', [
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('password').exists().withMessage('Password is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  const { email, password } = req.body;
  
  try {
    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    // Validate password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    // Create JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        ethereumAddress: user.ethereumAddress,
        solanaAddress: user.solanaAddress,
        polygonAddress: user.polygonAddress,
        did: user.did,
        soulboundTokenId: user.soulboundTokenId,
        verificationStatus: user.verificationStatus
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get current user
app.get('/api/protected/me', authenticateJWT, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Link blockchain addresses to user
app.post('/api/protected/link-address', authenticateJWT, [
  body('blockchain').isIn(['ethereum', 'solana', 'polygon']).withMessage('Invalid blockchain'),
  body('address').exists().withMessage('Address is required'),
  body('signature').exists().withMessage('Signature is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  const { blockchain, address, signature } = req.body;
  
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Verify signature (simplified, in a real application you would verify differently based on blockchain)
    let isValidSignature = false;
    if (blockchain === 'ethereum') {
      const message = `Link Ethereum address ${address} to user ID ${user.id}`;
      const recoveredAddress = ethers.utils.verifyMessage(message, signature);
      isValidSignature = recoveredAddress.toLowerCase() === address.toLowerCase();
    } else {
      // For Solana and Polygon, you would implement similar verification
      // For now, just assume valid for demo purposes
      isValidSignature = true;
    }
    
    if (!isValidSignature) {
      return res.status(400).json({ message: 'Invalid signature' });
    }
    
    // Update user address
    if (blockchain === 'ethereum') {
      user.ethereumAddress = address;
    } else if (blockchain === 'solana') {
      user.solanaAddress = address;
    } else if (blockchain === 'polygon') {
      user.polygonAddress = address;
    }
    
    await user.save();
    
    res.json({
      message: `${blockchain} address linked successfully`,
      user: {
        id: user.id,
        email: user.email,
        ethereumAddress: user.ethereumAddress,
        solanaAddress: user.solanaAddress,
        polygonAddress: user.polygonAddress,
        did: user.did,
        verificationStatus: user.verificationStatus
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Generate DID for user
app.post('/api/protected/generate-did', authenticateJWT, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if user has at least one blockchain address
    if (!user.ethereumAddress && !user.solanaAddress && !user.polygonAddress) {
      return res.status(400).json({ message: 'At least one blockchain address must be linked before generating DID' });
    }
    
    // Generate DID (simplified, in a real application you would follow DID standards)
    const did = user.ethereumAddress ? 
      `did:ethr:${user.ethereumAddress}` : 
      user.solanaAddress ? 
        `did:sol:${user.solanaAddress}` : 
        `did:poly:${user.polygonAddress}`;
    
    user.did = did;
    await user.save();
    
    res.json({
      message: 'DID generated successfully',
      did: user.did
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update soulbound token ID
app.post('/api/protected/update-token-id', authenticateJWT, [
  body('tokenId').isNumeric().withMessage('Token ID must be a number')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  const { tokenId } = req.body;
  
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    user.soulboundTokenId = tokenId;
    await user.save();
    
    res.json({
      message: 'Soulbound token ID updated successfully',
      tokenId: user.soulboundTokenId
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'identity-service' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Identity Service running on port ${PORT}`);
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

module.exports = app;