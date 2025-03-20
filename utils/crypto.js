/**
 * Cryptographic utility functions for the Identity Bridge API
 */
const crypto = require('crypto');
const ethers = require('ethers');
const bs58 = require('bs58');
const { PublicKey } = require('@solana/web3.js');

/**
 * Generate a random nonce
 * @param {Number} length - Length of the nonce in bytes (default: 32)
 * @returns {String} - Hex-encoded nonce
 */
const generateNonce = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Generate a secure random string with specified length
 * @param {Number} length - Length of the string (default: 16)
 * @returns {String} - Random string
 */
const generateRandomString = (length = 16) => {
  const bytes = crypto.randomBytes(Math.ceil(length / 2));
  return bytes.toString('hex').slice(0, length);
};

/**
 * Hash data using SHA-256
 * @param {String|Buffer} data - Data to hash
 * @param {String} encoding - Output encoding (default: 'hex')
 * @returns {String} - Hashed data
 */
const hashSHA256 = (data, encoding = 'hex') => {
  const hash = crypto.createHash('sha256');
  
  if (typeof data === 'string') {
    hash.update(data);
  } else {
    hash.update(Buffer.from(data));
  }
  
  return hash.digest(encoding);
};

/**
 * Create a deterministic hash from multiple inputs
 * @param {Array} inputs - Array of inputs to hash
 * @param {String} encoding - Output encoding (default: 'hex')
 * @returns {String} - Hash of all inputs
 */
const hashMultiple = (inputs, encoding = 'hex') => {
  const hash = crypto.createHash('sha256');
  
  inputs.forEach(input => {
    if (typeof input === 'object' && input !== null) {
      hash.update(JSON.stringify(input));
    } else {
      hash.update(String(input));
    }
  });
  
  return hash.digest(encoding);
};

/**
 * Verify an Ethereum signature
 * @param {String} message - Original message that was signed
 * @param {String} signature - Signature to verify
 * @param {String} address - Ethereum address to verify against
 * @returns {Boolean} - Whether the signature is valid
 */
const verifyEthereumSignature = (message, signature, address) => {
  try {
    const recoveredAddress = ethers.verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === address.toLowerCase();
  } catch (error) {
    console.error('Error verifying Ethereum signature:', error);
    return false;
  }
};

/**
 * Verify a Solana signature
 * @param {String|Buffer} message - Original message that was signed
 * @param {String} signature - Base58 encoded signature
 * @param {String} publicKey - Solana public key
 * @returns {Boolean} - Whether the signature is valid
 */
const verifySolanaSignature = (message, signature, publicKey) => {
  try {
    const pubKey = new PublicKey(publicKey);
    const messageBuffer = typeof message === 'string' ? Buffer.from(message) : message;
    const signatureBytes = bs58.decode(signature);
    
    // In a production environment, we would use the appropriate Solana library
    // This is a simplified placeholder
    console.log('Verifying Solana signature:', {
      message: messageBuffer.toString('hex'),
      signature: bs58.encode(signatureBytes),
      publicKey: pubKey.toString()
    });
    
    // Note: In a real implementation, we would use the tweetnacl or ed25519 library
    // return nacl.sign.detached.verify(messageBuffer, signatureBytes, pubKey.toBuffer());
    
    // This is a placeholder - replace with actual verification
    return true;
  } catch (error) {
    console.error('Error verifying Solana signature:', error);
    return false;
  }
};

/**
 * Encrypt sensitive data
 * @param {String} data - Data to encrypt
 * @param {String} secret - Secret key for encryption
 * @returns {String} - Encrypted data in format: iv:encrypted
 */
const encrypt = (data, secret) => {
  const algorithm = 'aes-256-cbc';
  const key = crypto.scryptSync(secret, 'salt', 32);
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return `${iv.toString('hex')}:${encrypted}`;
};

/**
 * Decrypt sensitive data
 * @param {String} encryptedData - Data to decrypt in format: iv:encrypted
 * @param {String} secret - Secret key for decryption
 * @returns {String} - Decrypted data
 */
const decrypt = (encryptedData, secret) => {
  const algorithm = 'aes-256-cbc';
  const key = crypto.scryptSync(secret, 'salt', 32);
  
  const parts = encryptedData.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = parts[1];
  
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
};

/**
 * Generate a HMAC signature
 * @param {String} data - Data to sign
 * @param {String} secret - Secret key for signing
 * @returns {String} - HMAC signature
 */
const generateHMAC = (data, secret) => {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(typeof data === 'string' ? data : JSON.stringify(data));
  return hmac.digest('hex');
};

/**
 * Verify a HMAC signature
 * @param {String} data - Original data
 * @param {String} signature - HMAC signature to verify
 * @param {String} secret - Secret key for verification
 * @returns {Boolean} - Whether the signature is valid
 */
const verifyHMAC = (data, signature, secret) => {
  const expectedSignature = generateHMAC(data, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
};

module.exports = {
  generateNonce,
  generateRandomString,
  hashSHA256,
  hashMultiple,
  verifyEthereumSignature,
  verifySolanaSignature,
  encrypt,
  decrypt,
  generateHMAC,
  verifyHMAC
};