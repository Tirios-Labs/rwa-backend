require('dotenv').config();
const app = require('./app');
const { Pool } = require('pg');

// Start server
async function startServer() {
  try {
    const port = process.env.PORT || 3000;

    // Initialize database
    const pool = new Pool({
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'postgres',
      password: process.env.DB_PASSWORD || 'Dog@2025',
      port: process.env.DB_PORT || 5432,
    });

    // Test the connection
    const client = await pool.connect();
    console.log('Successfully connected to PostgreSQL database');
    client.release();

    // Listen for connections
    const server = app.listen(port, () => {
      console.log(`Identity Bridge server running on port ${port}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Handle cleanup
    const gracefulShutdown = async () => {
      console.log('Shutting down server...');
      
      server.close(() => {
        console.log('HTTP server closed');
      });
      
      if (pool) {
        await pool.end();
        console.log('Database connections closed');
      }
      
      process.exit(0);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
}

startServer();