const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const config = require('./config');

const CSV_PATH = config.LOCAL_RESULTS_CSV || path.resolve(__dirname, 'challan_results.csv');

/**
 * Syncs all records from challan_results.csv to PostgreSQL table `vehicle_challans`.
 */
async function syncToPostgres(customClientConfig = null) {
  console.log(`\n======================================================`);
  console.log(`[PostgresSync] Syncing data to PostgreSQL Database...`);
  console.log(`======================================================\n`);

  if (!fs.existsSync(CSV_PATH)) {
    console.log(`[PostgresSync] No CSV file found at: ${CSV_PATH}`);
    return false;
  }

  // Use environment variables or DBeaver connection parameters
  const clientConfig = customClientConfig || {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    database: process.env.PGDATABASE || 'challan_db',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false
  };

  const client = new Client(clientConfig);

  try {
    await client.connect();
    console.log(`[PostgresSync] Successfully connected to PostgreSQL database: ${clientConfig.database} on ${clientConfig.host}`);

    // Ensure table exists
    const schemaSql = fs.readFileSync(path.join(__dirname, 'challan_schema.sql'), 'utf-8');
    await client.query(schemaSql);
    console.log(`[PostgresSync] Verified table 'vehicle_challans' and indexes.`);

    // Parse CSV rows
    const content = fs.readFileSync(CSV_PATH, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    if (lines.length <= 1) {
      console.log(`[PostgresSync] No data rows to insert.`);
      await client.end();
      return true;
    }

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
      rows.push(cells);
    }

    console.log(`[PostgresSync] Inserting/Upserting ${rows.length} record(s) into 'vehicle_challans'...`);

    const upsertQuery = `
      INSERT INTO vehicle_challans (
        vehicle_reg_no,
        rc_holder_name,
        total_amount_pending,
        notice_no,
        notice_generation_date,
        violation_date,
        violation_time,
        point_name,
        offence_description,
        fine_amount,
        scraped_timestamp,
        status,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
      ON CONFLICT (vehicle_reg_no, notice_no, offence_description)
      DO UPDATE SET
        rc_holder_name = EXCLUDED.rc_holder_name,
        total_amount_pending = EXCLUDED.total_amount_pending,
        fine_amount = EXCLUDED.fine_amount,
        scraped_timestamp = EXCLUDED.scraped_timestamp,
        status = EXCLUDED.status,
        updated_at = CURRENT_TIMESTAMP;
    `;

    for (const r of rows) {
      const vehicleRegNo = r[0] || 'N/A';
      const rcHolderName = r[1] || 'N/A';
      const totalAmountPending = parseFloat(r[2]) || 0;
      const noticeNo = r[3] || 'N/A';
      const noticeGenDate = r[4] || 'N/A';
      const violationDate = r[5] || 'N/A';
      const violationTime = r[6] || 'N/A';
      const pointName = r[7] || 'N/A';
      const offenceDesc = r[8] || 'N/A';
      const fineAmount = parseFloat(r[9]) || 0;
      const scrapedTimestamp = r[10] || 'N/A';
      const status = r[11] || 'PROCESSED';

      await client.query(upsertQuery, [
        vehicleRegNo,
        rcHolderName,
        totalAmountPending,
        noticeNo,
        noticeGenDate,
        violationDate,
        violationTime,
        pointName,
        offenceDesc,
        fineAmount,
        scrapedTimestamp,
        status
      ]);
    }

    console.log(`[PostgresSync] SUCCESS! All ${rows.length} records successfully synced to PostgreSQL!`);
    await client.end();
    return true;

  } catch (err) {
    console.error(`[PostgresSync Error] ${err.message}`);
    await client.end().catch(() => {});
    return false;
  }
}

if (require.main === module) {
  syncToPostgres().catch(e => console.error('[PostgresSync]', e.message));
}

module.exports = {
  syncToPostgres
};
