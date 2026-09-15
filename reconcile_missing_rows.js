const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { Client } = require('pg');
const config = require('./config');
const { syncToPostgres, parseCsvContent } = require('./db_sync');

const CSV_PATH = config.LOCAL_RESULTS_CSV || path.resolve(__dirname, 'challan_results.csv');

async function reconcileAllData() {
  console.log('===============================================================');
  console.log('  RECONCILING MASTER DATASET & HISTORICAL SCRAPED CHALLANS');
  console.log('===============================================================');

  // 1. Fetch historical 862 rows from git history
  console.log('[Reconciler] Extracting historical 862 scraped rows from git...');
  let historicalContent = '';
  try {
    historicalContent = execSync('git show 7bf2be5~1:challan_results.csv', { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  } catch (e) {
    console.warn('[Reconciler Warning] Could not fetch historical git file, checking disk...');
  }

  const currentContent = fs.existsSync(CSV_PATH) ? fs.readFileSync(CSV_PATH, 'utf-8') : '';

  // Parse both historical and current content
  const histRows = parseCsvContent(historicalContent);
  const currRows = parseCsvContent(currentContent);

  console.log(`[Reconciler] Historical parsed rows: ${histRows.length}`);
  console.log(`[Reconciler] Current parsed rows: ${currRows.length}`);

  // Merge unique records by (vehicleRegNo, noticeNo, offenceDescription)
  const masterMap = new Map();
  const getRecordKey = (r) => `${(r[0] || '').toUpperCase().trim()}|${(r[3] || '').toUpperCase().trim()}|${(r[8] || '').toUpperCase().trim()}`;

  for (const r of histRows) {
    const key = getRecordKey(r);
    masterMap.set(key, r);
  }

  for (const r of currRows) {
    const key = getRecordKey(r);
    masterMap.set(key, r);
  }

  console.log(`[Reconciler] Consolidated total unique master records: ${masterMap.size}`);

  // 2. Write consolidated clean CSV back to disk (with strict CRLF sanitization)
  const headers = [
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

  const lines = [headers.map(h => `"${h}"`).join(',')];
  for (const row of masterMap.values()) {
    const sanitizedCells = row.map(val => `"${String(val || '').replace(/"/g, '""').replace(/\r/g, '').trim()}"`);
    lines.push(sanitizedCells.join(','));
  }

  fs.writeFileSync(CSV_PATH, lines.join('\n') + '\n', 'utf-8');
  console.log(`[Reconciler] Successfully written ${lines.length - 1} records to ${CSV_PATH}`);

  // 3. Sync to PostgreSQL using sequence-safe engine
  console.log('\n[Reconciler] Executing Sequence-Safe PostgreSQL Ingestion...');
  await syncToPostgres();

  // 4. Align and reset sequence counter
  console.log('\n[Reconciler] Resetting PostgreSQL sequence counter to MAX(id)...');
  const client = new Client(config.PG_CONFIG);
  await client.connect();

  const seqRes = await client.query(`
    SELECT setval('vehicle_challans_id_seq', (SELECT COALESCE(MAX(id), 1) FROM vehicle_challans));
    SELECT last_value FROM vehicle_challans_id_seq;
  `);

  const maxIdRes = await client.query('SELECT MAX(id) AS max_id, COUNT(*) AS total_rows, COUNT(DISTINCT vehicle_reg_no) AS unique_vehicles FROM vehicle_challans;');
  console.log(`[Reconciler] Database Summary: Total Rows = ${maxIdRes.rows[0].total_rows}, Unique Vehicles = ${maxIdRes.rows[0].unique_vehicles}, MAX(id) = ${maxIdRes.rows[0].max_id}`);

  await client.end();
  console.log('===============================================================');
  console.log('  RECONCILIATION & SEQUENCE ALIGNMENT COMPLETE!');
  console.log('===============================================================');
}

if (require.main === module) {
  reconcileAllData().catch(e => console.error('[Reconciler Error]', e));
}

module.exports = { reconcileAllData };
