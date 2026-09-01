const fs = require('fs');
const path = require('path');
const config = require('./config');
const { syncToGoogleSheet } = require('./gsheet_sync');

const CSV_PATH = config.LOCAL_RESULTS_CSV || path.join(__dirname, 'challan_results.csv');

function formatToIST(dateStr) {
  if (!dateStr || dateStr === 'N/A' || dateStr.includes('-2026 ')) return dateStr;

  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const options = {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };

  const parts = new Intl.DateTimeFormat('en-GB', options).formatToParts(d);
  const getPart = (type) => parts.find(p => p.type === type)?.value || '';
  return `${getPart('day')}-${getPart('month')}-${getPart('year')} ${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
}

function convertCsvTimestamps() {
  if (!fs.existsSync(CSV_PATH)) {
    console.log(`[ConvertIST] CSV not found at: ${CSV_PATH}`);
    return;
  }

  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  if (lines.length <= 1) return;

  const header = lines[0];
  const updatedRows = [];

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

    // Column L (index 11) is Scraped Timestamp
    if (cells.length >= 12) {
      cells[11] = formatToIST(cells[11]);
    }

    const newCsvLine = cells.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',');
    updatedRows.push(newCsvLine);
  }

  const newCsvContent = [header, ...updatedRows].join('\n') + '\n';
  fs.writeFileSync(CSV_PATH, newCsvContent, 'utf-8');
  console.log(`[ConvertIST] Successfully converted ${updatedRows.length} rows to Indian Standard Time (IST)!`);
}

convertCsvTimestamps();
syncToGoogleSheet();
