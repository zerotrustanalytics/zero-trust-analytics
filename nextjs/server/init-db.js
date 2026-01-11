/**
 * DATABASE INITIALIZATION SCRIPT
 * ===============================
 * Run this to initialize the database schema for self-hosted deployments.
 * Uses the same schema as the Netlify functions (turso.js with rollup tables).
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initializeDatabase() {
  try {
    console.log('Initializing Zero Trust Analytics database...');

    // Ensure data directory exists for file: URLs
    const dbUrl = process.env.TURSO_DATABASE_URL || '';
    if (dbUrl.startsWith('file:')) {
      const dbPath = dbUrl.replace('file:', '');
      const dbDir = path.dirname(dbPath);

      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        console.log(`Created data directory: ${dbDir}`);
      }
    }

    // Import and run turso.js initSchema (same as Netlify functions)
    const tursoPath = path.join(__dirname, '..', 'netlify', 'functions', 'lib', 'turso.js');
    const { initSchema } = await import(tursoPath);
    await initSchema();

    console.log('✓ Database initialized successfully!');
    console.log(`  Database: ${dbUrl}`);

    process.exit(0);
  } catch (error) {
    console.error('✗ Database initialization failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initializeDatabase();
}

export default initializeDatabase;
