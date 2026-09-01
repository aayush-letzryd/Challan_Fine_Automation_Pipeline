const fs = require('fs');
const path = require('path');
const config = require('./config');

const CSV_PATH = config.LOCAL_RESULTS_CSV || path.join(__dirname, 'challan_results.csv');

function auditDataset() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV file not found at: ${CSV_PATH}`);
    return;
  }

  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  if (lines.length <= 1) {
    console.log('No data rows to audit.');
    return;
  }

  console.log(`\n===============================================================`);
  console.log(`  COMPREHENSIVE DATA INTEGRITY AUDIT`);
  console.log(`===============================================================\n`);

  console.log(`Total Rows in Dataset: ${lines.length - 1}`);

  const header = lines[0];
  console.log(`Headers (${header.split(',').length} columns): ${header}`);

  let issuesFound = 0;
  const vehicleSet = new Set();
  let cleanVehiclesCount = 0;
  let vehiclesWithFinesCount = 0;
  let totalPendingFineSum = 0;

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

    if (cells.length !== 12) {
      console.error(`[Integrity Error] Row ${i + 1} has ${cells.length} columns instead of 12!`);
      issuesFound++;
    }

    const regNo = cells[0];
    const rcName = cells[1];
    const totalPending = parseFloat(cells[2]);
    const noticeNo = cells[3];
    const fineAmt = parseFloat(cells[9]);
    const timestamp = cells[10];
    const status = cells[11];

    if (!regNo || regNo.length < 5) {
      console.error(`[Integrity Error] Row ${i + 1} has invalid Vehicle Reg No: '${regNo}'`);
      issuesFound++;
    }

    if (rcName.toLowerCase().includes('please enter')) {
      console.error(`[Integrity Error] Row ${i + 1} has invalid RC Name prompt: '${rcName}'`);
      issuesFound++;
    }

    if (isNaN(totalPending) || isNaN(fineAmt)) {
      console.error(`[Integrity Error] Row ${i + 1} has invalid numeric fine amounts!`);
      issuesFound++;
    }

    if (!vehicleSet.has(regNo)) {
      vehicleSet.add(regNo);
      if (status === 'NO_FINES' || totalPending === 0) {
        cleanVehiclesCount++;
      } else {
        vehiclesWithFinesCount++;
        totalPendingFineSum += totalPending;
      }
    }
  }

  console.log(`\n---------------------------------------------------------------`);
  console.log(`Audit Summary:`);
  console.log(`* Unique Vehicles Analyzed: ${vehicleSet.size}`);
  console.log(`* Vehicles Clean / No Fines: ${cleanVehiclesCount}`);
  console.log(`* Vehicles with Active Fines: ${vehiclesWithFinesCount}`);
  console.log(`* Total Cumulative Fine Amount: ₹${totalPendingFineSum.toLocaleString('en-IN')}`);
  console.log(`* Issues / Anomalies Found: ${issuesFound}`);
  console.log(`---------------------------------------------------------------\n`);

  if (issuesFound === 0) {
    console.log(`✅ VERIFICATION RESULT: 100% CLEAN AND VALIDATED! ZERO ISSUES FOUND.`);
  } else {
    console.log(`❌ VERIFICATION RESULT: ${issuesFound} issues detected.`);
  }
}

auditDataset();
