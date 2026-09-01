const { loadVehicleNumbers } = require('./vehicle_reader');
const ChallanBrowserEngine = require('./browser_engine');
const { initCsv, appendRecordsToCsv, syncToGoogleSheet } = require('./gsheet_sync');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTestFirst50() {
  console.log(`\n===============================================================`);
  console.log(`  TESTING FIRST 50 VEHICLES WITH LIVE RC HOLDER NAME EXTRACTION`);
  console.log(`===============================================================\n`);

  const allVehicles = loadVehicleNumbers();
  const testVehicles = allVehicles.slice(0, 50);

  console.log(`[TestRun] Loaded first ${testVehicles.length} vehicles for RC Holder Name verification.`);
  console.log(`[TestRun] Target Sheet: ${config.TARGET_GSHEET_URL}`);

  // Re-initialize CSV for clean 50 vehicles test
  const csvPath = config.LOCAL_RESULTS_CSV || path.join(__dirname, 'challan_results.csv');
  if (fs.existsSync(csvPath)) {
    fs.unlinkSync(csvPath);
  }
  initCsv();

  const engine = new ChallanBrowserEngine();

  try {
    await engine.initBrowser();
    console.log(`[TestRun] Authenticating on Karnataka One portal...`);
    await engine.loginWithOTP();

    for (let i = 0; i < testVehicles.length; i++) {
      const v = testVehicles[i];
      console.log(`\n[Progress] Vehicle ${i + 1}/${testVehicles.length} (${v.clean})`);

      const records = await engine.scrapeVehicleChallan(v);
      appendRecordsToCsv(records);

      await delay(1500);
    }

    await engine.resetSearchSession();
    await engine.close();

    console.log(`\n[TestRun] Finished scraping 50 vehicles. Syncing to Google Sheet...`);
    await syncToGoogleSheet();

    console.log(`\n===============================================================`);
    console.log(`[TestRun] SUCCESS! Google Sheet updated with live RC Holder Names!`);
    console.log(`===============================================================\n`);

  } catch (err) {
    console.error(`[TestRun Fatal Error]`, err.message);
    if (engine) await engine.close().catch(() => {});
  }
}

runTestFirst50();
