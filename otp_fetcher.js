const config = require('./config');

const OTP_SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${config.OTP_SHEET_ID}/export?format=csv&gid=0`;

/**
 * Checks if the SMS message or sender is from Karnataka One / Bangalore Traffic Police.
 */
function isKarnatakaOneMessage(message, from) {
  const text = `${message || ''} ${from || ''}`.toUpperCase();

  // Explicitly reject non-Karnataka One senders
  if (text.includes('IDFC') || text.includes('DEBIT') || text.includes('CREDIT') || text.includes('ACTGRP') || text.includes('FIBERNET') || text.includes('SWIGGY') || text.includes('ZOMATO') || text.includes('UBER')) {
    return false;
  }

  const isKarOne = text.includes('KARONE') ||
                   text.includes('KONE') ||
                   text.includes('KARNATAKA ONE') ||
                   text.includes('DPAR') ||
                   text.includes('VALIDATE MOBILE') ||
                   text.includes('TRAFFIC FINE');

  return isKarOne;
}

/**
 * Extracts 4-digit or 6-digit OTP code specifically from Karnataka One SMS template.
 */
function extractOtpFromMessage(msg) {
  if (!msg) return null;

  // Pattern 1: "Your OTP to Validate Mobile No. is 5871"
  const m1 = msg.match(/(?:Validate Mobile No\.\s*is|is\s*valid\s*for|OTP\s*is|code\s*is)\s*([0-9]{4,6})/i);
  if (m1 && m1[1]) return m1[1];

  // Pattern 2: "is 5871 And the OTP is valid"
  const m2 = msg.match(/\bis\s+([0-9]{4,6})\b/i);
  if (m2 && m2[1]) return m2[1];

  // Pattern 3: Fallback 4-6 digit sequence in Karnataka One message
  const m3 = msg.match(/\b([0-9]{4,6})\b/);
  if (m3 && m3[1]) return m3[1];

  return null;
}

/**
 * Parses raw CSV content from Google Sheets into structured row objects.
 */
function parseCsvRows(csvText) {
  const lines = csvText.trim().split('\n').filter(line => line.trim().length > 0);
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
 * Polls live Google Sheet specifically for an incoming Karnataka One OTP SMS.
 */
async function fetchFreshOTP(initialSnapshot = new Set(), maxWaitSeconds = 60) {
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

        // 1. Check for newly arrived rows that weren't in snapshot
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
            }
          }
        }

        // 2. If 15+ seconds elapsed, check if the top row is a valid Karnataka One OTP
        if ((Date.now() - startTime) > 15000 && rows.length > 0) {
          const topRow = rows[0];
          if (isKarnatakaOneMessage(topRow.message, topRow.from)) {
            const otpCode = extractOtpFromMessage(topRow.message);
            if (otpCode) {
              console.log(`[OTPFetcher] Fallback to latest top KARNATAKA ONE SMS: "${topRow.message.substring(0, 60)}..."`);
              return otpCode;
            }
          }
        }

        const topSample = rows.length > 0 ? `"${rows[0].message.substring(0, 45)}..." from ${rows[0].from}` : 'Empty';
        console.log(`[OTPFetcher] Attempt ${attempts} (${Math.round((Date.now() - startTime) / 1000)}s): Waiting for new KARONE SMS... (Current top row: ${topSample})`);
      }
    } catch (err) {
      console.warn(`[OTPFetcher Warning] Network fetch error: ${err.message}`);
    }

    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  throw new Error(`Timeout: No new KARNATAKA ONE OTP received after ${maxWaitSeconds} seconds.`);
}

module.exports = {
  isKarnatakaOneMessage,
  extractOtpFromMessage,
  parseCsvRows,
  getExistingSnapshot,
  fetchFreshOTP
};
