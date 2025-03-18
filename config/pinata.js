/**
 * Pinata IPFS configuration for the Identity Bridge API
 */
const pinataSDK = require('@pinata/sdk');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * Pinata configuration
 */
const pinataConfig = {
  apiKey: process.env.PINATA_API_KEY,
  apiSecret: process.env.PINATA_SECRET_API_KEY,
  gatewayUrl: process.env.IPFS_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs',
  publicGatewayUrl: 'https://ipfs.io/ipfs',
  timeout: parseInt(process.env.PINATA_TIMEOUT) || 30000, // 30 seconds timeout
};

/**
 * Create Pinata client
 */
const createPinataClient = () => {
  try {
    if (!pinataConfig.apiKey || !pinataConfig.apiSecret) {
      console.warn('Pinata API key or secret not provided. IPFS functionality will be limited.');
      return null;
    }
    
    const client = new pinataSDK({
      pinataApiKey: pinataConfig.apiKey,
      pinataSecretApiKey: pinataConfig.apiSecret
    });
    
    console.log('Pinata client initialized');
    return client;
  } catch (error) {
    console.error('Error creating Pinata client:', error);
    return null;
  }
};

/**
 * Test Pinata connection
 */
const testPinataConnection = async () => {
  const client = createPinataClient();
  
  if (!client) {
    return false;
  }
  
  try {
    await client.testAuthentication();
    console.log('Pinata authentication successful');
    return true;
  } catch (error) {
    console.error('Pinata authentication failed:', error);
    return false;
  }
};

/**
 * Pin JSON to IPFS
 * @param {Object} jsonData - JSON data to pin
 * @param {Object} options - Pinning options
 * @returns {Promise<String>} - IPFS CID
 */
const pinJSON = async (jsonData, options = {}) => {
  const client = createPinataClient();
  
  if (!client) {
    throw new Error('Pinata client not initialized');
  }
  
  try {
    const { name = 'File', metadata = {} } = options;
    
    const result = await client.pinJSONToIPFS(jsonData, {
      pinataMetadata: {
        name,
        keyvalues: {
          app: 'identity-bridge',
          timestamp: Date.now().toString(),
          ...metadata
        }
      },
      pinataOptions: {
        cidVersion: 1
      }
    });
    
    return result.IpfsHash;
  } catch (error) {
    console.error('Error pinning JSON to IPFS:', error);
    throw new Error(`Failed to pin JSON to IPFS: ${error.message}`);
  }
};

/**
 * Pin file to IPFS
 * @param {String|Buffer|Stream} file - File to pin (path, buffer or stream)
 * @param {Object} options - Pinning options
 * @returns {Promise<String>} - IPFS CID
 */
const pinFile = async (file, options = {}) => {
  const client = createPinataClient();
  
  if (!client) {
    throw new Error('Pinata client not initialized');
  }
  
  try {
    const { name = 'File', metadata = {} } = options;
    
    // Handle different file input types
    let readableStreamForFile;
    
    if (typeof file === 'string') {
      // File path
      readableStreamForFile = fs.createReadStream(file);
    } else if (Buffer.isBuffer(file)) {
      // Buffer - create a temp file and stream it
      const tempPath = path.join(process.env.TEMP_DIR || '/tmp', `upload-${Date.now()}.bin`);
      fs.writeFileSync(tempPath, file);
      readableStreamForFile = fs.createReadStream(tempPath);
      
      // Clean up temp file after upload
      setTimeout(() => {
        try {
          fs.unlinkSync(tempPath);
        } catch (cleanupError) {
          console.error('Error cleaning up temp file:', cleanupError);
        }
      }, 60000); // Clean up after 1 minute
    } else {
      // Assume it's already a stream
      readableStreamForFile = file;
    }
    
    const result = await client.pinFileToIPFS(readableStreamForFile, {
      pinataMetadata: {
        name,
        keyvalues: {
          app: 'identity-bridge',
          timestamp: Date.now().toString(),
          ...metadata
        }
      },
      pinataOptions: {
        cidVersion: 1
      }
    });
    
    return result.IpfsHash;
  } catch (error) {
    console.error('Error pinning file to IPFS:', error);
    throw new Error(`Failed to pin file to IPFS: ${error.message}`);
  }
};

/**
 * Get content from IPFS
 * @param {String} cid - IPFS CID
 * @returns {Promise<Object>} - Retrieved data
 */
const getFromIPFS = async (cid) => {
  try {
    // Try Pinata gateway first
    const pinataGatewayUrl = `${pinataConfig.gatewayUrl}/${cid}`;
    
    try {
      const response = await axios.get(pinataGatewayUrl, {
        timeout: pinataConfig.timeout
      });
      return response.data;
    } catch (pinataError) {
      console.warn(`Error retrieving from Pinata gateway: ${pinataError.message}`);
      
      // Fall back to public IPFS gateway
      const publicGatewayUrl = `${pinataConfig.publicGatewayUrl}/${cid}`;
      const fallbackResponse = await axios.get(publicGatewayUrl, {
        timeout: pinataConfig.timeout
      });
      return fallbackResponse.data;
    }
  } catch (error) {
    console.error('Error retrieving from IPFS:', error);
    throw new Error(`Failed to retrieve data from IPFS: ${error.message}`);
  }
};

/**
 * Check if a CID exists on Pinata
 * @param {String} cid - IPFS CID
 * @returns {Promise<Boolean>} - Whether the CID exists
 */
const checkIfPinned = async (cid) => {
  const client = createPinataClient();
  
  if (!client) {
    throw new Error('Pinata client not initialized');
  }
  
  try {
    const result = await client.pinList({
      hashContains: cid
    });
    
    return result.count > 0;
  } catch (error) {
    console.error('Error checking if pinned:', error);
    return false;
  }
};

/**
 * Unpin content from Pinata
 * @param {String} cid - IPFS CID
 * @returns {Promise<Boolean>} - Whether the operation was successful
 */
const unpinContent = async (cid) => {
  const client = createPinataClient();
  
  if (!client) {
    throw new Error('Pinata client not initialized');
  }
  
  try {
    await client.unpin(cid);
    return true;
  } catch (error) {
    console.error('Error unpinning content:', error);
    return false;
  }
};

module.exports = {
  pinataConfig,
  createPinataClient,
  testPinataConnection,
  pinJSON,
  pinFile,
  getFromIPFS,
  checkIfPinned,
  unpinContent
};