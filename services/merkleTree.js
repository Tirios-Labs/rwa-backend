const crypto = require('crypto');
const { ethers } = require('ethers');

class MerkleTreeService {
  /**
   * Build a Merkle tree from credential hashes
   * @param {Array<String>} hashes - Array of credential hashes
   * @returns {Object} - Merkle tree with root and proofs
   */
  buildMerkleTree(hashes) {
    if (!hashes || hashes.length === 0) {
      return { root: null, proofs: {} };
    }
    
    // Convert all hashes to buffer if they're hex strings
    const leaves = hashes.map(hash => {
      if (typeof hash === 'string' && hash.startsWith('0x')) {
        return Buffer.from(hash.slice(2), 'hex');
      }
      return Buffer.from(hash, 'hex');
    });
    
    // Initial leaves as nodes
    let nodes = leaves.map(leaf => ({
      hash: leaf,
      parent: null,
      left: null,
      right: null
    }));
    
    // Build the tree bottom-up
    while (nodes.length > 1) {
      const newLevel = [];
      
      // Process pairs of nodes
      for (let i = 0; i < nodes.length; i += 2) {
        if (i + 1 >= nodes.length) {
          // Odd number of nodes, promote the last one
          newLevel.push(nodes[i]);
          continue;
        }
        
        const left = nodes[i];
        const right = nodes[i + 1];
        
        // Create parent node
        const parentHash = this._hashPair(left.hash, right.hash);
        const parent = {
          hash: parentHash,
          parent: null,
          left: left,
          right: right
        };
        
        // Update children to reference parent
        left.parent = parent;
        right.parent = parent;
        
        newLevel.push(parent);
      }
      
      nodes = newLevel;
    }
    
    // Root is the last remaining node
    const root = nodes[0].hash.toString('hex');
    
    // Generate proofs for each leaf
    const proofs = {};
    for (let i = 0; i < leaves.length; i++) {
      const leaf = leaves[i];
      const leafHash = leaf.toString('hex');
      proofs[leafHash] = this._generateProof(leaf, root);
    }
    
    return { root, proofs };
  }
  
  /**
   * Generate a Merkle proof for a specific leaf
   * @private
   * @param {Buffer} leaf - The leaf node
   * @param {String} root - The root hash
   * @returns {Array<String>} - The proof as array of hashes
   */
  _generateProof(leaf, root) {
    const proof = [];
    let current = leaf;
    
    while (current.parent) {
      const parent = current.parent;
      const isLeft = parent.left.hash.equals(current.hash);
      
      // Add the sibling to the proof
      if (isLeft) {
        proof.push(parent.right.hash.toString('hex'));
      } else {
        proof.push(parent.left.hash.toString('hex'));
      }
      
      current = parent;
    }
    
    return proof;
  }
  
  /**
   * Hash a pair of nodes together
   * @private
   * @param {Buffer} left - Left node hash
   * @param {Buffer} right - Right node hash
   * @returns {Buffer} - Combined hash
   */
  _hashPair(left, right) {
    // Ensure deterministic ordering
    const concat = Buffer.concat(
      Buffer.compare(left, right) <= 0 ? [left, right] : [right, left]
    );
    return crypto.createHash('sha256').update(concat).digest();
  }
  
  /**
   * Verify a proof against the Merkle root
   * @param {String} leafHash - The credential hash to verify
   * @param {Array<String>} proof - The Merkle proof
   * @param {String} root - The Merkle root
   * @returns {Boolean} - Whether the proof is valid
   */
  verifyProof(leafHash, proof, root) {
    let hash = Buffer.from(leafHash, 'hex');
    
    for (const proofElement of proof) {
      const proofBuffer = Buffer.from(proofElement, 'hex');
      hash = this._hashPair(hash, proofBuffer);
    }
    
    return hash.toString('hex') === root;
  }
  
  /**
   * Format a root and proof for blockchain submission
   * @param {String} root - Merkle root
   * @returns {String} - Ethereum-formatted bytes32 string
   */
  formatRootForBlockchain(root) {
    // Ensure it's the right format for Ethereum
    if (!root.startsWith('0x')) {
      return `0x${root}`;
    }
    return root;
  }
}

module.exports = new MerkleTreeService();