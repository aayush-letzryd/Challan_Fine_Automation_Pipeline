const { Client } = require('pg');
const config = require('./config');

/**
 * Direct Transactional PostgreSQL Synchronizer & Reconciliation Engine.
 * 1. Upserts newly scraped active violation records with payment_status = 'UNPAID'.
 * 2. Reconciles missing notices: If an active UNPAID notice in DB is missing from fresh portal results,
 *    marks it as payment_status = 'PAID' and paid_at = CURRENT_TIMESTAMP.
 */
async function syncBatchToPostgres(batchRecords, processedVehicleList = []) {
  if (!batchRecords || batchRecords.length === 0) {
    console.log(`[PostgresSync] No records in batch to sync.`);
    return true;
  }

  console.log(`\n======================================================`);
  console.log(`[PostgresSync] Transactional DB Syncing ${batchRecords.length} record(s) for ${processedVehicleList.length} vehicle(s)...`);
  console.log(`======================================================\n`);

  const client = new Client(config.PG_CONFIG);

  try {
    await client.connect();
    await client.query('BEGIN');

    // 1. Transactional Advisory Lock to prevent concurrency race conditions
    await client.query('SELECT pg_advisory_xact_lock(7483731338)');

    // 2. Filter out error records
    const validRecords = batchRecords.filter(r => r && r.status !== 'ERROR' && !String(r.offenceDescription).startsWith('SCRAPE_ERROR'));

    if (validRecords.length > 0) {
      // 3. Create Temporary Staging Table
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
          status VARCHAR(50),
          payment_status VARCHAR(20)
        ) ON COMMIT DROP;
      `);

      // 4. Populate Staging Table
      const CHUNK_SIZE = 50;
      for (let i = 0; i < validRecords.length; i += CHUNK_SIZE) {
        const chunk = validRecords.slice(i, i + CHUNK_SIZE);
        const values = [];
        const valueClauses = [];

        chunk.forEach((r, idx) => {
          const offset = idx * 13;
          valueClauses.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13})`);

          values.push(
            r.vehicleRegNo || 'N/A',
            r.rcHolderName || 'N/A',
            parseFloat(r.totalAmountPending) || 0,
            r.noticeNo || 'N/A',
            r.noticeGenerationDate || 'N/A',
            r.violationDate || 'N/A',
            r.violationTime || 'N/A',
            r.pointName || 'N/A',
            r.offenceDescription || 'N/A',
            parseFloat(r.fineAmount) || 0,
            r.scrapedTimestamp || new Date().toISOString(),
            r.status || 'HAS_FINES',
            'UNPAID'
          );
        });

        const chunkQuery = `
          INSERT INTO tmp_sync_challans (
            vehicle_reg_no, rc_holder_name, total_amount_pending, notice_no,
            notice_generation_date, violation_date, violation_time, point_name,
            offence_description, fine_amount, scraped_timestamp, status, payment_status
          ) VALUES ${valueClauses.join(', ')}
        `;

        await client.query(chunkQuery, values);
      }

      // 5. Stage 1: Update Existing Matching Records
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
            payment_status = 'UNPAID',
            status = t.status,
            last_scraped_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        FROM tmp_sync_challans t
        WHERE v.vehicle_reg_no = t.vehicle_reg_no
          AND v.notice_no = t.notice_no
          AND v.offence_description = t.offence_description;
      `);

      // 6. Stage 2: Insert Genuinely New Violations
      const insertResult = await client.query(`
        INSERT INTO vehicle_challans (
          vehicle_reg_no, rc_holder_name, total_amount_pending, notice_no,
          notice_generation_date, violation_date, violation_time, point_name,
          offence_description, fine_amount, scraped_timestamp, payment_status, status,
          first_scraped_at, last_scraped_at, updated_at
        )
        SELECT DISTINCT ON (t.vehicle_reg_no, t.notice_no, t.offence_description)
          t.vehicle_reg_no, t.rc_holder_name, t.total_amount_pending, t.notice_no,
          t.notice_generation_date, t.violation_date, t.violation_time, t.point_name,
          t.offence_description, t.fine_amount, t.scraped_timestamp, 'UNPAID', t.status,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM tmp_sync_challans t
        WHERE NOT EXISTS (
          SELECT 1 FROM vehicle_challans v
          WHERE v.vehicle_reg_no = t.vehicle_reg_no
            AND v.notice_no = t.notice_no
            AND v.offence_description = t.offence_description
        );
      `);

      console.log(`[PostgresSync] Stage 1 Updated: ${updateResult.rowCount} existing row(s), Stage 2 Inserted: ${insertResult.rowCount} new row(s).`);
    }

    // 7. Stage 3: RECONCILIATION ENGINE (Detect & Mark Paid Challans)
    // For vehicles processed in this batch, check active UNPAID notices in DB that were NOT returned by portal
    if (processedVehicleList.length > 0) {
      const cleanRegNos = processedVehicleList.map(v => typeof v === 'string' ? v : (v.clean || v.original));
      const scrapedNoticeNos = validRecords.map(r => r.noticeNo).filter(n => n && n !== 'N/A');

      let reconcileQuery = `
        UPDATE vehicle_challans
        SET payment_status = 'PAID',
            paid_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE vehicle_reg_no = ANY($1)
          AND payment_status = 'UNPAID'
          AND notice_no != 'N/A'
      `;

      const queryParams = [cleanRegNos];

      if (scrapedNoticeNos.length > 0) {
        reconcileQuery += ` AND notice_no != ANY($2)`;
        queryParams.push(scrapedNoticeNos);
      }

      const reconcileResult = await client.query(reconcileQuery, queryParams);
      if (reconcileResult.rowCount > 0) {
        console.log(`[Reconciliation Engine] 🎉 Detected & marked ${reconcileResult.rowCount} notice(s) as PAID/SETTLED in PostgreSQL!`);
      }
    }

    await client.query('COMMIT');
    await client.end();
    return true;

  } catch (err) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
      await client.end().catch(() => {});
    }
    console.error(`[PostgresSync Error] ${err.message}`);
    return false;
  }
}

module.exports = {
  syncBatchToPostgres,
  syncToPostgres: syncBatchToPostgres
};
