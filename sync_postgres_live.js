/**
 * DEPRECATED: sync_postgres_live.js
 * This legacy script previously contained a destructive DROP TABLE statement.
 * It has been safely replaced by the production-safe sequence-preserving synchronizer in db_sync.js.
 */
const { syncToPostgres } = require('./db_sync');

async function inspectAndSync() {
  console.warn('[DEPRECATION NOTICE] sync_postgres_live.js is deprecated. Executing safe sync via db_sync.js...');
  return await syncToPostgres();
}

if (require.main === module) {
  inspectAndSync();
}

module.exports = { inspectAndSync };

