const config = require('./config');
const { loadVehicleNumbers } = require('./vehicle_reader');
const { getPendingVehiclesAsync, markVehicleProcessedInDB } = require('./checkpoint');
const ChallanBrowserEngine = require('./browser_engine');
const { syncBatchToPostgres } = require('./db_sync');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs a formatted countdown for inter-batch cooldown periods.
 */
async function runCooldownTimer(seconds = 15) {
  console.log(`\n===============================================================`);
  console.log(` [COOLDOWN] Waiting ${seconds} seconds before starting next batch...`);
  console.log(`===============================================================`);

  let remaining = seconds;
  while (remaining > 0) {
    console.log(`[Cooldown Timer] ${remaining} second(s) remaining...`);
    const step = Math.min(5, remaining);
    await delay(step * 1000);
    remaining -= step;
  }
  console.log(`[Cooldown Timer] Cooldown complete! Initiating next batch...\n`);
}

/**
 * Optimized Live Pipeline Controller (PostgreSQL Native Ingestion & Reconciliation)
 */
async function runAutomationPipeline() {
  const cooldownSecs = config.COOLDOWN_SECONDS || 15;

  console.log('===============================================================');
  console.log('  OPTIMIZED CHALLAN AUTOMATION PIPELINE (KARNATAKA ONE PORTAL)');
  console.log('===============================================================');
  console.log(`* Target PostgreSQL Database: ${config.PG_CONFIG.database} on ${config.PG_CONFIG.host}`);
  console.log(`* Batch Size: ${config.BATCH_SIZE} vehicles per session`);
  console.log(`* Max Batches Scheduled: ${config.MAX_BATCHES}`);
  console.log(`* Inter-Batch Cooldown: ${cooldownSecs} seconds`);

  // 1. Fetch Live Bangalore Fleet List directly from PostgreSQL (core_vehicle_onboarding)
  const allVehicles = await loadVehicleNumbers();
  console.log(`[Main] Total Bangalore (KA) vehicles loaded: ${allVehicles.length}`);

  // 2. Identify Pending Unscraped Vehicles using DB Checkpoint
  let pendingVehicles = await getPendingVehiclesAsync(allVehicles);
  const alreadyCompleted = allVehicles.length - pendingVehicles.length;
  console.log(`[Main] Status: Total=${allVehicles.length} | Completed=${alreadyCompleted} | Pending=${pendingVehicles.length}\n`);

  if (pendingVehicles.length === 0) {
    console.log('🎉 All Bangalore vehicles have been scraped and reconciled in DB!');
    return;
  }

  const batchSize = config.BATCH_SIZE || 50;
  const maxBatches = config.MAX_BATCHES || 30;
  let batchesProcessed = 0;

  while (pendingVehicles.length > 0 && batchesProcessed < maxBatches) {
    batchesProcessed++;
    const currentBatchVehicles = pendingVehicles.slice(0, batchSize);

    console.log(`\n===============================================================`);
    console.log(` [BATCH ${batchesProcessed}/${maxBatches}] Processing ${currentBatchVehicles.length} vehicle(s)...`);
    console.log(` Remaining in Fleet: ${pendingVehicles.length}`);
    console.log(`===============================================================`);

    const engine = new ChallanBrowserEngine();
    const batchRecords = [];

    try {
      // Step A: Launch Browser & Authenticate with SMS OTP
      await engine.initBrowser();
      await engine.loginWithOTP();

      // Step B: Scrape Each Vehicle in the Batch
      for (let i = 0; i < currentBatchVehicles.length; i++) {
        const vehicle = currentBatchVehicles[i];
        console.log(`\n[Progress] Batch ${batchesProcessed} - Vehicle ${i + 1}/${currentBatchVehicles.length} (${vehicle.clean})`);

        try {
          const records = await engine.scrapeVehicleChallan(vehicle);
          batchRecords.push(...records);

          // Mark vehicle completed in DB Checkpoint
          await markVehicleProcessedInDB(vehicle.clean, {
            totalFine: records[0]?.totalAmountPending || 0,
            noticeCount: records.filter(r => r.noticeNo !== 'N/A' && r.noticeNo !== 'ERROR').length,
            status: records[0]?.status || 'PROCESSED'
          });

        } catch (err) {
          console.error(`[Main Error] Failed processing vehicle ${vehicle.clean}: ${err.message}`);
        }

        await delay(1200);
      }

    } catch (batchErr) {
      console.error(`\n[Main Batch Error] Batch ${batchesProcessed} encountered an error: ${batchErr.message}`);
    } finally {
      await engine.resetSearchSession().catch(() => {});
      await engine.close().catch(() => {});
    }

    // Step C: IMMEDIATE PER-BATCH TRANSACTIONAL POSTGRESQL SYNC & RECONCILIATION
    if (batchRecords.length > 0) {
      console.log(`\n[Batch ${batchesProcessed} Sync] Saving ${batchRecords.length} records directly to PostgreSQL...`);
      await syncBatchToPostgres(batchRecords, currentBatchVehicles).catch(e => {
        console.error(`[Batch ${batchesProcessed} Sync Error] ${e.message}`);
      });
    }

    // Step D: Update Pending List
    pendingVehicles = await getPendingVehiclesAsync(allVehicles);

    console.log(`\n===============================================================`);
    console.log(` [BATCH ${batchesProcessed} COMPLETE] Synced ${currentBatchVehicles.length} vehicles to DB.`);
    console.log(` Remaining Vehicles to Process: ${pendingVehicles.length}`);
    console.log(`===============================================================`);

    if (pendingVehicles.length > 0 && batchesProcessed < maxBatches) {
      await runCooldownTimer(cooldownSecs);
    }
  }

  console.log(`\n===============================================================`);
  console.log(` [PIPELINE RUN COMPLETED]`);
  console.log(` Batches Executed: ${batchesProcessed}/${maxBatches}`);
  console.log(` Total Vehicles Synced: ${allVehicles.length - pendingVehicles.length}/${allVehicles.length}`);
  console.log(` PostgreSQL Table: vehicle_challans (${config.PG_CONFIG.host})`);
  console.log(`===============================================================\n`);
}

if (require.main === module) {
  runAutomationPipeline().catch((err) => {
    console.error('Fatal Pipeline Execution Error:', err);
    process.exit(1);
  });
}

module.exports = { runAutomationPipeline };
