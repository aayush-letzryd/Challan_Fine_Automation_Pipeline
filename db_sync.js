const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const config = require('./config');

const CSV_PATH = config.LOCAL_RESULTS_CSV || path.resolve(__dirname, 'challan_results.csv');

/**
 * Parses raw CSV content with strict CRLF sanitization and quote-aware cell splitting.
 */
function parseCsvContent(content) {
  const cleanContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = cleanContent.split('\n').filter(line => line.trim().length > 0);
  if (lines.length <= 1) return [];

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
    
    // Ignore dummy error rows from previous runs
    const status = cells[11] || 'PROCESSED';
    const offenceDesc = cells[8] || '';
    if (status === 'ERROR' || offenceDesc.startsWith('SCRAPE_ERROR')) {
      continue;
    }

    rows.push(cells);
  }

  return rows;
}

/**
 * Sequence-Safe PostgreSQL Synchronizer.
 * Uses a Temporary Staging Table + Two-Stage CTE with Transactional Advisory Lock
 * to ensure ZERO primary key sequence burning on updates.
 */
async function syncToPostgres(existingClient = null) {
  console.log(`\n======================================================`);
  console.log(`[PostgresSync] Syncing data to PostgreSQL Database...`);
  console.log(`======================================================\n`);

  if (!fs.existsSync(CSV_PATH)) {
    console.log(`[PostgresSync] No CSV file found at: ${CSV_PATH}`);
    return false;
  }

  const shouldClose = !existingClient;
  const client = existingClient || new Client(config.PG_CONFIG);

  try {
    if (!existingClient) {
      await client.connect();
      console.log(`[PostgresSync] Connected to PostgreSQL: ${config.PG_CONFIG.database} on ${config.PG_CONFIG.host}`);
    } else {
      console.log(`[PostgresSync] Reusing active PostgreSQL connection.`);
    }

    // Parse CSV rows
    const content = fs.readFileSync(CSV_PATH, 'utf-8');
    const rows = parseCsvContent(content);

    if (rows.length === 0) {
      console.log(`[PostgresSync] No valid data rows to insert.`);
      await client.end();
      return true;
    }

    console.log(`[PostgresSync] Ingesting ${rows.length} record(s) with Sequence-Safe Advisory Lock...`);

    await client.query('BEGIN');

    // 1. Transactional Advisory Lock (Prevents concurrent race conditions)
    await client.query('SELECT pg_advisory_xact_lock(7483731338)');

    // 2. Create Temporary Staging Table (Zero Sequence Impact, dropped on commit)
    await client.query(`
      CREATE TEMP TABLE tmp_sync_challans (
        vehicle_reg_no VARCHAR(20),
        rc_holder_name VARCHAR(255),
        total_amount_pending NUMERIC(10, 2),
        notice_no VARCHAR(100),
        notice_generation_date VARCHAR(50),
        violation_date VARCHAR(50),
        violation_time VARCHAR(50),
        point_name TEXT,
        offence_description TEXT,
        fine_amount NUMERIC(10, 2),
        scraped_timestamp VARCHAR(50),
        status VARCHAR(50)
      ) ON COMMIT DROP;
    `);

    // 4. Bulk populate Temporary Staging Table in high-speed multi-row chunks
    const CHUNK_SIZE = 50;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const values = [];
      const valueClauses = [];

      chunk.forEach((r, idx) => {
        const offset = idx * 12;
        valueClauses.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12})`);

        values.push(
          r[0] || 'N/A',
          r[1] || 'N/A',
          parseFloat(r[2]) || 0,
          r[3] || 'N/A',
          r[4] || 'N/A',
          r[5] || 'N/A',
          r[6] || 'N/A',
          r[7] || 'N/A',
          r[8] || 'N/A',
          parseFloat(r[9]) || 0,
          r[10] || 'N/A',
          r[11] || 'PROCESSED'
        );
      });

      const chunkQuery = `
        INSERT INTO tmp_sync_challans (
          vehicle_reg_no, rc_holder_name, total_amount_pending, notice_no,
          notice_generation_date, violation_date, violation_time, point_name,
          offence_description, fine_amount, scraped_timestamp, status
        ) VALUES ${valueClauses.join(', ')}
      `;

      await client.query(chunkQuery, values);
    }

    // 5. Stage 1: UPDATE existing records (Zero Sequence Advancement)
    const updateResult = await client.query(`
      UPDATE vehicle_challans v
      SET rc_holder_name = t.rc_holder_name,
          total_amount_pending = t.total_amount_pending,
          notice_generation_date = t.notice_generation_date,
          violation_date = t.violation_date,
          violation_time = t.violation_time,
          point_name = t.point_name,
          fine_amount = t.fine_amount,
          scraped_timestamp = t.scraped_timestamp,
          status = t.status,
          updated_at = CURRENT_TIMESTAMP
      FROM tmp_sync_challans t
      WHERE v.vehicle_reg_no = t.vehicle_reg_no
        AND v.notice_no = t.notice_no
        AND v.offence_description = t.offence_description;
    `);

    // 6. Stage 2: INSERT ONLY genuinely new records (Sequence advances ONLY for new rows)
    const insertResult = await client.query(`
      INSERT INTO vehicle_challans (
        vehicle_reg_no, rc_holder_name, total_amount_pending, notice_no,
        notice_generation_date, violation_date, violation_time, point_name,
        offence_description, fine_amount, scraped_timestamp, status, updated_at
      )
      SELECT DISTINCT ON (t.vehicle_reg_no, t.notice_no, t.offence_description)
        t.vehicle_reg_no, t.rc_holder_name, t.total_amount_pending, t.notice_no,
        t.notice_generation_date, t.violation_date, t.violation_time, t.point_name,
        t.offence_description, t.fine_amount, t.scraped_timestamp, t.status, CURRENT_TIMESTAMP
      FROM tmp_sync_challans t
      WHERE NOT EXISTS (
        SELECT 1 FROM vehicle_challans v
        WHERE v.vehicle_reg_no = t.vehicle_reg_no
          AND v.notice_no = t.notice_no
          AND v.offence_description = t.offence_description
      );
    `);

    // 7. Clean up any legacy error entries from staging
    await client.query(`
      DELETE FROM vehicle_challans 
      WHERE status = 'ERROR' OR offence_description LIKE 'SCRAPE_ERROR%';
    `);

    await client.query('COMMIT');

    console.log(`[PostgresSync] SUCCESS! Updated: ${updateResult.rowCount} existing row(s), Inserted: ${insertResult.rowCount} new row(s).`);
    if (shouldClose) {
      await client.end();
    }
    return true;

  } catch (err) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
      if (shouldClose) {
        await client.end().catch(() => {});
      }
    }
    console.error(`[PostgresSync Error] ${err.message}`);
    return false;
  }
}

if (require.main === module) {
  syncToPostgres().catch(e => console.error('[PostgresSync]', e.message));
}

module.exports = {
  syncToPostgres,
  parseCsvContent
};
