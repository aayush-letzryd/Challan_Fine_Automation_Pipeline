const config = require('./config');
const { loadVehicleNumbers } = require('./vehicle_reader');
const { getPendingVehiclesAsync, markVehicleProcessedInDB } = require('./checkpoint');
const ChallanBrowserEngine = require('./browser_engine');
const { syncBatchToPostgres } = require('./db_sync');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Resets the DB checkpoint at the start of every fresh pipeline run.
 */
async function resetCheckpoint() {
  const { Client } = require('pg');
  const client = new Client(config.PG_CONFIG);
  try {
    await client.connect();
    await client.query('TRUNCATE TABLE challan_scrape_checkpoint;');
    await client.end();
    console.log(`[Checkpoint] Daily checkpoint reset. All vehicles queued for fresh scrape.`);
  } catch (err) {
    console.warn(`[Checkpoint Warning] Could not reset checkpoint: ${err.message}`);
    await client.end().catch(() => {});
  }
}

/**
 * Main Pipeline:
 * - Login with OTP ONCE at the start
 * - Keep browser open for ALL batches
 * - Between batches: wait 60 seconds + page refresh (no re-login)
 * - Close browser only at the very end
 */
async function runAutomationPipeline() {
  const batchSize = config.BATCH_SIZE || 50;
  const maxBatches = config.MAX_BATCHES || 30;

  console.log('===============================================================');
  console.log('  CHALLAN PIPELINE - SINGLE SESSION (NO PER-BATCH RE-AUTH)');
  console.log('===============================================================');
  console.log(`* DB: ${config.PG_CONFIG.database} on ${config.PG_CONFIG.host}`);
  console.log(`* Batch Size: ${batchSize} | Max Batches: ${maxBatches}`);
  console.log(`* Inter-Batch: 60s wait + page refresh (NO new login)`);

  // 0. Reset daily checkpoint
  await resetCheckpoint();

  // 1. Load live Bangalore fleet
  const allVehicles = await loadVehicleNumbers();
  let pendingVehicles = await getPendingVehiclesAsync(allVehicles);
  console.log(`[Main] Total: ${allVehicles.length} | Pending: ${pendingVehicles.length}\n`);

  if (pendingVehicles.length === 0) {
    console.log('All vehicles already processed.');
    return;
  }

  // 2. Launch browser and login ONCE
  const engine = new ChallanBrowserEngine();
  await engine.initBrowser();
  await engine.loginWithOTP();
  console.log(`\n[Main] Logged in. Browser will stay open for entire run.\n`);

  let batchesProcessed = 0;
  let totalScraped = 0;

  try {
    while (pendingVehicles.length > 0 && batchesProcessed < maxBatches) {
      batchesProcessed++;
      const currentBatch = pendingVehicles.slice(0, batchSize);

      console.log(`\n===============================================================`);
      console.log(` [BATCH ${batchesProcessed}] Processing ${currentBatch.length} vehicles...`);
      console.log(` Fleet Remaining: ${pendingVehicles.length}`);
      console.log(`===============================================================`);

      const batchRecords = [];

      // Scrape each vehicle in this batch
      for (let i = 0; i < currentBatch.length; i++) {
        const vehicle = currentBatch[i];
        console.log(`[Progress] Batch ${batchesProcessed} - Vehicle ${i + 1}/${currentBatch.length} (${vehicle.clean})`);

        try {
          const records = await engine.scrapeVehicleChallan(vehicle);
          batchRecords.push(...records);

          await markVehicleProcessedInDB(vehicle.clean, {
            totalFine: records[0]?.totalAmountPending || 0,
            noticeCount: records.filter(r => r.noticeNo !== 'N/A').length,
            status: records[0]?.status || 'PROCESSED'
          });

          totalScraped++;
        } catch (err) {
          console.error(`[Error] ${vehicle.clean}: ${err.message}`);
        }

        await delay(800);
      }

      // Sync this batch to PostgreSQL
      if (batchRecords.length > 0) {
        console.log(`\n[Batch ${batchesProcessed} Sync] Saving ${batchRecords.length} records to PostgreSQL...`);
        await syncBatchToPostgres(batchRecords, currentBatch).catch(e => {
          console.error(`[Sync Error] ${e.message}`);
        });
      }

      // Update pending list
      pendingVehicles = await getPendingVehiclesAsync(allVehicles);
      console.log(`[Batch ${batchesProcessed}] Done. Total scraped: ${totalScraped} | Remaining: ${pendingVehicles.length}`);

      // Between batches: 60s wait + page refresh ONLY (NO new browser, NO new login)
      if (pendingVehicles.length > 0 && batchesProcessed < maxBatches) {
        console.log(`\n[Cooldown] Waiting 60 seconds then refreshing page...`);
        await delay(60000);
        await engine.page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await delay(2000);
        console.log(`[Cooldown] Page refreshed. Continuing next batch...\n`);
      }
    }

  } finally {
    // Close browser ONCE at the very end
    await engine.close().catch(() => {});
    console.log(`[Main] Browser closed.`);
  }

  console.log(`\n===============================================================`);
  console.log(` [PIPELINE COMPLETE]`);
  console.log(` Vehicles Scraped: ${totalScraped}/${allVehicles.length}`);
  console.log(` PostgreSQL: vehicle_challans @ ${config.PG_CONFIG.host}`);
  console.log(`===============================================================\n`);
}

if (require.main === module) {
  runAutomationPipeline().catch((err) => {
    console.error('Fatal Pipeline Error:', err);
    process.exit(1);
  });
}

module.exports = { runAutomationPipeline };
