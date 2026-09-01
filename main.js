const readlineSync = require('readline-sync');
const config = require('./config');
const { getVehiclesToProcess } = require('./vehicle_reader');
const { loadCheckpoint, markProcessed } = require('./checkpoint');
const ChallanBrowserEngine = require('./browser_engine');
const { syncToGoogleSheet } = require('./gsheet_sync');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function formatTimeRemaining(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
}

async function runPipeline() {
  console.log(`\n===============================================================`);
  console.log(`  CHALLAN DATA AUTOMATION PIPELINE - KARNATAKA ONE PORTAL`);
  console.log(`===============================================================\n`);
  console.log(`* Target Google Sheet ID: ${config.GOOGLE_SHEET_ID}`);
  console.log(`* Target Google Sheet URL: ${config.GOOGLE_SHEET_URL}`);
  console.log(`* Batch Size: ${config.BATCH_SIZE} vehicles per session`);
  console.log(`* Wait Interval: ${config.INTERVAL_MINUTES} minutes between login batches\n`);

  // Step 1: Load vehicles from Excel file
  const allVehicles = getVehiclesToProcess(config.SOURCE_EXCEL_PATH);
  console.log(`[Main] Total vehicles in source list: ${allVehicles.length}`);

  // Step 2: Load checkpoint state
  const checkpoint = loadCheckpoint(config.CHECKPOINT_FILE);
  const processedCount = Object.keys(checkpoint.processed).length;
  console.log(`[Checkpoint] Loaded checkpoint: ${processedCount} vehicles already processed.`);

  // Filter out already processed vehicles
  const pendingVehicles = allVehicles.filter(v => !checkpoint.processed[v.clean]);
  console.log(`[Main] Summary: Total=${allVehicles.length} | Already Completed=${processedCount} | Pending=${pendingVehicles.length}\n`);

  if (pendingVehicles.length === 0) {
    console.log(`[Main] All vehicles have already been processed! Syncing to Google Sheets...`);
    await syncToGoogleSheet();
    return;
  }

  let batchIndex = 1;

  while (pendingVehicles.length > 0) {
    const currentBatch = pendingVehicles.splice(0, config.BATCH_SIZE);
    console.log(`\n===============================================================`);
    console.log(` [BATCH ${batchIndex}] Starting processing for ${currentBatch.length} vehicle(s)...`);
    console.log(`===============================================================\n`);

    const engine = new ChallanBrowserEngine();

    try {
      // Initialize browser and perform 100% Automated OTP Login
      await engine.initBrowser();
      await engine.loginWithOTP();

      let processedInSession = 0;

      for (let i = 0; i < currentBatch.length; i++) {
        const vehicle = currentBatch[i];
        console.log(`\n[Progress] Batch ${batchIndex} - Vehicle ${i + 1}/${currentBatch.length} (${vehicle.clean})`);

        // Scrape violations for vehicle
        const records = await engine.scrapeVehicleChallan(vehicle);

        // Append to local CSV backup
        const { appendRecordsToCsv } = require('./gsheet_sync');
        appendRecordsToCsv(records);

        // Mark vehicle processed in checkpoint
        const rcHolderName = records[0]?.rcHolderName || 'N/A';
        const totalAmount = records[0]?.totalAmountPending || 0;
        const fineCount = records.filter(r => r.status === 'HAS_FINES').length;

        markProcessed(checkpoint, vehicle.clean, {
          status: records[0] ? records[0].status : 'PROCESSED',
          rcHolderName: rcHolderName,
          totalAmount: totalAmount,
          fineCount: fineCount,
          originalName: vehicle.original
        });

        processedInSession++;

        // Humanized delay between searches
        await delay(config.INTERACTION_DELAY_MS);
      }

      // Reset session after batch completion
      await engine.resetSearchSession();
      await engine.close();

      // Sync to Google Sheet
      await syncToGoogleSheet();

      console.log(`\n===============================================================`);
      console.log(` [BATCH ${batchIndex} COMPLETE] Processed ${currentBatch.length} vehicles.`);
      console.log(` Remaining vehicles to process: ${pendingVehicles.length}`);
      console.log(`===============================================================\n`);

      batchIndex++;

      // If more vehicles remain, wait for the full 15-minute interval
      if (pendingVehicles.length > 0) {
        console.log(`\n[INTERVAL WAITING] Scheduled wait of ${config.INTERVAL_MINUTES} minute(s) before next login batch...`);
        console.log(`Waiting for session reset. Countdown running below:`);
        
        const totalWaitSeconds = config.INTERVAL_MINUTES * 60; // Exact 15 minutes (900 seconds)
        
        for (let s = totalWaitSeconds; s > 0; s--) {
          process.stdout.write(`\rNext batch login starting in: ${formatTimeRemaining(s)}... `);
          await delay(1000);
        }
        console.log(`\n\n15-minute wait completed! Starting next batch...\n`);
      }

    } catch (err) {
      console.error(`\n[Main Batch Error] Batch ${batchIndex} encountered an error: ${err.message}`);
      await engine.close();

      const choice = readlineSync.question('\n[RECOVERY] An error occurred. Press [r] to retry batch, or [ENTER] to continue to next batch: ');
      if (choice.toLowerCase() === 'r') {
        pendingVehicles.unshift(...currentBatch); // put batch back in queue
      }
    }
  }

  console.log(`\n===============================================================`);
  console.log(` [PIPELINE FINISHED] All ${allVehicles.length} vehicles successfully processed!`);
  console.log(` Results saved to: ${config.OUTPUT_CSV_FILE}`);
  console.log(` Synced to Google Sheet ID: ${config.GOOGLE_SHEET_ID}`);
  console.log(`===============================================================\n`);
}

if (require.main === module) {
  runPipeline().catch(err => console.error(`[Fatal Pipeline Error]`, err));
}
