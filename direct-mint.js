// direct-mint.js
// Run with: node direct-mint.js
require('dotenv').config();
const ethers = require('ethers');

async function directMint() {
  try {
    console.log("Attempting direct contract interaction...");
    
    // Setup
    const rpcUrl = process.env.POLYGON_RPC_URL;
    const contractAddress = process.env.POLYGON_SOULBOUND_ADDRESS;
    const privateKey = process.env.POLYGON_PRIVATE_KEY;
    
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    console.log(`Wallet: ${wallet.address}`);
    console.log(`Contract: ${contractAddress}`);
    
    // Generate test data
    const testDid = "did:example:test" + Date.now();
    const recipientAddress = wallet.address; // Mint to ourselves for testing
    const metadataUri = "ipfs://placeholder";
    
    // Get the ABI interface for common soulbound functions
    const iface = new ethers.Interface([
      "function mintSoulboundNFT(address to, bytes32 identityHash, string memory did, string memory metadataURI) returns (uint256)",
      "function verifyIdentity(address entity, string memory did, bytes32 credentialHash, string memory credentialCID) returns (uint256)",
      "function mint(address to, string memory did, string memory uri) returns (uint256)",
      "function safeMint(address to, string memory did, string memory uri) returns (uint256)"
    ]);
    
    // Try different function signatures
    const functions = [
      {
        name: "mintSoulboundNFT",
        encodeFn: () => {
          const identityHash = ethers.keccak256(ethers.toUtf8Bytes(testDid));
          return iface.encodeFunctionData("mintSoulboundNFT", [
            recipientAddress, identityHash, testDid, metadataUri
          ]);
        }
      },
      {
        name: "verifyIdentity",
        encodeFn: () => {
          const credentialHash = ethers.keccak256(ethers.toUtf8Bytes(testDid));
          return iface.encodeFunctionData("verifyIdentity", [
            recipientAddress, testDid, credentialHash, metadataUri
          ]);
        }
      },
      {
        name: "mint",
        encodeFn: () => {
          return iface.encodeFunctionData("mint", [
            recipientAddress, testDid, metadataUri
          ]);
        }
      },
      {
        name: "safeMint",
        encodeFn: () => {
          return iface.encodeFunctionData("safeMint", [
            recipientAddress, testDid, metadataUri
          ]);
        }
      }
    ];
    
    // Try each function signature
    let txHash = null;
    
    for (const func of functions) {
      try {
        console.log(`\nTrying ${func.name}...`);
        
        // Encode the function call
        const data = func.encodeFn();
        
        // Create transaction
        const tx = {
          to: contractAddress,
          data: data,
          gasLimit: 3000000 // Explicitly set high gas limit
        };
        
        // Send raw transaction
        const txResponse = await wallet.sendTransaction(tx);
        console.log(`Transaction sent: ${txResponse.hash}`);
        
        // Wait for confirmation
        const receipt = await txResponse.wait();
        console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
        console.log(`Gas used: ${receipt.gasUsed.toString()}`);
        
        txHash = txResponse.hash;
        
        // Success! No need to try other functions
        break;
      } catch (error) {
        console.log(`Failed with ${func.name}: ${error.message}`);
      }
    }
    
    if (txHash) {
      console.log(`\nSuccess! Transaction: ${txHash}`);
      console.log(`DID: ${testDid}`);
    } else {
      console.log("\nAll minting attempts failed.");
    }
    
  } catch (error) {
    console.error('Script failed:', error);
  }
}

// Run the script
directMint().then(() => console.log('Done'));