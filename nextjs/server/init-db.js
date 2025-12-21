/**
 * DATABASE INITIALIZATION SCRIPT
 * ===============================
 * Run this to initialize the database schema for self-hosted deployments.
 */

import { initSchema } from './db-adapter.js';
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

    // Ensure data directory exists
    const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'analytics.db');
    const dbDir = path.dirname(dbPath);

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`Created data directory: ${dbDir}`);
    }

    // Initialize schema
    await initSchema();

    console.log('✓ Database initialized successfully!');
    console.log(`  Database location: ${dbPath}`);

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
