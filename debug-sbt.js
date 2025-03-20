// debug-sbt.js
// Run with: node debug-sbt.js
require('dotenv').config();
const ethers = require('ethers');

async function debugSoulboundNFT() {
  try {
    // --- Connection Setup ---
    const rpcUrl = process.env.POLYGON_RPC_URL;
    const privateKey = process.env.POLYGON_PRIVATE_KEY;
    const contractAddress = process.env.POLYGON_SOULBOUND_ADDRESS;
    
    console.log('--- Environment Check ---');
    console.log(`RPC URL: ${rpcUrl}`);
    console.log(`Contract Address: ${contractAddress}`);
    console.log(`Wallet Address: Using private key ${privateKey ? (privateKey.slice(0, 6) + '...') : 'not set'}`);
    
    // --- Provider Setup ---
    console.log('\n--- Provider Setup ---');
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    console.log('Provider initialized');
    
    // Check network
    const network = await provider.getNetwork();
    console.log(`Connected to network: ${network.name} (Chain ID: ${network.chainId})`);
    
    // --- Wallet Setup ---
    const wallet = new ethers.Wallet(privateKey, provider);
    console.log(`Wallet address: ${wallet.address}`);
    
    // Check balance
    const balance = await provider.getBalance(wallet.address);
    console.log(`Wallet balance: ${ethers.formatEther(balance)} MATIC`);
    
    if (balance <= 0) {
      console.error('ERROR: Wallet has no funds. Please add testnet MATIC.');
      return;
    }
    
    // --- Contract Inspection ---
    console.log('\n--- Contract Inspection ---');
    
    // Check if contract exists at the address
    const code = await provider.getCode(contractAddress);
    if (code === '0x') {
      console.error('ERROR: No contract found at the specified address.');
      return;
    }
    console.log('Contract exists at the specified address');
    
    // --- Try to get interface from contract ---
    console.log('\n--- Contract Interface Detection ---');
    
    // Test different function signatures that might exist
    const possibleFunctions = [
      "function mintSoulboundNFT(address to, bytes32 identityHash, string memory did, string memory metadataURI) external returns (uint256)",
      "function verifyIdentity(address entity, string memory did, bytes32 credentialHash, string memory credentialCID) external returns (uint256)",
      "function mint(address to, string memory did, string memory uri) external returns (uint256)",
      "function safeMint(address to, string memory did, string memory uri) external returns (uint256)",
      "function getTokenIdByDID(string memory did) external view returns (uint256)"
    ];
    
    // Try each function to see which is supported
    for (const funcSig of possibleFunctions) {
      try {
        const funcName = funcSig.split('function ')[1].split('(')[0];
        const testAbi = [funcSig];
        const testContract = new ethers.Contract(contractAddress, testAbi, provider);
        
        // For view functions, try to call them
        if (funcSig.includes('view')) {
          try {
            // Just attempt with a dummy DID to see if the function exists
            await testContract[funcName]('did:example:test');
            console.log(`✓ Function ${funcName} EXISTS and is callable`);
          } catch (error) {
            if (error.message.includes('revert') || error.message.includes('invalid argument')) {
              console.log(`✓ Function ${funcName} EXISTS but call failed with expected error`);
            } else if (error.message.includes('method not found')) {
              console.log(`✗ Function ${funcName} DOES NOT EXIST`);
            } else {
              console.log(`? Function ${funcName} status UNKNOWN: ${error.message}`);
            }
          }
        } else {
          // For non-view functions, try to estimate gas
          try {
            // Create dummy parameters
            const dummyAddress = wallet.address;
            const dummyHash = ethers.keccak256(ethers.toUtf8Bytes('test'));
            const dummyDid = 'did:example:test';
            const dummyUri = 'ipfs://test';
            
            // Figure out parameters based on function name
            let params = [];
            if (funcName === 'mintSoulboundNFT') {
              params = [dummyAddress, dummyHash, dummyDid, dummyUri];
            } else if (funcName === 'verifyIdentity') {
              params = [dummyAddress, dummyDid, dummyHash, dummyUri];
            } else if (funcName === 'mint' || funcName === 'safeMint') {
              params = [dummyAddress, dummyDid, dummyUri];
            }
            
            // Try to estimate gas
            await testContract[funcName].estimateGas(...params, { from: wallet.address });
            console.log(`✓ Function ${funcName} EXISTS and gas estimation succeeded`);
          } catch (error) {
            if (error.message.includes('revert') || error.message.includes('invalid argument')) {
              console.log(`✓ Function ${funcName} EXISTS but gas estimation failed with: ${error.message}`);
            } else if (error.message.includes('method not found') || error.message.includes('no matching function')) {
              console.log(`✗ Function ${funcName} DOES NOT EXIST`);
            } else {
              console.log(`? Function ${funcName} status UNKNOWN: ${error.message}`);
            }
          }
        }
      } catch (error) {
        console.log(`Failed to test ${funcSig.split('function ')[1].split('(')[0]}: ${error.message}`);
      }
    }
    
    // --- Get Events From Contract ---
    console.log('\n--- Recent Contract Events ---');
    try {
      // Generic event filter for the last 100 blocks
      const blockNumber = await provider.getBlockNumber();
      const filter = {
        address: contractAddress,
        fromBlock: blockNumber - 100,
        toBlock: 'latest'
      };
      
      const logs = await provider.getLogs(filter);
      console.log(`Found ${logs.length} events in the last 100 blocks`);
      
      if (logs.length > 0) {
        console.log('Latest events:');
        for (let i = 0; i < Math.min(logs.length, 3); i++) {
          console.log(`Event ${i+1}: ${JSON.stringify(logs[i])}`);
        }
      }
    } catch (error) {
      console.log(`Failed to retrieve contract events: ${error.message}`);
    }
    
    // --- Test a specific function ---
    console.log('\n--- Testing Specific Contract Call ---');
    // This is where you'd try the actual function call
    // Based on the results above, choose the correct function name and parameters
    
    console.log('To test the actual minting process, update this script with the correct function name and parameters.');
    
  } catch (error) {
    console.error('Diagnostic failed:', error);
  }
}

// Run the diagnostics
debugSoulboundNFT().then(() => console.log('Diagnostics complete'));