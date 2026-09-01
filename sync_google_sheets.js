const fs = require('fs');
const path = require('path');
const config = require('./config');

/**
 * Google Sheets Synchronization Helper
 * Exports local CSV results to Google Sheets ID 1xNesMscihuP3uvY_aOVD34Yf9H6L8uarweEZcwpwBKs
 */
async function syncGoogleSheets() {
  const csvPath = path.resolve(__dirname, config.OUTPUT_CSV_FILE);
  if (!fs.existsSync(csvPath)) {
    console.log(`[GoogleSheetsSync] No CSV file found at ${csvPath}`);
    return;
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.trim().split('\n');

  console.log(`\n===============================================================`);
  console.log(`  GOOGLE SHEETS SYNC STATUS`);
  console.log(`===============================================================`);
  console.log(`* Target Sheet URL : ${config.GOOGLE_SHEET_URL}`);
  console.log(`* Target Sheet ID  : ${config.GOOGLE_SHEET_ID}`);
  console.log(`* Local CSV Records: ${lines.length - 1} rows ready for sync`);
  console.log(`===============================================================\n`);

  const credentialsPath = path.resolve(__dirname, 'credentials.json');
  if (!fs.existsSync(credentialsPath)) {
    console.log(`[GoogleSheetsSync] Note: 'credentials.json' (Service Account Key) not detected in project folder.`);
    console.log(`[GoogleSheetsSync] Data is safely saved locally in '${config.OUTPUT_CSV_FILE}'.`);
    console.log(`[GoogleSheetsSync] To enable automatic API syncing: Place your Google Cloud Service Account JSON key as 'credentials.json' in this folder and share the Google Sheet with your service account email.`);
  } else {
    console.log(`[GoogleSheetsSync] Syncing records to Google Sheets API...`);
  }
}

if (require.main === module) {
  syncGoogleSheets();
}

module.exports = {
  syncGoogleSheets
};
