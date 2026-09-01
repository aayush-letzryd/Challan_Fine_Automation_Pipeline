const fs = require('fs');
const path = require('path');
const config = require('./config');

const CSV_PATH = config.LOCAL_RESULTS_CSV || path.join(__dirname, 'challan_results.csv');
const SQL_OUTPUT_PATH = path.join(__dirname, 'seed_challans.sql');

function generateSeedSql() {
  if (!fs.existsSync(CSV_PATH)) {
    console.log(`[SeedGenerator] CSV not found at: ${CSV_PATH}`);
    return;
  }

  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  if (lines.length <= 1) return;

  const escapeSql = (str) => {
    if (!str || str === 'N/A') return "'N/A'";
    return `'${String(str).replace(/'/g, "''")}'`;
  };

  const sqlStatements = [
    '-- ==============================================================',
    '-- Initial Seed Data for PostgreSQL table: vehicle_challans',
    '-- ==============================================================\n'
  ];

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

    const searchRegNo = escapeSql(cells[0]);
    const rcHolderName = escapeSql(cells[1]);
    const totalAmountPending = parseFloat(cells[2]) || 0;
    const noticeNo = escapeSql(cells[3]);
    const regNo = escapeSql(cells[4]);
    const noticeGenDate = escapeSql(cells[5]);
    const violationDate = escapeSql(cells[6]);
    const violationTime = escapeSql(cells[7]);
    const pointName = escapeSql(cells[8]);
    const offenceDesc = escapeSql(cells[9]);
    const fineAmount = parseFloat(cells[10]) || 0;
    const scrapedTimestamp = escapeSql(cells[11]);
    const status = escapeSql(cells[12] || 'PROCESSED');

    const insertSql = `INSERT INTO vehicle_challans (search_reg_no, rc_holder_name, total_amount_pending, notice_no, reg_no, notice_generation_date, violation_date, violation_time, point_name, offence_description, fine_amount, scraped_timestamp, status) VALUES (${searchRegNo}, ${rcHolderName}, ${totalAmountPending}, ${noticeNo}, ${regNo}, ${noticeGenDate}, ${violationDate}, ${violationTime}, ${pointName}, ${offenceDesc}, ${fineAmount}, ${scrapedTimestamp}, ${status}) ON CONFLICT (search_reg_no, notice_no, offence_description) DO NOTHING;`;

    sqlStatements.push(insertSql);
  }

  fs.writeFileSync(SQL_OUTPUT_PATH, sqlStatements.join('\n') + '\n', 'utf-8');
  console.log(`[SeedGenerator] Successfully generated ${sqlStatements.length - 3} INSERT statements in ${SQL_OUTPUT_PATH}!`);
}

generateSeedSql();
