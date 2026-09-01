const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');
const config = require('./config');

const CSV_PATH = config.LOCAL_RESULTS_CSV || path.resolve(__dirname, 'challan_results.csv');

const HEADERS = [
  'Search Reg No',
  'RC Holder Name',
  'Total Amount Pending',
  'Notice No.',
  'Reg No.',
  'Notice Generation Date',
  'Violation Date',
  'Violation Time',
  'Point Name',
  'Offence Description',
  'Fine Amount',
  'Scraped Timestamp',
  'Status'
];

/**
 * Initializes the CSV output file with standard headers if it doesn't exist.
 */
function initCsv() {
  if (!fs.existsSync(CSV_PATH)) {
    const headerRow = HEADERS.map(h => `"${h}"`).join(',') + '\n';
    fs.writeFileSync(CSV_PATH, headerRow, 'utf-8');
    console.log(`[DataExporter] Initialized results CSV file: ${CSV_PATH}`);
  }
}

/**
 * Escapes CSV field value.
 */
function escapeCsvValue(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Appends a list of violation/clean records to local CSV file.
 */
function appendRecordsToCsv(records) {
  initCsv();

  if (!records || records.length === 0) return;

  const lines = records.map(record => {
    return [
      record.searchRegNo || '',
      record.rcHolderName || '',
      record.totalAmountPending !== undefined ? record.totalAmountPending : '',
      record.noticeNo || '',
      record.regNo || '',
      record.noticeGenerationDate || '',
      record.violationDate || '',
      record.violationTime || '',
      record.pointName || '',
      record.offenceDescription || '',
      record.fineAmount !== undefined ? record.fineAmount : '',
      record.scrapedTimestamp || new Date().toISOString(),
      record.status || 'PROCESSED'
    ].map(escapeCsvValue).join(',');
  });

  fs.appendFileSync(CSV_PATH, lines.join('\n') + '\n', 'utf-8');
  console.log(`[DataExporter] Appended ${records.length} row(s) to ${CSV_PATH}`);
}

/**
 * Robust HTTP POST with automatic Google Apps Script 302 Redirect Following
 */
function postJsonWithRedirect(targetUrl, jsonData) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(targetUrl);
    const postData = typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData);

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 30000
    };

    const req = https.request(options, (res) => {
      // Handle Google Apps Script 302 Redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location;
        // Follow redirect using GET
        https.get(redirectUrl, (redirectRes) => {
          let body = '';
          redirectRes.on('data', chunk => body += chunk);
          redirectRes.on('end', () => resolve(body || 'SUCCESS'));
        }).on('error', reject);
        return;
      }

      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body || 'SUCCESS'));
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out after 30 seconds'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Google Sheet Sync Helper with auto-retry
 * Reads local CSV data and posts to Google Apps Script Webhook URL
 */
async function syncToGoogleSheet(maxRetries = 3) {
  console.log(`\n======================================================`);
  console.log(`[GoogleSheetSync] Syncing data to Google Sheet...`);
  console.log(`[GoogleSheetSync] Target Sheet URL: ${config.TARGET_GSHEET_URL}`);
  console.log(`======================================================\n`);

  if (!fs.existsSync(CSV_PATH)) {
    console.log(`[GoogleSheetSync] No local CSV results to sync yet.`);
    return false;
  }

  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = content.trim().split('\n').filter(line => line.trim().length > 0);

  if (lines.length === 0) {
    console.log(`[GoogleSheetSync] No data in CSV to sync.`);
    return false;
  }

  // Parse CSV lines into 2D Array Matrix
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

  console.log(`[GoogleSheetSync] Pushing ${values.length} row(s) to Google Sheets via Webhook...`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const webhookUrl = config.GSHEET_WEBHOOK_URL;
      const resText = await postJsonWithRedirect(webhookUrl, values);

      console.log(`\n======================================================`);
      console.log(`[GoogleSheetSync] SUCCESS! Updated Google Sheet! Response: ${resText}`);
      console.log(`[GoogleSheetSync] View Live Sheet: ${config.TARGET_GSHEET_URL}`);
      console.log(`======================================================\n`);
      return true;

    } catch (err) {
      console.warn(`[GoogleSheetSync Warning] Attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  console.error(`[GoogleSheetSync Error] All ${maxRetries} sync attempts failed.`);
  return false;
}

if (require.main === module) {
  syncToGoogleSheet().catch(err => console.error('[GoogleSheetSync Test Error]', err));
}

module.exports = {
  initCsv,
  appendRecordsToCsv,
  syncToGoogleSheet,
  HEADERS
};
