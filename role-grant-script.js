const ethers = require('ethers');
require('dotenv').config();

async function grantContractRole() {
  try {
    // Provider setup
    const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
    
    // Wallet setup (must be the admin/owner)
    const wallet = new ethers.Wallet(process.env.POLYGON_PRIVATE_KEY, provider);
    
    // Contract address and ABI
    const contractAddress = process.env.POLYGON_SOULBOUND_ADDRESS;
    
    // ABI for role management
    const contractABI = [
      "function grantRole(bytes32 role, address account)",
      "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
      "function VERIFIER_ROLE() view returns (bytes32)",
      "function hasRole(bytes32 role, address account) view returns (bool)"
    ];

    // Create contract instance with wallet as signer
    const contract = new ethers.Contract(contractAddress, contractABI, wallet);

    // Target wallet to grant role to (can be different from the admin wallet)
    const targetWallet = process.env.WALLET_TO_GRANT_ROLE || wallet.address;

    console.log("--- Role Granting Diagnostic ---");
    console.log(`Admin Wallet: ${wallet.address}`);
    console.log(`Target Wallet: ${targetWallet}`);
    console.log(`Contract Address: ${contractAddress}\n`);

    // Get role bytes
    const adminRole = await contract.DEFAULT_ADMIN_ROLE();
    const verifierRole = await contract.VERIFIER_ROLE();

    // Check if wallet has admin role
    const hasAdminRole = await contract.hasRole(adminRole, wallet.address);
    if (!hasAdminRole) {
      console.error("ERROR: Current wallet does not have admin role!");
      console.log("Cannot grant roles without admin privileges.");
      return;
    }

    // Grant Verifier Role
    console.log("Attempting to grant VERIFIER_ROLE...");
    const tx = await contract.grantRole(verifierRole, targetWallet);
    
    console.log("Transaction sent. Waiting for confirmation...");
    const receipt = await tx.wait();

    console.log("\n--- Grant Role Result ---");
    console.log(`Transaction Hash: ${receipt.hash}`);
    console.log(`Block Number: ${receipt.blockNumber}`);

    // Verify role was granted
    const roleGranted = await contract.hasRole(verifierRole, targetWallet);
    console.log(`Role Successfully Granted: ${roleGranted}`);

  } catch (error) {
    console.error("Role Granting Failed:", error);
  }
}

// Run the role granting process
grantContractRole();