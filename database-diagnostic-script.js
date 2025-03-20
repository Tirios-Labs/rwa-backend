require('dotenv').config();
const { Pool } = require('pg');

// Comprehensive database configuration
const dbConfig = {
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
  ssl: process.env.DB_SSL === 'true' ? { 
    rejectUnauthorized: false 
  } : false
};

// Diagnostic function to check database connection
async function testDatabaseConnection() {
  console.log("--- Database Connection Diagnostic ---");
  console.log("Connection Configuration:");
  console.log(`Host: ${dbConfig.host}`);
  console.log(`Port: ${dbConfig.port}`);
  console.log(`Database: ${dbConfig.database}`);
  console.log(`User: ${dbConfig.user}`);
  console.log(`SSL: ${dbConfig.ssl ? 'Enabled' : 'Disabled'}`);

  const pool = new Pool(dbConfig);

  try {
    // Attempt to connect to the database
    const client = await pool.connect();
    
    try {
      // Run a simple query to verify connection
      const result = await client.query('SELECT NOW() as current_time');
      console.log("\n✅ Database Connection Successful!");
      console.log(`Current Database Time: ${result.rows[0].current_time}`);

      // Check database extensions
      const extensionsQuery = `
        SELECT * FROM pg_extension 
        WHERE extname IN ('uuid-ossp', 'pgcrypto')
      `;
      const extensionsResult = await client.query(extensionsQuery);
      
      console.log("\n--- Installed Extensions ---");
      extensionsResult.rows.forEach(ext => {
        console.log(`Extension: ${ext.extname}, Version: ${ext.extversion}`);
      });

    } finally {
      // Release the client back to the pool
      client.release();
    }
  } catch (error) {
    console.error("\n❌ Database Connection Failed:");
    console.error("Error Details:", error.message);
    
    // Provide specific troubleshooting hints
    if (error.message.includes('SCRAM-SERVER-FIRST-MESSAGE')) {
      console.error("\nTroubleshooting Tips:");
      console.error("1. Check your .env file for correct database credentials");
      console.error("2. Verify password is correctly set");
      console.error("3. Ensure the database user has correct permissions");
    }
  } finally {
    // End the pool to release all connections
    await pool.end();
  }
}

// Run the diagnostic
testDatabaseConnection().catch(console.error);

// Export configuration for use in other modules
module.exports = {
  dbConfig,
  testDatabaseConnection
};