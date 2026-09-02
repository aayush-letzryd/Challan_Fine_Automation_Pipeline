const fs = require('fs');
const path = require('path');
const config = require('./config');
const ChallanBrowserEngine = require('./browser_engine');
const { syncToGoogleSheet } = require('./gsheet_sync');

const CSV_PATH = config.LOCAL_RESULTS_CSV || path.join(__dirname, 'challan_results.csv');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseCsv(content) {
  const lines = content.trim().split('\n').filter(Boolean);
  if (lines.length <= 1) return { headers: [], rows: [] };

  const headers = lines[0];
  const rows = [];

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

    rows.push({
      regNo: cells[0],
      rcName: cells[1],
      totalPending: cells[2],
      noticeNo: cells[3],
      noticeDate: cells[4],
      violationDate: cells[5],
      violationTime: cells[6],
      pointName: cells[7],
      offenceDesc: cells[8],
      fineAmt: cells[9],
      timestamp: cells[10],
      status: cells[11]
    });
  }

  return { headers, rows };
}

function writeUpdatedCsv(headers, rows) {
  const csvLines = [headers];
  for (const r of rows) {
    const line = [
      `"${(r.regNo || '').replace(/"/g, '""')}"`,
      `"${(r.rcName || 'N/A').replace(/"/g, '""')}"`,
      `"${r.totalPending || 0}"`,
      `"${(r.noticeNo || 'N/A').replace(/"/g, '""')}"`,
      `"${(r.noticeDate || 'N/A').replace(/"/g, '""')}"`,
      `"${(r.violationDate || 'N/A').replace(/"/g, '""')}"`,
      `"${(r.violationTime || 'N/A').replace(/"/g, '""')}"`,
      `"${(r.pointName || 'N/A').replace(/"/g, '""')}"`,
      `"${(r.offenceDesc || 'N/A').replace(/"/g, '""')}"`,
      `"${r.fineAmt || 0}"`,
      `"${r.timestamp}"`,
      `"${r.status || 'NO_FINES'}"`
    ].join(',');
    csvLines.push(line);
  }
  fs.writeFileSync(CSV_PATH, csvLines.join('\n') + '\n', 'utf-8');
  console.log(`[Backfill] Saved ${rows.length} updated rows to: ${CSV_PATH}`);
}

async function backfillRCNames() {
  console.log(`\n===============================================================`);
  console.log(`  RC HOLDER NAME BACKFILL & LIVE SHEET SYNC ENGINE`);
  console.log(`===============================================================\n`);

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`Error: CSV file not found at ${CSV_PATH}`);
    return;
  }

  const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
  const { headers, rows } = parseCsv(csvContent);

  const uniqueVehicles = [...new Set(rows.map(r => r.regNo))];
  console.log(`[Backfill] Total rows in dataset: ${rows.length}`);
  console.log(`[Backfill] Total unique vehicles to query: ${uniqueVehicles.length}`);

  const engine = new ChallanBrowserEngine();

  try {
    await engine.initBrowser();
    console.log(`[Backfill] Authenticating on Karnataka One portal...`);
    await engine.loginWithOTP();

    const rcMap = {};

    for (let i = 0; i < uniqueVehicles.length; i++) {
      const regNo = uniqueVehicles[i];
      console.log(`\n[Backfill Progress] Vehicle ${i + 1}/${uniqueVehicles.length}: ${regNo}`);

      // 1. Ensure 'Registration No' radio button is checked
      const regNoRadio = engine.page.locator('input[type="radio"][value*="Registration"], #RegistrationNo, input[id*="Registration"], input[value*="Registration"]').first();
      if (await regNoRadio.isVisible().catch(() => false)) {
        const isChecked = await regNoRadio.isChecked().catch(() => false);
        if (!isChecked) {
          await regNoRadio.click({ force: true }).catch(() => {});
          await delay(500);
        }
      }

      // 2. Locate and fill search box
      const searchInput = engine.page.locator('#txtSearchNumber, input[id*="Search"], input[name*="Search"], input[placeholder*="Search"]:not([type="hidden"])').first();
      await searchInput.fill('');
      await delay(200);
      await searchInput.fill(regNo);
      await delay(300);

      // 3. Click search button
      const searchBtn = engine.page.locator('#btnSearch, button:has-text("Search"), input[value="Search"]').first();
      await searchBtn.click({ force: true });
      await delay(3000);

      // 4. Extract RC Holder Name
      const rcName = await engine.page.evaluate(() => {
        const bodyText = document.body.innerText || '';
        const lines = bodyText.split('\n').map(l => l.trim()).filter(Boolean);

        for (let idx = 0; idx < lines.length; idx++) {
          const line = lines[idx].toUpperCase();
          if (line === 'RC HOLDER NAME' || line.startsWith('RC HOLDER NAME:')) {
            if (lines[idx + 1]) {
              const nextLine = lines[idx + 1].trim();
              const nextUpper = nextLine.toUpperCase();
              if (nextLine && !nextUpper.includes('AMOUNT TO BE PAID') && !nextUpper.includes('PLEASE ENTER') && !nextUpper.includes('VIEW DIGITAB')) {
                return nextLine;
              }
            }
          }
        }

        const directIds = ['#lblRCHolderName', '#lblRcHolderName', '#RCHolderName', '#txtRCHolderName'];
        for (const id of directIds) {
          const el = document.querySelector(id);
          if (el) {
            const val = (el.value || el.innerText || '').trim();
            if (val && !val.toLowerCase().includes('please enter')) return val;
          }
        }

        const match = bodyText.match(/RC Holder Name\s*[:\-]?\s*([^\n\r]+)/i);
        if (match && match[1]) {
          const val = match[1].trim();
          if (val && !val.toLowerCase().includes('please enter') && !val.toLowerCase().includes('amount to be paid')) {
            return val;
          }
        }

        return 'N/A';
      });

      console.log(`[Backfill] -> Extracted RC Name for ${regNo}: '${rcName}'`);
      if (rcName && rcName !== 'N/A') {
        rcMap[regNo] = rcName;
      }

      // Quick save every 25 vehicles
      if ((i + 1) % 25 === 0) {
        for (const r of rows) {
          if (rcMap[r.regNo]) {
            r.rcName = rcMap[r.regNo];
          }
        }
        writeUpdatedCsv(headers, rows);
      }

      await delay(1000);
    }

    // Apply all extracted RC Names to dataset
    for (const r of rows) {
      if (rcMap[r.regNo]) {
        r.rcName = rcMap[r.regNo];
      }
    }

    writeUpdatedCsv(headers, rows);

    await engine.resetSearchSession();
    await engine.close();

    console.log(`\n[Backfill] Syncing updated dataset to Google Sheets...`);
    await syncToGoogleSheet();

    console.log(`\n===============================================================`);
    console.log(`[Backfill] SUCCESS! Google Sheet updated with all authentic RC Holder Names!`);
    console.log(`===============================================================\n`);

  } catch (err) {
    console.error(`[Backfill Error]`, err.message);
    if (engine) await engine.close().catch(() => {});
  }
}

backfillRCNames();
