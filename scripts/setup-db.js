const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function setupDatabase() {
  const client = new Client({
    user: process.env.POSTGRES_USER,
    host: process.env.POSTGRES_HOST,
    database: process.env.POSTGRES_DB,
    password: process.env.POSTGRES_PASSWORD,
    port: parseInt(process.env.POSTGRES_PORT || '5432')
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL database');

    // Read SQL schema file
    const schemaPath = path.join(__dirname, '../src/db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Execute SQL schema
    await client.query(schema);
    console.log('Database schema created successfully');

    // Optional: Create initial test data
    // await client.query('INSERT INTO...');
    
    console.log('Database setup completed successfully');
  } catch (error) {
    console.error('Error setting up database:', error);
  } finally {
    await client.end();
  }
}

setupDatabase();