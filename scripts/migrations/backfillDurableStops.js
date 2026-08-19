#!/usr/bin/env node
const mongoose = require('mongoose');
const config = require('../../config/config');
const { backfillDurableStopData } = require('../../services/durableStopMigrationService');

const dryRun = process.argv.includes('--dry-run');

async function main() {
  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  const summary = await backfillDurableStopData({ dryRun });
  console.log(JSON.stringify({ dryRun, ...summary }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('[DurableStopMigration] failed:', error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
