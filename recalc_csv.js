const fs = require('fs');
const path = require('path');
const config = require('./config');
const { syncToGoogleSheet } = require('./gsheet_sync');

const CSV_PATH = config.LOCAL_RESULTS_CSV || path.join(__dirname, 'challan_results.csv');

function recalculateTotals() {
  if (!fs.existsSync(CSV_PATH)) return;

  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length <= 1) return;

  const header = lines[0];
  const rows = lines.slice(1).map(l => {
    const cells = [];
    let insideQuotes = false;
    let currentCell = '';

    for (let i = 0; i < l.length; i++) {
      const char = l[i];
      if (char === '"' && (i === 0 || l[i - 1] !== '\\')) {
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

  // Group by Search Reg No to compute total cumulative fine
  const vehicleTotals = {};
  for (const r of rows) {
    const regNo = r[0];
    const fineAmt = parseInt(r[10] || '0', 10) || 0;
    vehicleTotals[regNo] = (vehicleTotals[regNo] || 0) + fineAmt;
  }

  // Update Column C (index 2)
  for (const r of rows) {
    const regNo = r[0];
    r[2] = String(vehicleTotals[regNo] || 0);
  }

  // Write back to CSV
  const updatedLines = [header];
  for (const r of rows) {
    const csvLine = r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',');
    updatedLines.push(csvLine);
  }

  fs.writeFileSync(CSV_PATH, updatedLines.join('\n') + '\n', 'utf-8');
  console.log(`[RecalcCSV] Updated Total Amount Pending for ${rows.length} rows.`);
}

recalculateTotals();
syncToGoogleSheet();
