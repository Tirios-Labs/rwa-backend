// grant-minter-role.js
// Run with: node grant-minter-role.js
require('dotenv').config();
const ethers = require('ethers');

async function grantMinterRole() {
  try {
    // Setup
    const rpcUrl = process.env.POLYGON_RPC_URL;
    const contractAddress = process.env.POLYGON_SOULBOUND_ADDRESS;
    const privateKey = process.env.POLYGON_PRIVATE_KEY;
    
    console.log('Setting up provider...');
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    console.log(`Using wallet: ${wallet.address}`);
    
    // Contract ABI for access control
    const contractAbi = [
      "function hasRole(bytes32 role, address account) external view returns (bool)",
      "function MINTER_ROLE() external view returns (bytes32)",
      "function DEFAULT_ADMIN_ROLE() external view returns (bytes32)",
      "function grantRole(bytes32 role, address account) external",
      "function owner() external view returns (address)",
      "function paused() external view returns (bool)",
      "function unpause() external"
    ];
    
    const contract = new ethers.Contract(contractAddress, contractAbi, wallet);
    
    // Check if wallet is owner
    let isOwner = false;
    try {
      const owner = await contract.owner();
      isOwner = owner.toLowerCase() === wallet.address.toLowerCase();
      console.log(`Contract owner: ${owner}`);
      console.log(`Your wallet is ${isOwner ? 'the owner' : 'NOT the owner'}`);
    } catch (error) {
      console.log('Contract does not have an owner() function');
    }
    
    // Check if contract is paused
    let isPaused = false;
    try {
      isPaused = await contract.paused();
      console.log(`Contract paused: ${isPaused}`);
    } catch (error) {
      console.log('Contract does not have a paused() function');
    }
    
    // Check roles
    try {
      // Get MINTER_ROLE hash
      const MINTER_ROLE = await contract.MINTER_ROLE();
      console.log(`MINTER_ROLE hash: ${MINTER_ROLE}`);
      
      // Check if wallet has MINTER_ROLE
      const hasMinterRole = await contract.hasRole(MINTER_ROLE, wallet.address);
      console.log(`Wallet has MINTER_ROLE: ${hasMinterRole}`);
      
      // Check if wallet has admin role
      const DEFAULT_ADMIN_ROLE = await contract.DEFAULT_ADMIN_ROLE();
      const hasAdminRole = await contract.hasRole(DEFAULT_ADMIN_ROLE, wallet.address);
      console.log(`Wallet has DEFAULT_ADMIN_ROLE: ${hasAdminRole}`);
      
      // If wallet doesn't have MINTER_ROLE but has admin privileges, grant it
      if (!hasMinterRole && (hasAdminRole || isOwner)) {
        console.log('Granting MINTER_ROLE to your wallet...');
        
        const tx = await contract.grantRole(MINTER_ROLE, wallet.address);
        console.log(`Transaction sent: ${tx.hash}`);
        
        const receipt = await tx.wait();
        console.log(`Role granted in block ${receipt.blockNumber}`);
      } else if (!hasMinterRole) {
        console.log('\nWARNING: Your wallet does not have permission to grant roles');
        console.log('You need to contact the contract admin/owner to grant your wallet the MINTER_ROLE');
        console.log(`Contract address: ${contractAddress}`);
        console.log(`Your wallet address: ${wallet.address}`);
        console.log(`MINTER_ROLE hash: ${MINTER_ROLE}`);
      }
      
      // If contract is paused and wallet can unpause it, do so
      if (isPaused && (hasAdminRole || isOwner)) {
        console.log('Unpausing contract...');
        
        const tx = await contract.unpause();
        console.log(`Transaction sent: ${tx.hash}`);
        
        const receipt = await tx.wait();
        console.log(`Contract unpaused in block ${receipt.blockNumber}`);
      } else if (isPaused) {
        console.log('\nWARNING: Contract is paused but you cannot unpause it');
        console.log('You need to contact the contract admin/owner to unpause the contract');
      }
      
    } catch (error) {
      console.error('Error checking/granting roles:', error);
    }
    
  } catch (error) {
    console.error('Script failed:', error);
  }
}

// Run the script
grantMinterRole().then(() => console.log('Done'));