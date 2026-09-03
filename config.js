require('dotenv').config();
const path = require('path');

module.exports = {
  // Target Company Mobile Number for Portal OTP Verification
  MOBILE_NO: process.env.MOBILE_NO || '7483731338',

  // Google Sheet ID for SMS Forwarding (Manager SMSOTP Sheet)
  OTP_SHEET_ID: process.env.OTP_SHEET_ID || '1XSdWwBHmGLqey7-C16B_rMiHllYmmsA_LGbH_LogW_E',

  // Master Google Sheet ID for Final Scraped Challan Records (Challan_Data_Google_Sheet)
  TARGET_SHEET_ID: process.env.TARGET_SHEET_ID || '1xNesMscihuP3uvY_aOVD34Yf9H6L8uarweEZcwpwBKs',

  // Google Apps Script Webhook URL for Direct Live Sheet Syncing
  APPS_SCRIPT_WEBHOOK_URL: process.env.APPS_SCRIPT_WEBHOOK_URL || 'https://script.google.com/macros/s/AKfycbz_p77Q56h5lP5aQ_c_L7sIeJ6-a1c2B3d4E5f6G7h8I9j0K1l2M3n4O5p6/exec',

  // Input Excel File containing 1,041+ Master Vehicles
  EXCEL_FILE_PATH: process.env.EXCEL_FILE_PATH || path.resolve(__dirname, 'Vehicle Status List_V3.xlsx'),

  // Checkpoint File for Incremental Progress Persistence
  CHECKPOINT_FILE: process.env.CHECKPOINT_FILE || path.resolve(__dirname, 'checkpoint.json'),

  // Master CSV File for Complete Clean Data Storage
  LOCAL_RESULTS_CSV: process.env.LOCAL_RESULTS_CSV || path.resolve(__dirname, 'challan_results.csv'),

  // Batch Processing Configuration
  BATCH_SIZE: parseInt(process.env.BATCH_SIZE || '50', 10),
  MAX_BATCHES: parseInt(process.env.MAX_BATCHES || '10', 10), // 10 batches per scheduled run (500 vehicles/day)
  COOLDOWN_MINUTES: parseInt(process.env.COOLDOWN_MINUTES || '10', 10), // 10-minute interval between batches

  // PostgreSQL Production Database Configuration
  PG_CONFIG: {
    host: process.env.PGHOST || '35.200.196.113',
    port: parseInt(process.env.PGPORT || '5432', 10),
    database: process.env.PGDATABASE || 'postgres',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '8S5]U3@L^Xz)\\FH}',
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false
  }
};
