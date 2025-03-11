// backend/bridge-service/server.js
const express = require('express');
const mongoose = require('mongoose');
const ethers = require('ethers');
const { PublicKey } = require('@solana/web3.js');
const { Connection, programs } = require('@metaplex/js');
const axios = require('axios');
const { body, validationResult } = require('express-validator');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4003;

// Smart contract ABIs and addresses
const SoulboundNFTABI = require('./contracts/SoulboundNFTABI.json');
const CrossChainBridgeABI = require('./contracts/CrossChainBridgeABI.json');

// Middleware
app.use(cors());
app.use(helmet());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bridge-service', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Bridge Request Schema
const BridgeRequestSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  did: {
    type: String,
    required: true
  },
  sourceChain: {
    type: String,
    required: true
  },
  targetChain: {
    type: String,
    required: true
  },
  sourceAddress: {
    type: String,
    required: true
  },
  targetAddress: {
    type: String,
    required: true
  },
  requestType: {
    type: String,
    enum: ['identity', 'asset'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  transactionHash: {
    type: String,
    default: ''
  },
  errorMessage: {
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

const BridgeRequest = mongoose.model('BridgeRequest', BridgeRequestSchema);

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

// Initialize blockchain providers
const initializeProviders = () => {
  // Ethereum provider
  const ethereumProvider = new ethers.providers.JsonRpcProvider(
    process.env.ETHEREUM_RPC_URL || 'https://rpc.sepolia.org'
  );
  const ethereumWallet = new ethers.Wallet(
    process.env.ETHEREUM_PRIVATE_KEY,
    ethereumProvider
  );
  
  // Solana connection
  const solanaConnection = new Connection(
    process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
  );
  
  // Polygon provider
  const polygonProvider = new ethers.providers.JsonRpcProvider(
    process.env.POLYGON_RPC_URL || 'https://rpc-mumbai.maticvigil.com'
  );
  const polygonWallet = new ethers.Wallet(
    process.env.POLYGON_PRIVATE_KEY,
    polygonProvider
  );
  
  return {
    ethereum: {
      provider: ethereumProvider,
      wallet: ethereumWallet,
      soulboundNFT: new ethers.Contract(
        process.env.ETHEREUM_SOULBOUND_ADDRESS,
        SoulboundNFTABI,
        ethereumWallet
      ),
      bridge: new ethers.Contract(
        process.env.ETHEREUM_BRIDGE_ADDRESS,
        CrossChainBridgeABI,
        ethereumWallet
      )
    },
    solana: {
      connection: solanaConnection
    },
    polygon: {
      provider: polygonProvider,
      wallet: polygonWallet,
      soulboundNFT: new ethers.Contract(
        process.env.POLYGON_SOULBOUND_ADDRESS,
        SoulboundNFTABI,
        polygonWallet
      ),
      bridge: new ethers.Contract(
        process.env.POLYGON_BRIDGE_ADDRESS,
        CrossChainBridgeABI,
        polygonWallet
      )
    }
  };
};

const blockchainProviders = initializeProviders();

// Bridge identity between chains
app.post('/api/bridge-identity', authenticateRequest, [
  body('sourceChain').isIn(['ethereum', 'solana', 'polygon']).withMessage('Invalid source chain'),
  body('targetChain').isIn(['ethereum', 'solana', 'polygon']).withMessage('Invalid target chain'),
  body('targetAddress').exists().withMessage('Target address is required'),
  body('did').exists().withMessage('DID is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  const { sourceChain, targetChain, targetAddress, did } = req.body;
  
  // Ensure source and target chains are different
  if (sourceChain === targetChain) {
    return res.status(400).json({ message: 'Source and target chains must be different' });
  }
  
  try {
    // Get source address from identity service
    let sourceAddress;
    try {
      const identityResponse = await axios.get(
        `${process.env.IDENTITY_SERVICE_URL}/api/internal/user-by-did`,
        {
          params: { did },
          headers: {
            'Authorization': `Bearer ${process.env.INTERNAL_API_KEY}`
          }
        }
      );
      
      if (sourceChain === 'ethereum') {
        sourceAddress = identityResponse.data.ethereumAddress;
      } else if (sourceChain === 'solana') {
        sourceAddress = identityResponse.data.solanaAddress;
      } else if (sourceChain === 'polygon') {
        sourceAddress = identityResponse.data.polygonAddress;
      }
      
      if (!sourceAddress) {
        return res.status(400).json({ message: `No ${sourceChain} address found for this DID` });
      }
    } catch (error) {
      console.error('Error getting user data:', error);
      return res.status(500).json({ message: 'Error fetching user data from identity service' });
    }
    
    // Create a bridge request
    const bridgeRequest = new BridgeRequest({
      userId: req.userId,
      did,
      sourceChain,
      targetChain,
      sourceAddress,
      targetAddress,
      requestType: 'identity',
      status: 'pending'
    });
    
    await bridgeRequest.save();
    
    // Process the bridge request asynchronously
    processBridgeRequest(bridgeRequest._id).catch(error => {
      console.error(`Error processing bridge request ${bridgeRequest._id}:`, error);
    });
    
    res.status(201).json({
      message: 'Identity bridge request submitted successfully',
      requestId: bridgeRequest._id,
      status: bridgeRequest.status
    });
  } catch (err) {
    console.error('Error submitting bridge request:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get bridge request status
app.get('/api/status/:requestId', authenticateRequest, async (req, res) => {
  const { requestId } = req.params;
  
  try {
    const bridgeRequest = await BridgeRequest.findById(requestId);
    
    if (!bridgeRequest) {
      return res.status(404).json({ message: 'Bridge request not found' });
    }
    
    // Check if the user is authorized to view this request
    if (bridgeRequest.userId !== req.userId && req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Forbidden: Not authorized to view this request' });
    }
    
    res.json({
      status: bridgeRequest.status,
      requestType: bridgeRequest.requestType,
      sourceChain: bridgeRequest.sourceChain,
      targetChain: bridgeRequest.targetChain,
      transactionHash: bridgeRequest.transactionHash,
      errorMessage: bridgeRequest.errorMessage,
      createdAt: bridgeRequest.createdAt,
      updatedAt: bridgeRequest.updatedAt
    });
  } catch (err) {
    console.error('Error getting bridge request status:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Process bridge request (internal function)
const processBridgeRequest = async (requestId) => {
  try {
    const bridgeRequest = await BridgeRequest.findById(requestId);
    
    if (!bridgeRequest || bridgeRequest.status !== 'pending') {
      return;
    }
    
    // Update status to processing
    bridgeRequest.status = 'processing';
    bridgeRequest.updatedAt = Date.now();
    await bridgeRequest.save();
    
    let transaction;
    
    // Process based on request type
    if (bridgeRequest.requestType === 'identity') {
      if (bridgeRequest.sourceChain === 'ethereum' && bridgeRequest.targetChain === 'solana') {
        // Ethereum to Solana
        transaction = await processEthereumToSolanaIdentity(bridgeRequest);
      } else if (bridgeRequest.sourceChain === 'ethereum' && bridgeRequest.targetChain === 'polygon') {
        // Ethereum to Polygon
        transaction = await processEthereumToPolygonIdentity(bridgeRequest);
      } else if (bridgeRequest.sourceChain === 'solana' && bridgeRequest.targetChain === 'ethereum') {
        // Solana to Ethereum
        transaction = await processSolanaToEthereumIdentity(bridgeRequest);
      } else if (bridgeRequest.sourceChain === 'polygon' && bridgeRequest.targetChain === 'ethereum') {
        // Polygon to Ethereum
        transaction = await processPolygonToEthereumIdentity(bridgeRequest);
      } else {
        throw new Error(`Unsupported chain combination: ${bridgeRequest.sourceChain} to ${bridgeRequest.targetChain}`);
      }
    } else {
      throw new Error(`Unsupported request type: ${bridgeRequest.requestType}`);
    }
    
    // Update the bridge request with the transaction result
    bridgeRequest.status = 'completed';
    bridgeRequest.transactionHash = transaction.hash || transaction.signature || transaction.txid;
    bridgeRequest.updatedAt = Date.now();
    await bridgeRequest.save();
    
    // Notify identity service about the successful bridge
    try {
      await axios.post(
        `${process.env.IDENTITY_SERVICE_URL}/api/internal/bridge-completed`,
        {
          userId: bridgeRequest.userId,
          requestId: bridgeRequest._id,
          did: bridgeRequest.did,
          sourceChain: bridgeRequest.sourceChain,
          targetChain: bridgeRequest.targetChain,
          targetAddress: bridgeRequest.targetAddress
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
  } catch (error) {
    console.error(`Error processing bridge request ${requestId}:`, error);
    
    // Update the bridge request with the error
    const bridgeRequest = await BridgeRequest.findById(requestId);
    if (bridgeRequest) {
      bridgeRequest.status = 'failed';
      bridgeRequest.errorMessage = error.message;
      bridgeRequest.updatedAt = Date.now();
      await bridgeRequest.save();
    }
  }
};

// Process Ethereum to Solana identity bridge
const processEthereumToSolanaIdentity = async (bridgeRequest) => {
  // Implementation will depend on your specific Solana program
  // This is a simplified example
  
  // 1. First, verify the identity on Ethereum
  const ethereumTokenId = await getTokenIdFromDid(bridgeRequest.did, 'ethereum');
  
  // 2. Then call the Ethereum bridge contract to signal the cross-chain identity
  const tx = await blockchainProviders.ethereum.bridge.requestIdentityVerification(
    bridgeRequest.did,
    'solana-mainnet',
    bridgeRequest.targetAddress
  );
  
  await tx.wait();
  
  // 3. In a production system, you would have an off-chain relayer that listens for these events
  // and calls the Solana program to create the identity
  
  return tx;
};

// Process Ethereum to Polygon identity bridge
const processEthereumToPolygonIdentity = async (bridgeRequest) => {
  // 1. First, verify the identity on Ethereum
  const ethereumTokenId = await getTokenIdFromDid(bridgeRequest.did, 'ethereum');
  
  // 2. Then call the Ethereum bridge contract to signal the cross-chain identity
  const tx = await blockchainProviders.ethereum.bridge.requestIdentityVerification(
    bridgeRequest.did,
    'polygon-mainnet',
    bridgeRequest.targetAddress
  );
  
  await tx.wait();
  
  // 3. In a production system, you would have an off-chain relayer that listens for these events
  // and calls the Polygon contract to create the identity
  
  // 4. For the sake of this example, we'll manually call the Polygon contract
  const polygonTx = await blockchainProviders.polygon.soulboundNFT.addChainIdentity(
    ethereumTokenId,
    'polygon-mainnet',
    bridgeRequest.targetAddress
  );
  
  await polygonTx.wait();
  
  return tx;
};

// Process Solana to Ethereum identity bridge
const processSolanaToEthereumIdentity = async (bridgeRequest) => {
  // Implementation will depend on your specific Solana program
  // This is a simplified example
  
  // For now, just return a mock transaction
  return {
    signature: 'solana-mock-signature'
  };
};

// Process Polygon to Ethereum identity bridge
const processPolygonToEthereumIdentity = async (bridgeRequest) => {
  // 1. First, verify the identity on Polygon
  const polygonTokenId = await getTokenIdFromDid(bridgeRequest.did, 'polygon');
  
  // 2. Then call the Polygon bridge contract to signal the cross-chain identity
  const tx = await blockchainProviders.polygon.bridge.requestIdentityVerification(
    bridgeRequest.did,
    'eth-mainnet',
    bridgeRequest.targetAddress
  );
  
  await tx.wait();
  
  return tx;
};

// Helper function to get token ID from DID
const getTokenIdFromDid = async (did, chain) => {
  if (chain === 'ethereum') {
    return await blockchainProviders.ethereum.soulboundNFT.getTokenIdByDid(did);
  } else if (chain === 'polygon') {
    return await blockchainProviders.polygon.soulboundNFT.getTokenIdByDid(did);
  } else {
    throw new Error(`Unsupported chain for getTokenIdFromDid: ${chain}`);
  }
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'bridge-service' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Bridge Service running on port ${PORT}`);
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

module.exports = app;