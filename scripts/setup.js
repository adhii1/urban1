#!/usr/bin/env node
/**
 * First-run setup: create the env file a fresh clone doesn't have.
 *
 * The .env.* files are gitignored, so cloning this repo gives you no config and
 * the server exits with "Required environment variable missing" before it can
 * serve anything. This turns that into one command.
 *
 *   npm run setup
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const templatePath = path.join(root, '.env.example');

const envFileFor = (nodeEnv) => {
  if (nodeEnv === 'test') return '.env.test';
  if (nodeEnv === 'production' || nodeEnv === 'prod') return '.env.prod';
  return '.env.dev';
};

const target = envFileFor(process.argv[2] || process.env.NODE_ENV || 'development');
const targetPath = path.join(root, target);

if (!fs.existsSync(templatePath)) {
  console.error('✖ .env.example is missing — cannot generate config.');
  process.exit(1);
}

if (fs.existsSync(targetPath)) {
  console.log(`✔ ${target} already exists — leaving it alone.`);
  console.log('  Start the server with: npm run dev');
  process.exit(0);
}

const secret = () => crypto.randomBytes(48).toString('hex');

const contents = fs
  .readFileSync(templatePath, 'utf8')
  .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret()}`)
  .replace(/^REFRESH_SECRET=.*$/m, `REFRESH_SECRET=${secret()}`);

fs.writeFileSync(targetPath, contents, { mode: 0o600 });

console.log(`✔ Created ${target} from .env.example (JWT secrets generated).`);
console.log('');
console.log(`  One thing left: set MONGODB_URI in ${target}`);
console.log('    Atlas -> mongodb+srv://<user>:<pass>@<cluster>/torqq');
console.log('    Local -> mongodb://127.0.0.1:27017/torqq');
console.log('');
console.log('  Then: npm run dev   and open http://localhost:4000');
