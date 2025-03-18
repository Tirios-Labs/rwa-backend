/**
 * Utility functions for Decentralized Identifiers (DIDs)
 */
const crypto = require('crypto');
const ethers = require('ethers');

/**
 * DID method name for the platform
 * Change this to your actual DID method
 */
const DID_METHOD = process.env.DID_METHOD || 'example';

/**
 * Generate a new DID for an Ethereum-compatible address
 * @param {String} address - Ethereum address
 * @param {String} network - Network identifier (e.g. 'polygon')
 * @param {String} salt - Optional salt for uniqueness
 * @returns {String} - Generated DID
 */
const generateDIDFromEthAddress = (address, network = 'polygon', salt = '') => {
  // Normalize the address
  const normalizedAddress = address.toLowerCase();
  
  // Create a deterministic identifier
  const identifier = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(`${normalizedAddress}:${network}:${salt || Date.now()}`)
  ).slice(2, 42); // Take 40 chars from the hash
  
  return `did:${DID_METHOD}:${identifier}`;
};

/**
 * Generate a new DID for a Solana address
 * @param {String} address - Solana address
 * @param {String} network - Network identifier (e.g. 'solana')
 * @param {String} salt - Optional salt for uniqueness
 * @returns {String} - Generated DID
 */
const generateDIDFromSolanaAddress = (address, network = 'solana', salt = '') => {
  // Create a deterministic identifier
  const identifier = crypto.createHash('sha256')
    .update(`${address}:${network}:${salt || Date.now()}`)
    .digest('hex').slice(0, 40); // Take 40 chars from the hash
  
  return `did:${DID_METHOD}:${identifier}`;
};

/**
 * Generate a DID based on chain type
 * @param {String} address - Blockchain address
 * @param {String} chain - Chain type ('polygon', 'solana', etc.)
 * @param {String} salt - Optional salt for uniqueness
 * @returns {String} - Generated DID
 */
const generateDID = (address, chain = 'polygon', salt = '') => {
  if (!address) {
    throw new Error('Address is required to generate a DID');
  }
  
  if (chain === 'polygon' || chain === 'ethereum') {
    return generateDIDFromEthAddress(address, chain, salt);
  } else if (chain === 'solana') {
    return generateDIDFromSolanaAddress(address, chain, salt);
  } else {
    throw new Error(`Unsupported chain type: ${chain}`);
  }
};

/**
 * Parse a DID into its components
 * @param {String} did - The DID to parse
 * @returns {Object} - Parsed components { method, identifier }
 */
const parseDID = (did) => {
  if (!did || typeof did !== 'string') {
    throw new Error('Invalid DID format');
  }
  
  const parts = did.split(':');
  
  if (parts.length < 3 || parts[0] !== 'did') {
    throw new Error('Invalid DID format: must be did:<method>:<identifier>');
  }
  
  return {
    method: parts[1],
    identifier: parts.slice(2).join(':')
  };
};

/**
 * Validate a DID format
 * @param {String} did - The DID to validate
 * @returns {Boolean} - Whether the DID format is valid
 */
const isValidDID = (did) => {
  try {
    const parsed = parseDID(did);
    return parsed.method === DID_METHOD && parsed.identifier.length >= 16;
  } catch (error) {
    return false;
  }
};

/**
 * Create a verification method ID from a DID
 * @param {String} did - The DID
 * @param {String} keyId - Key identifier (default: 'keys-1')
 * @returns {String} - Verification method ID
 */
const createVerificationMethodId = (did, keyId = 'keys-1') => {
  if (!isValidDID(did)) {
    throw new Error('Invalid DID format');
  }
  
  return `${did}#${keyId}`;
};

/**
 * Create a service endpoint ID from a DID
 * @param {String} did - The DID
 * @param {String} serviceId - Service identifier
 * @returns {String} - Service endpoint ID
 */
const createServiceId = (did, serviceId) => {
  if (!isValidDID(did)) {
    throw new Error('Invalid DID format');
  }
  
  return `${did}#${serviceId}`;
};

/**
 * Create a default DID document structure
 * @param {String} did - The DID
 * @param {String} address - Blockchain address
 * @param {String} chain - Chain type
 * @returns {Object} - DID document
 */
const createDefaultDIDDocument = (did, address, chain = 'polygon') => {
  if (!isValidDID(did)) {
    throw new Error('Invalid DID format');
  }
  
  const timestamp = new Date().toISOString();
  const verificationMethodId = createVerificationMethodId(did);
  
  let verificationMethod;
  
  if (chain === 'polygon' || chain === 'ethereum') {
    const chainId = chain === 'polygon' ? '80002' : '1'; // Polygon Amoy testnet or Ethereum mainnet
    verificationMethod = {
      id: verificationMethodId,
      type: 'EcdsaSecp256k1VerificationKey2019',
      controller: did,
      blockchainAccountId: `eip155:${chainId}:${address}`
    };
  } else if (chain === 'solana') {
    verificationMethod = {
      id: verificationMethodId,
      type: 'Ed25519VerificationKey2018',
      controller: did,
      blockchainAccountId: `solana:${address}`
    };
  } else {
    throw new Error(`Unsupported chain type: ${chain}`);
  }
  
  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/ed25519-2020/v1'
    ],
    id: did,
    controller: [did],
    verificationMethod: [verificationMethod],
    authentication: [verificationMethodId],
    assertionMethod: [verificationMethodId],
    service: [
      {
        id: createServiceId(did, 'identity-service'),
        type: 'IdentityService',
        serviceEndpoint: process.env.IDENTITY_SERVICE_URL || 'https://identity.example.com'
      }
    ],
    created: timestamp,
    updated: timestamp
  };
};

/**
 * Get the DID resolution endpoint for a DID
 * @param {String} did - The DID to resolve
 * @returns {String} - Resolution endpoint URL
 */
const getResolutionEndpoint = (did) => {
  try {
    const { method } = parseDID(did);
    
    // Add support for other DID methods as needed
    if (method === DID_METHOD) {
      return `${process.env.API_BASE_URL || 'http://localhost:3000'}/api/identity/did/${did}`;
    } else if (method === 'web') {
      // web DIDs can be resolved via HTTPS
      const identifier = did.split(':').slice(2).join(':');
      return `https://${identifier}/.well-known/did.json`;
    } else {
      // For other DID methods, use a universal resolver
      return `https://resolver.identity.foundation/${did}`;
    }
  } catch (error) {
    throw new Error(`Failed to get resolution endpoint: ${error.message}`);
  }
};

module.exports = {
  DID_METHOD,
  generateDID,
  generateDIDFromEthAddress,
  generateDIDFromSolanaAddress,
  parseDID,
  isValidDID,
  createVerificationMethodId,
  createServiceId,
  createDefaultDIDDocument,
  getResolutionEndpoint
};