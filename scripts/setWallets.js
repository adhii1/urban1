#!/usr/bin/env node
/**
 * Set every customer's wallet balance to a fixed amount.
 *
 * Reports what it would change and writes nothing unless you pass --apply.
 *
 *   node scripts/setWallets.js            # show current state, change nothing
 *   node scripts/setWallets.js --apply    # set every balance to 10000
 *   node scripts/setWallets.js --amount 5000 --apply
 *   node scripts/setWallets.js --only-below --apply   # never lower anyone
 *
 * Why this exists rather than a mongosh one-liner: mongosh could not resolve this
 * cluster's SRV record on this machine (querySrv EBADRESP). A mongodb+srv:// URI
 * needs a DNS SRV lookup, and the local resolver returns a malformed response for
 * it. So this script resolves the SRV records through a public resolver itself and
 * builds a direct, non-SRV connection string — no system DNS change needed.
 *
 * Wallet balance is spendable money (services/subscriptionService.js debits it to
 * buy a subscription) and there is no ledger model in this codebase, so an applied
 * run writes a JSON receipt of prior balances. That receipt is the only record
 * that this happened, and the only way to put balances back.
 */
const dns = require('node:dns');
const fs = require('node:fs');
const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.dev') });

const DEFAULT_AMOUNT = 10000;
// Resolvers that answer SRV queries correctly: Cloudflare, then Google.
const FALLBACK_DNS = ['1.1.1.1', '8.8.8.8'];

function parseArgs(argv) {
  const amountIndex = argv.indexOf('--amount');
  return {
    apply: argv.includes('--apply'),
    onlyBelow: argv.includes('--only-below'),
    amount: amountIndex === -1 ? DEFAULT_AMOUNT : Number(argv[amountIndex + 1]),
  };
}

const rupees = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

/**
 * Turn a mongodb+srv:// URI into a direct mongodb:// URI.
 *
 * The driver would do this lookup itself, but through the system resolver — the
 * one that is failing here. Doing it manually against a known-good resolver is
 * what sidesteps the problem.
 */
async function resolveSrvUri(srvUri) {
  const url = new URL(srvUri);
  const hostname = url.hostname;

  dns.setServers(FALLBACK_DNS);
  const resolver = new dns.promises.Resolver();
  resolver.setServers(FALLBACK_DNS);

  const [srvRecords, txtRecords] = await Promise.all([
    resolver.resolveSrv(`_mongodb._tcp.${hostname}`),
    resolver.resolveTxt(hostname).catch(() => []),
  ]);

  if (srvRecords.length === 0) throw new Error(`No SRV records for ${hostname}`);

  const hosts = srvRecords.map((r) => `${r.name}:${r.port}`).join(',');
  // Atlas publishes replicaSet/authSource in a TXT record on the same hostname;
  // both are required for a direct connection to authenticate and behave the same.
  const txtOptions = txtRecords.flat().join('&');

  const auth = url.username ? `${url.username}:${url.password}@` : '';
  const params = new URLSearchParams(txtOptions);
  for (const [k, v] of new URLSearchParams(url.search)) params.set(k, v);
  params.set('ssl', 'true');

  return {
    uri: `mongodb://${auth}${hosts}/?${params.toString()}`,
    hosts: srvRecords.map((r) => r.name),
  };
}

async function main() {
  const { apply, amount, onlyBelow } = parseArgs(process.argv.slice(2));

  if (!Number.isFinite(amount) || amount < 0) {
    console.error(`Invalid --amount: ${amount}`);
    process.exitCode = 1;
    return;
  }

  const srvUri = process.env.MONGODB_URI;
  if (!srvUri) {
    console.error('MONGODB_URI is not set. Expected it in .env.dev.');
    process.exitCode = 1;
    return;
  }

  const { MongoClient } = require('mongodb');

  let uri = srvUri;
  if (srvUri.startsWith('mongodb+srv://')) {
    process.stdout.write('Resolving cluster via 1.1.1.1 (bypassing local DNS)... ');
    const resolved = await resolveSrvUri(srvUri);
    uri = resolved.uri;
    console.log(`found ${resolved.hosts.length} hosts`);
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000 });
  await client.connect();

  const db = client.db();
  const customers = db.collection('customers');

  console.log(`Database:    ${db.databaseName}`);
  console.log(`Target:      ${rupees(amount)} per customer`);
  console.log(`Mode:        ${apply ? 'APPLY (writing)' : 'DRY RUN (no changes)'}`);
  console.log('');

  // Match what the app treats as a live customer: the pre-find hook on the model
  // scopes to isDeleted: false, and the raw driver does not run that hook.
  const filter = { isDeleted: { $ne: true } };
  if (onlyBelow) filter.walletBalance = { $lt: amount };

  const total = await customers.countDocuments({});
  const targeted = await customers.find(filter, { projection: { name: 1, walletBalance: 1 } }).toArray();
  const sum = (rows) => rows.reduce((acc, r) => acc + (r.walletBalance || 0), 0);

  console.log(`Customers in collection: ${total}`);
  console.log(`Targeted by this run:    ${targeted.length}`);
  console.log(`Their balance now:       ${rupees(sum(targeted))}`);
  console.log(`Their balance after:     ${rupees(amount * targeted.length)}`);

  const lowered = targeted.filter((c) => (c.walletBalance || 0) > amount);
  if (lowered.length > 0 && !onlyBelow) {
    console.log(
      `\nNote: ${lowered.length} customer(s) hold more than ${rupees(amount)} and will be `
      + `lowered to it.\n      Pass --only-below to raise low balances without reducing anyone.`
    );
  }

  if (targeted.length === 0) {
    // The collection is not empty but nothing matched, so the filter is wrong
    // rather than the data being absent. Show why instead of just giving up —
    // and look for the real customer data elsewhere on the cluster, since a
    // mongodb+srv URI with no database path lands on Atlas's default `test`.
    if (total > 0) await explainEmptyMatch(client, db, customers, filter);
    else console.log('\nThe customers collection is empty.');
    console.log('\nNothing to do.');
    await client.close();
    return;
  }

  if (!apply) {
    console.log('\nDry run — nothing written. Re-run with --apply to make the change.');
    await client.close();
    return;
  }

  // Receipt first: if the update succeeds and this file was never written, there
  // is no record of the prior balances anywhere.
  const receiptPath = path.resolve(`wallet-receipt-${Date.now()}.json`);
  fs.writeFileSync(receiptPath, JSON.stringify({
    appliedAt: new Date().toISOString(),
    database: db.databaseName,
    amountPerCustomer: amount,
    onlyBelow,
    priorBalances: targeted.map((c) => ({
      customerId: String(c._id),
      name: c.name,
      walletBalanceBefore: c.walletBalance || 0,
    })),
  }, null, 2));
  console.log(`\nReceipt (prior balances): ${receiptPath}`);

  const result = await customers.updateMany(filter, { $set: { walletBalance: amount } });
  console.log(`Matched ${result.matchedCount}, modified ${result.modifiedCount}.`);

  const verify = await customers.find(filter, { projection: { walletBalance: 1 } }).toArray();
  console.log(`Verified total: ${rupees(sum(verify))}`);

  await client.close();
}

main().catch((error) => {
  console.error(`\nFailed: ${error.message}`);
  if (error.message.includes('querySrv') || error.code === 'EBADRESP') {
    console.error('DNS could not resolve the cluster even via 1.1.1.1 — check your connection.');
  }
  if (String(error.message).includes('Authentication failed')) {
    console.error('The credentials in .env.dev were rejected by Atlas.');
  }
  process.exitCode = 1;
});
