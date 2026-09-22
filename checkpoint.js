const { Client } = require('pg');
const config = require('./config');

/**
 * PostgreSQL-Backed Checkpoint Tracker for Cloud Run Persistence.
 * Prevents ephemeral container wipes from resetting scraper progress.
 */

async function loadProcessedVehiclesFromDB() {
  try {
    const client = new Client(config.PG_CONFIG);
    await client.connect();

    const res = await client.query('SELECT vehicle_reg_no FROM challan_scrape_checkpoint');
    await client.end();

    const processedMap = {};
    res.rows.forEach(r => {
      processedMap[r.vehicle_reg_no] = true;
    });

    return processedMap;
  } catch (err) {
    console.warn(`[Checkpoint DB Warning] Failed to load DB checkpoint (${err.message}). Defaulting to empty map.`);
    return {};
  }
}

async function markVehicleProcessedInDB(cleanRegNo, details = {}) {
  try {
    const client = new Client(config.PG_CONFIG);
    await client.connect();

    const query = `
      INSERT INTO challan_scrape_checkpoint (vehicle_reg_no, last_scraped_at, status, fine_count, total_fine)
      VALUES ($1, CURRENT_TIMESTAMP, $2, $3, $4)
      ON CONFLICT (vehicle_reg_no) 
      DO UPDATE SET 
        last_scraped_at = CURRENT_TIMESTAMP,
        status = EXCLUDED.status,
        fine_count = EXCLUDED.fine_count,
        total_fine = EXCLUDED.total_fine;
    `;

    await client.query(query, [
      cleanRegNo,
      details.status || 'PROCESSED',
      details.noticeCount || 0,
      details.totalFine || 0
    ]);

    await client.end();
  } catch (err) {
    console.warn(`[Checkpoint DB Error] Failed to record checkpoint for ${cleanRegNo}: ${err.message}`);
  }
}

async function getPendingVehiclesAsync(allVehicles) {
  const processedMap = await loadProcessedVehiclesFromDB();
  return allVehicles.filter(v => !processedMap[v.clean]);
}

module.exports = {
  loadProcessedVehiclesFromDB,
  markVehicleProcessedInDB,
  getPendingVehiclesAsync,
  isProcessed: (regNo, map) => Boolean(map && map[regNo.clean || regNo])
};
