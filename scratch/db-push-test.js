const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Try to find dotenv from node_modules
let dotenv;
try {
  dotenv = require('dotenv');
} catch (e) {
  // If not installed, parse manually
}

const envPath = path.resolve(process.cwd(), '.env.test');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const lines = envContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      // Remove surrounding quotes if any
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.substring(1, val.length - 1);
      } else if (val.startsWith("'") && val.endsWith("'")) {
        val = val.substring(1, val.length - 1);
      }
      process.env[key] = val;
    }
  }
}

console.log('Pushing schema to test database with DATABASE_URL:', process.env.DATABASE_URL);
execSync('node node_modules/prisma/build/index.js db push --accept-data-loss', { stdio: 'inherit' });
