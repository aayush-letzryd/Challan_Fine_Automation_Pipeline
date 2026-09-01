const fs = require('fs');
const path = require('path');
const config = require('./config');
const { syncToGoogleSheet } = require('./gsheet_sync');

const CSV_PATH = config.LOCAL_RESULTS_CSV || path.join(__dirname, 'challan_results.csv');

const NEW_HEADERS = [
  'Vehicle Reg No',
  'RC Holder Name',
  'Total Amount Pending',
  'Notice No.',
  'Notice Generation Date',
  'Violation Date',
  'Violation Time',
  'Point Name',
  'Offence Description',
  'Fine Amount',
  'Scraped Timestamp',
  'Status'
];

function cleanAndMigrateCsv() {
  if (!fs.existsSync(CSV_PATH)) {
    console.log(`[CleanMigrate] CSV not found at: ${CSV_PATH}`);
    return;
  }

  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  if (lines.length <= 1) return;

  const cleanRows = [];
  const processedVehicles = new Set();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const cells = [];
    let insideQuotes = false;
    let currentCell = '';

    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      if (char === '"' && (c === 0 || line[c - 1] !== '\\')) {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        cells.push(currentCell.replace(/^"|"$/g, '').replace(/""/g, '"'));
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    cells.push(currentCell.replace(/^"|"$/g, '').replace(/""/g, '"'));

    // Old format has 13 columns:
    // 0: Search Reg No, 1: RC Holder Name, 2: Total Amount Pending, 3: Notice No.,
    // 4: Reg No., 5: Notice Generation Date, 6: Violation Date, 7: Violation Time,
    // 8: Point Name, 9: Offence Description, 10: Fine Amount, 11: Scraped Timestamp, 12: Status
    
    let searchRegNo = cells[0] || '';
    let rcHolderName = cells[1] || 'N/A';
    let totalAmt = parseFloat(cells[2]) || 0;
    let noticeNo = cells[3] || 'N/A';
    let tableRegNo = cells.length >= 13 ? (cells[4] || '') : searchRegNo;
    let noticeGenDate = cells.length >= 13 ? cells[5] : cells[4];
    let violDate = cells.length >= 13 ? cells[6] : cells[5];
    let violTime = cells.length >= 13 ? cells[7] : cells[6];
    let pointName = cells.length >= 13 ? cells[8] : cells[7];
    let offenceDesc = cells.length >= 13 ? cells[9] : cells[8];
    let fineAmt = parseFloat(cells.length >= 13 ? cells[10] : cells[9]) || 0;
    let scrapedTimestamp = cells.length >= 13 ? cells[11] : cells[10];
    let status = cells.length >= 13 ? cells[12] : cells[11];

    const cleanSearch = searchRegNo.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const cleanTable = tableRegNo.toUpperCase().replace(/[^A-Z0-9]/g, '');

    // Check if this row was corrupted by stale DOM (e.g. tableRegNo != searchRegNo or RC Holder has validation text)
    const isStale = (cleanTable && cleanSearch && cleanTable !== cleanSearch) ||
                    rcHolderName.toLowerCase().includes('please enter') ||
                    rcHolderName.toLowerCase().includes('enter rc');

    if (isStale) {
      if (!processedVehicles.has(cleanSearch)) {
        processedVehicles.add(cleanSearch);
        cleanRows.push([
          cleanSearch,
          'N/A',
          0,
          'N/A',
          'N/A',
          'N/A',
          'N/A',
          'N/A',
          'NO FINES FOUND',
          0,
          scrapedTimestamp,
          'NO_FINES'
        ]);
      }
      continue;
    }

    if (rcHolderName.toLowerCase().includes('please enter') || rcHolderName.toLowerCase().includes('enter rc')) {
      rcHolderName = 'N/A';
    }

    cleanRows.push([
      cleanSearch,
      rcHolderName,
      totalAmt,
      noticeNo,
      noticeGenDate || 'N/A',
      violDate || 'N/A',
      violTime || 'N/A',
      pointName || 'N/A',
      offenceDesc || 'N/A',
      fineAmt,
      scrapedTimestamp,
      status || 'PROCESSED'
    ]);
  }

  const escapeCsv = (val) => `"${String(val !== undefined && val !== null ? val : '').replace(/"/g, '""')}"`;
  const headerLine = NEW_HEADERS.map(escapeCsv).join(',');
  const rowLines = cleanRows.map(r => r.map(escapeCsv).join(','));

  const newCsvContent = [headerLine, ...rowLines].join('\n') + '\n';
  fs.writeFileSync(CSV_PATH, newCsvContent, 'utf-8');
  console.log(`[CleanMigrate] Successfully unified CSV to 12 columns across ${cleanRows.length} clean rows!`);
}

cleanAndMigrateCsv();
