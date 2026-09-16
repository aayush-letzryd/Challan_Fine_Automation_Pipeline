const fs = require('fs');
const path = require('path');
const config = require('./config');

const CHECKPOINT_PATH = path.resolve(__dirname, config.CHECKPOINT_FILE);
const CSV_PATH = config.LOCAL_RESULTS_CSV || path.resolve(__dirname, 'challan_results.csv');

/**
 * Self-Healing Checkpoint Loader:
 * If checkpoint.json on disk is missing, empty, or wiped ({ "processed": {} }),
 * it automatically re-hydrates processed vehicle registration numbers from challan_results.csv.
 */
function loadCheckpoint() {
  let checkpoint = null;

  if (fs.existsSync(CHECKPOINT_PATH)) {
    try {
      const raw = fs.readFileSync(CHECKPOINT_PATH, 'utf-8');
      checkpoint = JSON.parse(raw);
    } catch (err) {
      console.warn(`[Checkpoint] Failed to parse checkpoint JSON (${err.message}), re-initializing.`);
    }
  }

  if (!checkpoint || typeof checkpoint !== 'object') {
    checkpoint = {
      processed: {},
      lastProcessed: null,
      totalCount: 0,
      startTime: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  if (!checkpoint.processed) {
    checkpoint.processed = {};
  }

  // ACTIVE SYNC & REHYDRATION: Always ensure any vehicle scraped in CSV is present in checkpoint
  if (fs.existsSync(CSV_PATH)) {
    try {
      const csvContent = fs.readFileSync(CSV_PATH, 'utf-8').replace(/\r/g, '');
      const lines = csvContent.split('\n').filter(l => l.trim().length > 0);

      let rehydratedCount = 0;
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const firstComma = line.indexOf(',');
        if (firstComma > 0) {
          const rawRegNo = line.substring(0, firstComma).replace(/^"|"$/g, '').trim().toUpperCase();
          const cleanRegNo = rawRegNo.replace(/[^A-Z0-9]/g, '');
          if (cleanRegNo && cleanRegNo.length >= 5 && cleanRegNo !== 'NA' && !checkpoint.processed[cleanRegNo]) {
            checkpoint.processed[cleanRegNo] = {
              rehydratedFromCsv: true,
              timestamp: new Date().toISOString()
            };
            rehydratedCount++;
          }
        }
      }

      if (rehydratedCount > 0) {
        checkpoint.totalCount = Object.keys(checkpoint.processed).length;
        checkpoint.updatedAt = new Date().toISOString();
        saveCheckpoint(checkpoint);
        console.log(`[Checkpoint Sync] Re-hydrated ${rehydratedCount} previously scraped vehicles from CSV into checkpoint.json (Total tracked: ${checkpoint.totalCount}).`);
      }
    } catch (csvErr) {
      console.warn(`[Checkpoint Warning] Could not sync from CSV: ${csvErr.message}`);
    }
  }

  return checkpoint;
}

/**
 * Saves updated checkpoint to disk.
 */
function saveCheckpoint(checkpointData) {
  checkpointData.updatedAt = new Date().toISOString();
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpointData, null, 2), 'utf-8');
}

/**
 * Checks if a vehicle has been processed.
 */
function isProcessed(regNo, customCheckpoint = null) {
  const checkpoint = customCheckpoint || loadCheckpoint();
  const cleanKey = typeof regNo === 'string' 
    ? regNo.toUpperCase().replace(/[^A-Z0-9]/g, '') 
    : (regNo.clean || '');
  return Boolean(checkpoint.processed && checkpoint.processed[cleanKey]);
}

/**
 * Marks a vehicle as completed with its status.
 */
function markProcessed(regNo, details = {}) {
  const checkpoint = loadCheckpoint();
  const cleanKey = typeof regNo === 'string' 
    ? regNo.toUpperCase().replace(/[^A-Z0-9]/g, '') 
    : (regNo.clean || '');

  checkpoint.processed[cleanKey] = {
    timestamp: new Date().toISOString(),
    ...details
  };
  checkpoint.lastProcessed = cleanKey;
  checkpoint.totalCount = Object.keys(checkpoint.processed).length;
  saveCheckpoint(checkpoint);
}

/**
 * Filters master list to return only pending un-scraped vehicles.
 */
function getPendingVehicles(allVehicles) {
  const checkpoint = loadCheckpoint();
  return allVehicles.filter(v => !checkpoint.processed || !checkpoint.processed[v.clean]);
}

/**
 * Returns total count of processed vehicles.
 */
function getProcessedCount() {
  const checkpoint = loadCheckpoint();
  return Object.keys(checkpoint.processed || {}).length;
}

module.exports = {
  loadCheckpoint,
  saveCheckpoint,
  isProcessed,
  markProcessed,
  getPendingVehicles,
  getProcessedCount
};
