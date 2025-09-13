const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🗃️  Connecting to database...');

    // Test connection
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    console.log('✅ Database connected:', result.rows[0]);
    client.release();

    // Read and execute the MCP migration
    const migrationPath = path.join(__dirname, 'init-with-mcp.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('🚀 Running MCP migration...');
    await pool.query(migrationSQL);

    console.log('✅ MCP migration completed successfully!');
    console.log('\n📊 Available MCP servers:');

    // Show available MCP servers
    const servers = await pool.query('SELECT server_id, name, description FROM mcp_servers WHERE published = true');
    servers.rows.forEach(server => {
      console.log(`   - ${server.server_id}: ${server.name} - ${server.description}`);
    });

  } catch (error) {
    console.error('❌ Migration failed:', error.message);

    // Check if tables already exist
    if (error.code === '42P07') { // relation already exists
      console.log('ℹ️  Tables already exist. Checking MCP servers...');
      try {
        const servers = await pool.query('SELECT server_id, name FROM mcp_servers WHERE published = true');
        console.log('✅ Found', servers.rows.length, 'MCP servers');
        servers.rows.forEach(server => {
          console.log(`   - ${server.server_id}: ${server.name}`);
        });
      } catch (checkError) {
        console.error('❌ Error checking existing data:', checkError.message);
      }
    }
  } finally {
    await pool.end();
  }
}

runMigration();