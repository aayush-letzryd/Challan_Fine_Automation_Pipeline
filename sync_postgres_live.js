const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DB_CONFIG = {
  host: '35.200.196.113',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: '8S5]U3@L^Xz)\\FH}',
  ssl: false,
  connectionTimeoutMillis: 15000
};

async function inspectAndSync() {
  const client = new Client(DB_CONFIG);

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL server.');

    // 1. Check existing columns of vehicle_challans
    const colRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'vehicle_challans'
      ORDER BY ordinal_position;
    `);
    console.log('Existing columns in vehicle_challans:', colRes.rows.map(r => r.column_name));

    // 2. Drop the old table and recreate with clean 12-column schema
    console.log('\nDropping old table and creating clean unified vehicle_challans table...');
    await client.query(`DROP TABLE IF EXISTS vehicle_challans CASCADE;`);

    await client.query(`
      CREATE TABLE vehicle_challans (
        id BIGSERIAL PRIMARY KEY,
        vehicle_reg_no VARCHAR(20) NOT NULL,
        rc_holder_name VARCHAR(255) DEFAULT 'N/A',
        total_amount_pending NUMERIC(10, 2) DEFAULT 0.00,
        notice_no VARCHAR(100) DEFAULT 'N/A',
        notice_generation_date VARCHAR(50) DEFAULT 'N/A',
        violation_date VARCHAR(50) DEFAULT 'N/A',
        violation_time VARCHAR(50) DEFAULT 'N/A',
        point_name TEXT DEFAULT 'N/A',
        offence_description TEXT DEFAULT 'N/A',
        fine_amount NUMERIC(10, 2) DEFAULT 0.00,
        scraped_timestamp VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'PROCESSED',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_vehicle_challan_record UNIQUE (vehicle_reg_no, notice_no, offence_description)
      );

      CREATE INDEX idx_challans_vehicle_reg_no ON vehicle_challans(vehicle_reg_no);
      CREATE INDEX idx_challans_notice_no ON vehicle_challans(notice_no);
      CREATE INDEX idx_challans_status ON vehicle_challans(status);
      CREATE INDEX idx_challans_created_at ON vehicle_challans(created_at DESC);
    `);
    console.log('✅ Created fresh vehicle_challans table with single vehicle_reg_no column & indexes.');

    // 3. Load all scraped records from CSV
    const csvPath = path.resolve(__dirname, 'challan_results.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.trim().split('\n').filter(Boolean);
    console.log(`\nFound ${lines.length - 1} records in challan_results.csv to insert.`);

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
          cells.push(currentCell.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
          currentCell = '';
        } else {
          currentCell += char;
        }
      }
      cells.push(currentCell.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
      rows.push(cells);
    }

    // 4. Batch Insert
    console.log(`Inserting ${rows.length} records into vehicle_challans...`);
    const insertQuery = `
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

      await client.query(insertQuery, [
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

    console.log(`✅ Successfully inserted all ${rows.length} records into PostgreSQL!`);

    // 5. Verification queries
    const countRes = await client.query('SELECT COUNT(*) as total_rows, COUNT(DISTINCT vehicle_reg_no) as unique_vehicles FROM vehicle_challans;');
    console.log('\n======================================================');
    console.log('POSTGRESQL TABLE "vehicle_challans" VERIFICATION:');
    console.log(`Total Rows in Table: ${countRes.rows[0].total_rows}`);
    console.log(`Unique Vehicles in Table: ${countRes.rows[0].unique_vehicles}`);
    console.log('======================================================\n');

    const sampleRes = await client.query('SELECT vehicle_reg_no, rc_holder_name, total_amount_pending, notice_no, offence_description, fine_amount FROM vehicle_challans LIMIT 8;');
    console.log('Sample Rows from PostgreSQL:');
    console.table(sampleRes.rows);

    await client.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (client) await client.end().catch(() => {});
  }
}

inspectAndSync();
