const ethers = require('ethers');
require('dotenv').config();
const crypto = require('crypto');

async function diagnosticMintAttempt() {
  try {
    // Provider setup
    const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
    
    // Wallet setup
    const wallet = new ethers.Wallet(process.env.POLYGON_PRIVATE_KEY, provider);
    
    // Contract address and ABI
    const contractAddress = process.env.POLYGON_SOULBOUND_ADDRESS;
    
    // Comprehensive ABI for diagnostics
    const contractABI = [
      // Identity verification function
      "function verifyIdentity(address entity, string memory did, bytes32 credentialHash, string memory credentialCID, uint256 expirationTime) external",
      
      // Role checking functions
      "function hasRole(bytes32 role, address account) view returns (bool)",
      "function VERIFIER_ROLE() view returns (bytes32)",
      
      // Additional diagnostic functions
      "function paused() view returns (bool)"
    ];

    // Create contract instance
    const contract = new ethers.Contract(contractAddress, contractABI, wallet);

    console.log("--- Comprehensive Minting Diagnostic ---");
    console.log(`Wallet Address: ${wallet.address}`);
    console.log(`Contract Address: ${contractAddress}\n`);

    // Check if contract is paused
    try {
      const isPaused = await contract.paused();
      console.log(`Contract Paused: ${isPaused}`);
      if (isPaused) {
        console.log("WARNING: Contract is currently paused!");
      }
    } catch (pauseError) {
      console.log("Could not check pause status:", pauseError.message);
    }

    // Verify role
    const verifierRole = await contract.VERIFIER_ROLE();
    const hasVerifierRole = await contract.hasRole(verifierRole, wallet.address);
    console.log(`Has Verifier Role: ${hasVerifierRole}`);

    // Prepare minting parameters
    const entity = wallet.address;
    const did = `did:example:${crypto.randomBytes(16).toString('hex')}`;
    const credentialHash = ethers.keccak256(ethers.toUtf8Bytes(did));
    const credentialCID = `ipfs://example-cid-${crypto.randomBytes(8).toString('hex')}`;
    const expirationTime = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60); // 1 year from now

    console.log("\n--- Minting Attempt Diagnostic ---");
    console.log(`DID: ${did}`);
    console.log(`Credential Hash: ${credentialHash}`);
    console.log(`Credential CID: ${credentialCID}`);
    console.log(`Expiration Time: ${expirationTime}`);

    // Attempt to mint
    try {
      console.log("\nAttempting verifyIdentity...");
      const tx = await contract.verifyIdentity(
        entity, 
        did, 
        credentialHash, 
        credentialCID, 
        expirationTime,
        { gasLimit: 3000000 }
      );

      console.log("Transaction sent. Waiting for confirmation...");
      const receipt = await tx.wait();

      console.log("\n--- Minting Success ---");
      console.log(`Transaction Hash: ${receipt.hash}`);
      console.log(`Block Number: ${receipt.blockNumber}`);
    } catch (mintError) {
      console.error("\n--- Minting Failed ---");
      console.error("Error Details:");
      console.error(`Message: ${mintError.message}`);
      
      // Additional error parsing
      if (mintError.data) {
        console.error(`Revert Data: ${mintError.data}`);
      }
      
      if (mintError.reason) {
        console.error(`Reason: ${mintError.reason}`);
      }
      
      if (mintError.code) {
        console.error(`Error Code: ${mintError.code}`);
      }
    }

  } catch (error) {
    console.error("Diagnostic Script Failed:", error);
  }
}

// Run the diagnostic
diagnosticMintAttempt();