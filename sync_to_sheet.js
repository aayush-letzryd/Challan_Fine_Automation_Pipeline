const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const config = require('./config');

const SPREADSHEET_ID = config.TARGET_GSHEET_ID || '1xNesMscihuP3uvY_aOVD34Yf9H6L8uarweEZcwpwBKs';
const CSV_PATH = config.LOCAL_RESULTS_CSV || path.join(__dirname, 'challan_results.csv');

/**
 * Gets a fresh OAuth access token via gcloud CLI.
 */
function getAccessToken() {
  try {
    const token = execSync('gcloud auth print-access-token', { encoding: 'utf-8' }).trim();
    return token;
  } catch (e) {
    console.error('[GoogleSheetSync Error] Failed to get gcloud access token:', e.message);
    return null;
  }
}

/**
 * Syncs local CSV records directly to target Google Sheet via Google Sheets v4 REST API.
 */
async function syncToGoogleSheet() {
  console.log(`\n======================================================`);
  console.log(`[GoogleSheetSync] Syncing data to Google Sheet...`);
  console.log(`[GoogleSheetSync] Sheet ID: ${SPREADSHEET_ID}`);
  console.log(`[GoogleSheetSync] Sheet URL: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`);
  console.log(`======================================================\n`);

  if (!fs.existsSync(CSV_PATH)) {
    console.warn(`[GoogleSheetSync] CSV file not found at ${CSV_PATH}`);
    return false;
  }

  const token = getAccessToken();
  if (!token) {
    console.error(`[GoogleSheetSync] Unable to authenticate with Google API.`);
    return false;
  }

  // Parse CSV records into rows array
  const fileContent = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = fileContent.trim().split('\n').filter(line => line.length > 0);

  if (lines.length === 0) {
    console.log(`[GoogleSheetSync] No records in CSV file to sync.`);
    return true;
  }

  // Convert CSV lines back into cell array matrix
  const values = lines.map(line => {
    const cells = [];
    let insideQuotes = false;
    let currentCell = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && (i === 0 || line[i - 1] !== '\\')) {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        cells.push(currentCell.replace(/^"|"$/g, '').replace(/""/g, '"'));
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    cells.push(currentCell.replace(/^"|"$/g, '').replace(/""/g, '"'));
    return cells;
  });

  console.log(`[GoogleSheetSync] Overwriting Google Sheet with ${values.length} row(s) (1 Header + ${values.length - 1} Data Rows)...`);

  // Step 1: Clear existing sheet contents
  const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/A1:Z2000:clear`;
  const clearRes = await fetch(clearUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!clearRes.ok) {
    const errTxt = await clearRes.text();
    console.warn(`[GoogleSheetSync Warning] Clear sheet warning (${clearRes.status}): ${errTxt}`);
  }

  // Step 2: Write all updated rows starting at A1
  const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/A1?valueInputOption=USER_ENTERED`;
  const updateRes = await fetch(updateUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range: 'A1',
      majorDimension: 'ROWS',
      values: values
    })
  });

  if (updateRes.ok) {
    const resData = await updateRes.json();
    console.log(`\n======================================================`);
    console.log(`[GoogleSheetSync] SUCCESS! Updated ${resData.updatedRows || values.length} row(s) and ${resData.updatedCells} cell(s) in Google Sheet!`);
    console.log(`[GoogleSheetSync] View Live Sheet: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`);
    console.log(`======================================================\n`);
    return true;
  } else {
    const errorText = await updateRes.text();
    console.error(`[GoogleSheetSync Error] Failed to update Google Sheet (${updateRes.status}): ${errorText}`);
    return false;
  }
}

if (require.main === module) {
  syncToGoogleSheet().catch(err => console.error('[GoogleSheetSync Error]', err));
}

module.exports = {
  syncToGoogleSheet
};
