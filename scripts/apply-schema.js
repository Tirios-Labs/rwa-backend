// scripts/apply-schema.js
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

async function applySchema() {
  const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'postgres',
    password: process.env.DB_PASSWORD || 'Dog@2025',
    port: process.env.DB_PORT || 5432,
  });

  try {
    // Read the schema file
    const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Connect to the database
    const client = await pool.connect();
    console.log('Connected to database, applying schema...');

    // Execute the schema SQL
    await client.query(schema);
    console.log('Schema applied successfully!');

    client.release();
  } catch (err) {
    console.error('Error applying schema:', err);
  } finally {
    await pool.end();
  }
}

applySchema();