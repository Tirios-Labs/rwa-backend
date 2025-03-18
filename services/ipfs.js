const pinataSDK = require('@pinata/sdk');
const crypto = require('crypto');
const { createReadStream } = require('fs');
const axios = require('axios');

// Initialize Pinata client
const pinata = new pinataSDK({
  pinataApiKey: process.env.PINATA_API_KEY,
  pinataSecretApiKey: process.env.PINATA_SECRET_API_KEY
});

class IPFSService {
  /**
   * Pin JSON data to IPFS via Pinata
   * @param {Object} jsonData - The JSON data to store
   * @param {Object} options - Optional metadata and pinning options
   * @returns {Promise<String>} - The IPFS CID
   */
  async pinJSON(jsonData, options = {}) {
    try {
      const metadata = {
        name: options.name || `Document-${Date.now()}`,
        keyvalues: {
          type: options.type || 'generic',
          timestamp: Date.now().toString(),
          ...options.metadata
        }
      };

      const result = await pinata.pinJSONToIPFS(jsonData, {
        pinataMetadata: metadata
      });

      return result.IpfsHash;
    } catch (error) {
      console.error('Error pinning JSON to IPFS:', error);
      throw new Error(`Failed to pin JSON to IPFS: ${error.message}`);
    }
  }

  /**
   * Pin a DID document to IPFS
   * @param {String} did - The DID
   * @param {Object} didDocument - The DID document
   * @returns {Promise<String>} - The IPFS CID
   */
  async pinDIDDocument(did, didDocument) {
    return this.pinJSON(didDocument, {
      name: `DID-${did}`,
      type: 'did-document',
      metadata: {
        did
      }
    });
  }

  /**
   * Pin a credential to IPFS
   * @param {Object} credential - The credential object
   * @param {String} issuerDid - The issuer's DID
   * @param {String} subjectDid - The subject's DID
   * @returns {Promise<String>} - The IPFS CID
   */
  async pinCredential(credential, issuerDid, subjectDid) {
    const credentialHash = this.hashCredential(credential);
    
    return this.pinJSON(credential, {
      name: `Credential-${credentialHash.slice(0, 8)}`,
      type: 'verifiable-credential',
      metadata: {
        issuerDid,
        subjectDid,
        credentialHash,
        credentialType: credential.type || 'VerifiableCredential'
      }
    });
  }

  /**
   * Hash a credential for on-chain reference
   * @param {Object} credential - The credential to hash
   * @returns {String} - The credential hash
   */
  hashCredential(credential) {
    const normalizedCredential = JSON.stringify(credential);
    return '0x' + crypto.createHash('sha256').update(normalizedCredential).digest('hex');
  }

  /**
   * Get content from IPFS using its CID
   * @param {String} cid - The IPFS CID
   * @returns {Promise<Object>} - The retrieved data
   */
  async getFromIPFS(cid) {
    try {
      // First try Pinata gateway
      const pinataGatewayUrl = `https://gateway.pinata.cloud/ipfs/${cid}`;
      const response = await axios.get(pinataGatewayUrl);
      return response.data;
    } catch (error) {
      try {
        // Fallback to public IPFS gateway
        const publicGatewayUrl = `https://ipfs.io/ipfs/${cid}`;
        const response = await axios.get(publicGatewayUrl);
        return response.data;
      } catch (fallbackError) {
        console.error('Error retrieving from IPFS:', fallbackError);
        throw new Error(`Failed to retrieve data from IPFS: ${fallbackError.message}`);
      }
    }
  }

  /**
   * Verify that an on-chain hash matches the content in IPFS
   * @param {String} onChainHash - The hash stored on-chain
   * @param {String} cid - The IPFS CID
   * @returns {Promise<Boolean>} - Whether the hash matches
   */
  async verifyContentIntegrity(onChainHash, cid) {
    try {
      const content = await this.getFromIPFS(cid);
      const contentHash = this.hashCredential(content);
      
      // Remove '0x' prefix if present for comparison
      const normalizedOnChainHash = onChainHash.startsWith('0x') 
        ? onChainHash.substring(2) 
        : onChainHash;
      
      const normalizedContentHash = contentHash.startsWith('0x')
        ? contentHash.substring(2)
        : contentHash;
      
      return normalizedOnChainHash.toLowerCase() === normalizedContentHash.toLowerCase();
    } catch (error) {
      console.error('Error verifying content integrity:', error);
      return false;
    }
  }
  
  /**
   * Upload a file to IPFS
   * @param {String} filePath - The path to the file
   * @param {Object} options - Optional metadata
   * @returns {Promise<String>} - The IPFS CID
   */
  async pinFile(filePath, options = {}) {
    try {
      const readableStreamForFile = createReadStream(filePath);
      const metadata = {
        name: options.name || `File-${Date.now()}`,
        keyvalues: {
          type: options.type || 'file',
          timestamp: Date.now().toString(),
          ...options.metadata
        }
      };
      
      const result = await pinata.pinFileToIPFS(readableStreamForFile, {
        pinataMetadata: metadata
      });
      
      return result.IpfsHash;
    } catch (error) {
      console.error('Error pinning file to IPFS:', error);
      throw new Error(`Failed to pin file to IPFS: ${error.message}`);
    }
  }
  
  /**
   * Check if a CID exists on Pinata
   * @param {String} cid - The IPFS CID
   * @returns {Promise<Boolean>} - Whether the CID exists
   */
  async checkIfPinned(cid) {
    try {
      const result = await pinata.pinList({
        hashContains: cid
      });
      
      return result.count > 0;
    } catch (error) {
      console.error('Error checking if pinned:', error);
      return false;
    }
  }
  
  /**
   * Remove a pin from Pinata
   * @param {String} cid - The IPFS CID to unpin
   * @returns {Promise<Boolean>} - Whether the operation was successful
   */
  async unpinContent(cid) {
    try {
      await pinata.unpin(cid);
      return true;
    } catch (error) {
      console.error('Error unpinning content:', error);
      return false;
    }
  }
}

module.exports = new IPFSService();