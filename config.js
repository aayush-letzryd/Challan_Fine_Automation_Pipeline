const path = require('path');

const config = {
  // Registered Mobile Number for Karnataka One OTP Login
  MOBILE_NO: '7483731338',

  // Google Sheet ID containing live forwarded SMS messages (SMSOTP Sheet)
  OTP_SHEET_ID: '1XSdWwBHmGLqey7-C16B_rMiHllYmmsA_LGbH_LogW_E',
  OTP_SHEET_CSV_URL: 'https://docs.google.com/spreadsheets/d/1XSdWwBHmGLqey7-C16B_rMiHllYmmsA_LGbH_LogW_E/export?format=csv',

  // Source Excel File containing the list of 1,041+ vehicles
  SOURCE_EXCEL_PATH: path.join(__dirname, 'Vehicle Status List_V3.xlsx'),
  SOURCE_SHEET_NAME: 'Daily Vehicle Status',
  VEHICLE_COLUMN_HEADER: 'Vehicle Number',

  // Target Google Sheet & Webhook URL
  TARGET_GSHEET_ID: '1xNesMscihuP3uvY_aOVD34Yf9H6L8uarweEZcwpwBKs',
  TARGET_GSHEET_URL: 'https://docs.google.com/spreadsheets/d/1xNesMscihuP3uvY_aOVD34Yf9H6L8uarweEZcwpwBKs/edit?usp=sharing',
  GOOGLE_SHEET_ID: '1xNesMscihuP3uvY_aOVD34Yf9H6L8uarweEZcwpwBKs',
  GOOGLE_SHEET_URL: 'https://docs.google.com/spreadsheets/d/1xNesMscihuP3uvY_aOVD34Yf9H6L8uarweEZcwpwBKs/edit?usp=sharing',
  GSHEET_WEBHOOK_URL: 'https://script.google.com/macros/s/AKfycbxVbF558tNXD8iYA878YEzFlG0y8T91uSXgud9-YQ7GC0zWTqFTFHnJ0ZqUjFJ2aWuLwQ/exec',
  
  // Local Backup and Checkpoint
  LOCAL_RESULTS_CSV: path.join(__dirname, 'challan_results.csv'),
  OUTPUT_CSV_FILE: path.join(__dirname, 'challan_results.csv'),
  CHECKPOINT_FILE: path.join(__dirname, 'checkpoint.json'),

  // Execution Batch Settings
  BATCH_SIZE: 50,                  // 50 unique vehicles per login session window
  BATCH_WAIT_INTERVAL_MINUTES: 15, // 15-minute wait between login batches
  WAIT_INTERVAL_MINUTES: 15,
  INTERVAL_MINUTES: 15,            // Countdown interval between batches
  INTERACTION_DELAY_MS: 1200,      // Humanized delay between searches
  HEADLESS: false,                 // Visual Playwright browser execution

  // Portal URLs
  PORTAL_HOME_URL: 'https://www.karnatakaone.gov.in/PortalHome',
  FINE_COLLECTION_URL: 'https://www.karnatakaone.gov.in/Home/GuestTrafficFine?param=Q0d2Z2g3bVZ2OXB6b2pRRGlSNTIzdz09'
};

module.exports = config;
