/**
 * Shared MongoDB lifecycle for the integration tests.
 *
 * The rule that matters: **never drop the database between tests.**
 *
 * `dropDatabase()` destroys every index, and Mongoose's `autoIndex` builds a
 * model's indexes only once per process — so anything it wipes never comes
 * back. That removed `Area`'s 2dsphere index after the first test, making every
 * `$geoNear` driver match fail with `IndexNotFound`, and it removed the unique
 * partial indexes that are the *actual* enforcement for schedule slots and trip
 * slots, so uniqueness tests could pass without a constraint present at all.
 *
 * The old workaround was to resync a hand-listed set of models after each drop.
 * That fails quietly: a model missing from the list doesn't error, it just
 * silently loses its indexes. `Area` was missing from every list.
 *
 * So instead: build every registered model's indexes once up front, then clear
 * documents between tests. Indexes survive, no list to keep in sync, and
 * building them explicitly (rather than leaving it to lazy `autoIndex`) removes
 * the race where a test asserts on a unique constraint that isn't ready yet.
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer = null;

/**
 * Build the schema-declared indexes for every registered model.
 *
 * Every model, deliberately — see the note above on hand-kept lists.
 */
async function buildIndexes() {
  await Promise.all(Object.values(mongoose.models).map((model) => model.createIndexes()));
}

/** Start an in-memory MongoDB, connect, and build all indexes. */
async function connect() {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await buildIndexes();
  return mongoServer;
}

/**
 * Empty every collection, leaving indexes intact. Use this from `beforeEach`
 * in place of `dropDatabase()`.
 */
async function resetData() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

async function disconnect() {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
  mongoServer = null;
}

module.exports = { connect, disconnect, resetData, buildIndexes };
