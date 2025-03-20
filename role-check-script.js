const ethers = require('ethers');
require('dotenv').config();

async function checkContractRoles() {
  try {
    // Provider setup
    const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
    
    // Wallet setup
    const wallet = new ethers.Wallet(process.env.POLYGON_PRIVATE_KEY, provider);
    
    // Contract address and ABI
    const contractAddress = process.env.POLYGON_SOULBOUND_ADDRESS;
    
    // Comprehensive ABI to check roles
    const contractABI = [
      // Role-related functions
      "function hasRole(bytes32 role, address account) view returns (bool)",
      "function getRoleAdmin(bytes32 role) view returns (bytes32)",
      
      // Role constants (common in OpenZeppelin implementations)
      "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
      "function VERIFIER_ROLE() view returns (bytes32)"
    ];

    // Create contract instance
    const contract = new ethers.Contract(contractAddress, contractABI, provider);

    // Roles to check
    const rolesToCheck = [
      {
        name: "DEFAULT_ADMIN_ROLE",
        method: async () => await contract.DEFAULT_ADMIN_ROLE()
      },
      {
        name: "VERIFIER_ROLE", 
        method: async () => await contract.VERIFIER_ROLE()
      }
    ];

    console.log("--- Role Diagnostic Report ---");
    console.log(`Checking roles for wallet: ${wallet.address}`);
    console.log(`Contract Address: ${contractAddress}\n`);

    // Check each role
    for (const roleInfo of rolesToCheck) {
      try {
        const roleBytes = await roleInfo.method();
        const hasRole = await contract.hasRole(roleBytes, wallet.address);
        const roleAdmin = await contract.getRoleAdmin(roleBytes);

        console.log(`Role: ${roleInfo.name}`);
        console.log(`Role Bytes: ${roleBytes}`);
        console.log(`Wallet Has Role: ${hasRole}`);
        console.log(`Role Admin: ${roleAdmin}\n`);
      } catch (roleCheckError) {
        console.error(`Error checking ${roleInfo.name}:`, roleCheckError.message);
      }
    }

    // Additional diagnostic information
    console.log("--- Diagnostic Tips ---");
    console.log("1. If 'Wallet Has Role' is false, you need to be granted the role");
    console.log("2. Contact the contract owner (Role Admin) to grant you the required role");
    console.log("3. The Role Admin can use grantRole() to give you access");

  } catch (error) {
    console.error("Comprehensive Role Check Failed:", error);
  }
}

// Run the role check
checkContractRoles();