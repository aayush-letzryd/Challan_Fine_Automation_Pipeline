const config = require('./config');
const { loadVehiclesFromExcel } = require('./vehicle_reader');
const { isProcessed, markProcessed, getPendingVehicles, getProcessedCount } = require('./checkpoint');
const ChallanBrowserEngine = require('./browser_engine');
const { appendRecordsToCsv } = require('./gsheet_sync');
const { syncToGoogleSheets } = require('./sync_to_sheet');
const { syncToPostgres } = require('./db_sync');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs a formatted countdown for the inter-batch cooldown period.
 */
async function runCooldownTimer(minutes) {
  console.log(`\n===============================================================`);
  console.log(` [COOLDOWN] Waiting ${minutes} minutes before starting next batch...`);
  console.log(`===============================================================`);

  const totalSeconds = minutes * 60;
  for (let s = totalSeconds; s > 0; s--) {
    if (s % 60 === 0) {
      console.log(`[Cooldown Timer] ${s / 60} minute(s) remaining until next batch session...`);
    }
    await delay(1000);
  }
  console.log(`[Cooldown Timer] Cooldown complete! Initiating next batch session...\n`);
}

/**
 * Main Multi-Batch Automation Pipeline Execution Controller
 */
async function runAutomationPipeline() {
  console.log('===============================================================');
  console.log('  CHALLAN DATA AUTOMATION PIPELINE - KARNATAKA ONE PORTAL');
  console.log('===============================================================');
  console.log(`* Target Google Sheet ID: ${config.TARGET_SHEET_ID}`);
  console.log(`* Target Google Sheet URL: https://docs.google.com/spreadsheets/d/${config.TARGET_SHEET_ID}/edit?usp=sharing`);
  console.log(`* Target PostgreSQL Database: ${config.PG_CONFIG.database} on ${config.PG_CONFIG.host}`);
  console.log(`* Batch Size: ${config.BATCH_SIZE} vehicles per session`);
  console.log(`* Max Batches Scheduled: ${config.MAX_BATCHES} (${config.BATCH_SIZE * config.MAX_BATCHES} vehicles max)`);
  console.log(`* Inter-Batch Cooldown: ${config.COOLDOWN_MINUTES} minutes`);

  // 1. Load Master Vehicles List from Excel
  const allVehicles = loadVehiclesFromExcel(config.EXCEL_FILE_PATH);
  console.log(`[Main] Total vehicles in source list: ${allVehicles.length}`);

  // 2. Identify Pending Vehicles
  let pendingVehicles = getPendingVehicles(allVehicles);
  const alreadyCompleted = getProcessedCount();
  console.log(`[Main] Summary: Total=${allVehicles.length} | Already Completed=${alreadyCompleted} | Pending=${pendingVehicles.length}\n`);

  if (pendingVehicles.length === 0) {
    console.log('🎉 All vehicles have already been completely processed!');
    // Final sync to ensure dual consistency
    await syncToGoogleSheets().catch(() => {});
    await syncToPostgres().catch(() => {});
    return;
  }

  const batchSize = config.BATCH_SIZE || 50;
  const maxBatches = config.MAX_BATCHES || 10;
  const cooldownMinutes = config.COOLDOWN_MINUTES || 10;
  let batchesProcessed = 0;

  while (pendingVehicles.length > 0 && batchesProcessed < maxBatches) {
    batchesProcessed++;
    const currentBatchVehicles = pendingVehicles.slice(0, batchSize);

    console.log(`\n===============================================================`);
    console.log(` [BATCH ${batchesProcessed}/${maxBatches}] Processing ${currentBatchVehicles.length} vehicle(s)...`);
    console.log(` Remaining in Fleet: ${pendingVehicles.length}`);
    console.log(`===============================================================`);

    const engine = new ChallanBrowserEngine();
    let batchSuccess = false;

    try {
      // Step A: Launch Fresh Browser & Authenticate with SMS OTP
      await engine.initBrowser();
      await engine.loginWithOTP();

      // Step B: Scrape Each Vehicle in the Batch
      for (let i = 0; i < currentBatchVehicles.length; i++) {
        const vehicle = currentBatchVehicles[i];
        console.log(`\n[Progress] Batch ${batchesProcessed} - Vehicle ${i + 1}/${currentBatchVehicles.length} (${vehicle.clean})`);

        try {
          const records = await engine.scrapeVehicleChallan(vehicle);
          
          // Save records immediately to master CSV
          appendRecordsToCsv(records);

          // Mark vehicle completed in checkpoint
          markProcessed(vehicle.clean, {
            totalFine: records[0]?.totalAmountPending || 0,
            noticeCount: records.filter(r => r.noticeNo !== 'N/A' && r.noticeNo !== 'ERROR').length,
            status: records[0]?.status || 'PROCESSED',
            rcHolderName: records[0]?.rcHolderName || 'N/A'
          });

        } catch (err) {
          console.error(`[Main Error] Failed processing vehicle ${vehicle.clean}: ${err.message}`);
        }

        // Brief anti-throttling buffer between vehicles
        await delay(1200);
      }

      batchSuccess = true;
    } catch (batchErr) {
      console.error(`\n[Main Batch Error] Batch ${batchesProcessed} encountered an error: ${batchErr.message}`);
    } finally {
      // Step C: Cleanly close browser session
      await engine.resetSearchSession().catch(() => {});
      await engine.close().catch(() => {});
    }

    // Step D: DUAL REAL-TIME PERSISTENCE (Google Sheets + PostgreSQL)
    console.log(`\n[Batch ${batchesProcessed}] Syncing data to Google Sheets & PostgreSQL...`);
    
    try {
      console.log(`[GoogleSheetSync] Pushing updated dataset to Google Sheets...`);
      await syncToGoogleSheets();
    } catch (sheetErr) {
      console.error(`[GoogleSheetSync Error] ${sheetErr.message}`);
    }

    try {
      console.log(`[PostgresSync] Pushing updated dataset to PostgreSQL database...`);
      await syncToPostgres();
    } catch (pgErr) {
      console.error(`[PostgresSync Error] ${pgErr.message}`);
    }

    // Step E: Update Pending List
    pendingVehicles = getPendingVehicles(allVehicles);

    console.log(`\n===============================================================`);
    console.log(` [BATCH ${batchesProcessed} COMPLETE] Processed ${currentBatchVehicles.length} vehicles.`);
    console.log(` Total Fleet Completed: ${getProcessedCount()}/${allVehicles.length}`);
    console.log(` Remaining Vehicles to Process: ${pendingVehicles.length}`);
    console.log(`===============================================================`);

    // Step F: 10-Minute Cooldown if more batches remain in this run
    if (pendingVehicles.length > 0 && batchesProcessed < maxBatches) {
      await runCooldownTimer(cooldownMinutes);
    }
  }

  console.log(`\n===============================================================`);
  console.log(` [PIPELINE RUN COMPLETED FOR TODAY]`);
  console.log(` Batches Executed: ${batchesProcessed}/${maxBatches}`);
  console.log(` Total Vehicles Completed: ${getProcessedCount()}/${allVehicles.length}`);
  console.log(` Live Google Sheet: https://docs.google.com/spreadsheets/d/${config.TARGET_SHEET_ID}/edit?usp=sharing`);
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
