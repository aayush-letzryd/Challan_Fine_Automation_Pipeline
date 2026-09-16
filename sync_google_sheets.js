/**
 * DEPRECATED: sync_google_sheets.js
 * Redirects to the production Google Sheets synchronizer in sync_to_sheet.js.
 */
const { syncToGoogleSheets } = require('./sync_to_sheet');

async function syncGoogleSheets() {
  console.log('[GoogleSheetsSync] Executing sync via sync_to_sheet.js...');
  return await syncToGoogleSheets();
}

if (require.main === module) {
  syncGoogleSheets();
}

module.exports = {
  syncGoogleSheets
};

