const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

// Create PostgreSQL connection pool
const pool = new Pool({
  user: process.env.POSTGRES_USER || 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  database: process.env.POSTGRES_DB || 'multi_chain_platform',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  ssl: process.env.POSTGRES_SSL === 'true' ? 
    { rejectUnauthorized: false } : false
});

// Test connection
pool.connect((err, client, done) => {
  if (err) {
    console.error('Error connecting to PostgreSQL database:', err);
  } else {
    console.log('Connected to PostgreSQL database');
    done();
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};