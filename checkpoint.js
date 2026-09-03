const fs = require('fs');
const path = require('path');
const config = require('./config');

const CHECKPOINT_PATH = path.resolve(__dirname, config.CHECKPOINT_FILE);

/**
 * Loads checkpoint file or initializes empty checkpoint data structure.
 */
function loadCheckpoint() {
  if (fs.existsSync(CHECKPOINT_PATH)) {
    try {
      const raw = fs.readFileSync(CHECKPOINT_PATH, 'utf-8');
      const data = JSON.parse(raw);
      return data;
    } catch (err) {
      console.warn(`[Checkpoint] Failed to parse checkpoint JSON, starting fresh. Error: ${err.message}`);
    }
  }

  return {
    processed: {},
    lastProcessed: null,
    totalCount: 0,
    startTime: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
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
  const checkpoint = customCheckpoint || (typeof regNo === 'object' ? regNo : loadCheckpoint());
  const cleanKey = typeof regNo === 'string' ? regNo : (regNo.clean || '');
  return Boolean(checkpoint.processed && checkpoint.processed[cleanKey]);
}

/**
 * Marks a vehicle as completed with its status.
 */
function markProcessed(regNo, details = {}) {
  const checkpoint = loadCheckpoint();
  if (!checkpoint.processed) checkpoint.processed = {};
  
  checkpoint.processed[regNo] = {
    timestamp: new Date().toISOString(),
    ...details
  };
  checkpoint.lastProcessed = regNo;
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
