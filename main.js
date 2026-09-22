const config = require('./config');
const { loadVehicleNumbers } = require('./vehicle_reader');
const { getPendingVehiclesAsync, markVehicleProcessedInDB } = require('./checkpoint');
const ChallanBrowserEngine = require('./browser_engine');
const { syncBatchToPostgres } = require('./db_sync');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const REAUTH_EVERY_N_VEHICLES = 500;  // Re-auth after every 500 vehicles
const MAX_VEHICLE_RETRIES = 7;         // Retry a vehicle up to 7 times before forcing re-auth

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
 * - OTP Login ONCE at start
 * - Keep browser open for ALL batches
 * - Between batches: 60s wait + page refresh (NO re-login)
 * - Re-authenticate only:
 *     (a) After every 500 vehicles scraped, OR
 *     (b) If a vehicle fails after MAX_VEHICLE_RETRIES consecutive retries
 * - Close browser once at the very end
 */
async function runAutomationPipeline() {
  const batchSize = config.BATCH_SIZE || 50;
  const maxBatches = config.MAX_BATCHES || 30;

  console.log('===============================================================');
  console.log('  CHALLAN PIPELINE - OPTIMIZED SINGLE SESSION');
  console.log('===============================================================');
  console.log(`* DB: ${config.PG_CONFIG.database} on ${config.PG_CONFIG.host}`);
  console.log(`* Batch Size: ${batchSize} | Max Batches: ${maxBatches}`);
  console.log(`* Re-auth: Every ${REAUTH_EVERY_N_VEHICLES} vehicles OR after ${MAX_VEHICLE_RETRIES} consecutive failures`);
  console.log(`* Inter-Batch: 60s wait + page refresh (no new login)`);

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
  console.log(`\n[Main] Logged in. Browser stays open for the entire run.\n`);

  let batchesProcessed = 0;
  let totalScraped = 0;
  let vehiclesSinceLastReauth = 0;

  try {
    while (pendingVehicles.length > 0 && batchesProcessed < maxBatches) {
      batchesProcessed++;
      const currentBatch = pendingVehicles.slice(0, batchSize);

      console.log(`\n===============================================================`);
      console.log(` [BATCH ${batchesProcessed}] Processing ${currentBatch.length} vehicles...`);
      console.log(` Fleet Remaining: ${pendingVehicles.length} | Scraped Since Last Re-auth: ${vehiclesSinceLastReauth}`);
      console.log(`===============================================================`);

      const batchRecords = [];

      for (let i = 0; i < currentBatch.length; i++) {
        const vehicle = currentBatch[i];
        console.log(`[Progress] Batch ${batchesProcessed} - Vehicle ${i + 1}/${currentBatch.length} (${vehicle.clean})`);

        let scraped = false;
        let attempts = 0;

        while (!scraped && attempts < MAX_VEHICLE_RETRIES) {
          attempts++;
          try {
            const records = await engine.scrapeVehicleChallan(vehicle);
            batchRecords.push(...records);
            await markVehicleProcessedInDB(vehicle.clean, {
              totalFine: records[0]?.totalAmountPending || 0,
              noticeCount: records.filter(r => r.noticeNo !== 'N/A').length,
              status: records[0]?.status || 'PROCESSED'
            });
            totalScraped++;
            vehiclesSinceLastReauth++;
            scraped = true;

          } catch (err) {
            console.warn(`[Retry ${attempts}/${MAX_VEHICLE_RETRIES}] ${vehicle.clean}: ${err.message}`);
            if (attempts < MAX_VEHICLE_RETRIES) {
              await delay(1500 * attempts); // exponential backoff
            }
          }
        }

        // All retries exhausted → force re-authentication and retry once more
        if (!scraped) {
          console.error(`[Re-auth Triggered] ${vehicle.clean} failed after ${MAX_VEHICLE_RETRIES} retries. Re-authenticating...`);
          try {
            await engine.loginWithOTP();
            vehiclesSinceLastReauth = 0;
            console.log(`[Re-auth] Success. Retrying ${vehicle.clean}...`);
            const records = await engine.scrapeVehicleChallan(vehicle);
            batchRecords.push(...records);
            await markVehicleProcessedInDB(vehicle.clean, {
              totalFine: records[0]?.totalAmountPending || 0,
              noticeCount: records.filter(r => r.noticeNo !== 'N/A').length,
              status: records[0]?.status || 'PROCESSED'
            });
            totalScraped++;
            vehiclesSinceLastReauth++;
          } catch (finalErr) {
            console.error(`[Skipped] ${vehicle.clean} could not be scraped even after re-auth: ${finalErr.message}`);
          }
        }

        // Re-authenticate every 500 vehicles as a session refresh
        if (vehiclesSinceLastReauth >= REAUTH_EVERY_N_VEHICLES) {
          console.log(`\n[Scheduled Re-auth] ${vehiclesSinceLastReauth} vehicles scraped. Refreshing session...`);
          try {
            await engine.loginWithOTP();
            vehiclesSinceLastReauth = 0;
            console.log(`[Scheduled Re-auth] Session refreshed. Continuing...\n`);
          } catch (reauthErr) {
            console.warn(`[Scheduled Re-auth Warning] Re-auth failed: ${reauthErr.message}. Continuing anyway.`);
          }
        }

        await delay(800);
      }

      // Sync batch to PostgreSQL immediately
      if (batchRecords.length > 0) {
        console.log(`\n[Batch ${batchesProcessed} Sync] Saving ${batchRecords.length} records to PostgreSQL...`);
        await syncBatchToPostgres(batchRecords, currentBatch).catch(e => {
          console.error(`[Sync Error] ${e.message}`);
        });
      }

      // Update pending list
      pendingVehicles = await getPendingVehiclesAsync(allVehicles);
      console.log(`[Batch ${batchesProcessed}] Done. Total scraped: ${totalScraped} | Remaining: ${pendingVehicles.length}`);

      // Between batches: 60s wait + page refresh ONLY (no new login)
      if (pendingVehicles.length > 0 && batchesProcessed < maxBatches) {
        console.log(`\n[Cooldown] 60s wait + page refresh (browser stays open)...`);
        await delay(60000);
        await engine.page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await delay(2000);
        console.log(`[Cooldown] Page refreshed. Resuming next batch...\n`);
      }
    }

  } finally {
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
