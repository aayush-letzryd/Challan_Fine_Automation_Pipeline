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
      console.log(`[Checkpoint] Loaded checkpoint: ${Object.keys(data.processed || {}).length} vehicles already processed.`);
      return data;
    } catch (err) {
      console.warn(`[Checkpoint] Failed to parse checkpoint JSON, starting fresh. Error: ${err.message}`);
    }
  }

  return {
    processed: {},     // Key: cleanRegNo -> { timestamp, status, rcHolderName, totalAmount, fineCount }
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
function isProcessed(checkpointData, regNo) {
  return Boolean(checkpointData.processed && checkpointData.processed[regNo]);
}

/**
 * Marks a vehicle as completed with its status.
 */
function markProcessed(checkpointData, regNo, details) {
  if (!checkpointData.processed) checkpointData.processed = {};
  checkpointData.processed[regNo] = {
    timestamp: new Date().toISOString(),
    ...details
  };
  checkpointData.lastProcessed = regNo;
  saveCheckpoint(checkpointData);
}

module.exports = {
  loadCheckpoint,
  saveCheckpoint,
  isProcessed,
  markProcessed
};
