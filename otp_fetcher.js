const config = require('./config');

const OTP_SHEET_CSV_URL = config.OTP_SHEET_CSV_URL || 'https://docs.google.com/spreadsheets/d/1XSdWwBHmGLqey7-C16B_rMiHllYmmsA_LGbH_LogW_E/export?format=csv';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Checks if an SMS row is specifically from Karnataka One / Traffic Fine portal.
 */
function isKarnatakaOneMessage(text, sender = '') {
  const combined = `${text || ''} ${sender || ''}`.toUpperCase();
  return (
    combined.includes('KARONE') ||
    combined.includes('KONE') ||
    combined.includes('DPAR') ||
    combined.includes('VALIDATE MOBILE') ||
    combined.includes('KARNATAKA ONE')
  );
}

/**
 * Extracts 4-digit or 6-digit OTP code from an SMS message body, excluding year numbers (2024-2027).
 */
function extractOtpFromMessage(text) {
  if (!text) return null;

  // Strategy 1: Look for number right after "is", "OTP is", "is: ", "Mobile No. is", etc.
  const keywordMatch = text.match(/(?:is|OTP|code|no\.?\s*is)\s*[:\s]?\s*(\b\d{4,6}\b)/i);
  if (keywordMatch && !['2024', '2025', '2026', '2027'].includes(keywordMatch[1])) {
    return keywordMatch[1];
  }

  // Strategy 2: Look for 4-digit to 6-digit standalone numbers
  const matches = text.match(/\b\d{6}\b/g) || text.match(/\b\d{4}\b/g);
  if (matches) {
    for (const code of matches) {
      if (!['2024', '2025', '2026', '2027'].includes(code)) {
        return code;
      }
    }
  }

  return null;
}

/**
 * Parses raw CSV into an array of message row objects.
 */
function parseCsvRows(csvText) {
  const lines = csvText.trim().split('\n').filter(Boolean);
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

    rows.push({
      message: cells[0] || '',
      from: cells[1] || '',
      date: cells[2] || '',
      raw: line
    });
  }

  return rows;
}

/**
 * Fetches current snapshot of all SMS rows in the Google Sheet.
 */
async function getExistingSnapshot() {
  try {
    const url = `${OTP_SHEET_CSV_URL}&_t=${Date.now()}`;
    const response = await fetch(url);
    if (!response.ok) return new Set();

    const text = await response.text();
    const rows = parseCsvRows(text);
    return new Set(rows.map(r => r.raw));
  } catch (e) {
    return new Set();
  }
}

/**
 * Polls live Google Sheet specifically for a NEW incoming Karnataka One OTP SMS that wasn't in initialSnapshot.
 */
async function fetchFreshOTP(initialSnapshot = new Set(), maxWaitSeconds = 90) {
  console.log(`[OTPFetcher] Polling live SMSOTP Sheet (${config.OTP_SHEET_ID}) for fresh KARNATAKA ONE OTP...`);
  const startTime = Date.now();
  let attempts = 0;

  while ((Date.now() - startTime) < (maxWaitSeconds * 1000)) {
    attempts++;
    try {
      const url = `${OTP_SHEET_CSV_URL}&_t=${Date.now()}`;
      const response = await fetch(url);

      if (response.ok) {
        const csvContent = await response.text();
        const rows = parseCsvRows(csvContent);

        // ONLY accept rows that arrived AFTER initialSnapshot
        for (const row of rows) {
          if (!initialSnapshot.has(row.raw)) {
            if (isKarnatakaOneMessage(row.message, row.from)) {
              const otpCode = extractOtpFromMessage(row.message);
              if (otpCode) {
                console.log(`[OTPFetcher] Attempt ${attempts}: Detected NEW KARNATAKA ONE SMS: "${row.message.substring(0, 70)}..." (From: ${row.from})`);
                console.log(`\n======================================================`);
                console.log(`[OTPFetcher] SUCCESS! Auto-extracted Fresh OTP Code: ${otpCode}`);
                console.log(`======================================================\n`);
                return otpCode;
              }
            } else {
              console.log(`[OTPFetcher] Attempt ${attempts}: Detected new non-Karnataka One SMS: "${row.message.substring(0, 50)}..." (From: ${row.from}). Waiting for KARONE OTP...`);
            }
          }
        }

        const topSample = rows.length > 0 ? `"${rows[0].message.substring(0, 45)}..." from ${rows[0].from}` : 'Empty';
        console.log(`[OTPFetcher] Attempt ${attempts} (${Math.round((Date.now() - startTime) / 1000)}s): Waiting for new KARONE SMS... (Current top row: ${topSample})`);
      }
    } catch (err) {
      console.warn(`[OTPFetcher] Attempt ${attempts} polling warning: ${err.message}`);
    }

    await delay(3000);
  }

  throw new Error(`Timeout: No new KARNATAKA ONE OTP received after ${maxWaitSeconds} seconds.`);
}

module.exports = {
  getExistingSnapshot,
  fetchFreshOTP,
  extractOtpFromMessage,
  isKarnatakaOneMessage,
  OTP_SHEET_CSV_URL
};
