const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { Client } = require('pg');
const config = require('./config');

/**
 * Loads Bangalore (KA) vehicle registration numbers from PostgreSQL DB (core_vehicle_onboarding).
 * Fallback to local Excel file if DB connection is unavailable.
 */
async function loadVehicleNumbers(customPath = null) {
  console.log(`[VehicleReader] Fetching live Bangalore vehicle fleet list...`);

  // 1. Primary Strategy: Fetch directly from PostgreSQL DB core_vehicle_onboarding table
  try {
    const client = new Client(config.PG_CONFIG);
    await client.connect();

    const query = `
      SELECT DISTINCT UPPER(REPLACE(REPLACE(registration_no, '-', ''), ' ', '')) AS clean_reg
      FROM core_vehicle_onboarding
      WHERE (registration_no LIKE 'KA%' OR UPPER(city) IN ('BLR', 'BANGALORE', 'BENGALURU'))
        AND (is_deleted = FALSE OR is_deleted IS NULL)
        AND registration_no IS NOT NULL AND registration_no != ''
      ORDER BY clean_reg ASC;
    `;

    const res = await client.query(query);
    await client.end();

    if (res.rows && res.rows.length > 0) {
      const vehicles = res.rows
        .map(r => r.clean_reg)
        .filter(v => v && v.startsWith('KA') && v.length >= 6)
        .map(v => ({ original: v, clean: v }));

      console.log(`[VehicleReader] Successfully loaded ${vehicles.length} live Bangalore (KA) vehicles directly from DB (core_vehicle_onboarding).`);
      return vehicles;
    }
  } catch (dbErr) {
    console.warn(`[VehicleReader Warning] DB lookup failed (${dbErr.message}). Falling back to local file...`);
  }

  // 2. Secondary Fallback: Load from Excel File (Strictly Filtered to KA Vehicles)
  const filePath = customPath || config.EXCEL_FILE_PATH || path.resolve(__dirname, 'Vehicle Status List_V3.xlsx');

  if (!fs.existsSync(filePath)) {
    throw new Error(`Source vehicle file not found at path: ${filePath}`);
  }

  console.log(`[VehicleReader Fallback] Loading vehicles from Excel: ${filePath}`);

  const workbook = xlsx.readFile(filePath);
  const targetSheetName = (config.SOURCE_SHEET_NAME || 'Daily Vehicle Status').toLowerCase();
  let sheetName = workbook.SheetNames.find(s => s && s.trim().toLowerCase() === targetSheetName) || workbook.SheetNames[0];

  const worksheet = workbook.Sheets[sheetName];
  const rawData = xlsx.utils.sheet_to_json(worksheet, { defval: '' });

  const firstRowKeys = Object.keys(rawData[0] || {});
  const targetColKey = firstRowKeys.find(key => key && key.trim().toLowerCase().includes('vehicle')) || firstRowKeys[0];

  const vehicles = [];
  const seen = new Set();

  for (const row of rawData) {
    const rawVal = String(row[targetColKey] || '').trim();
    if (!rawVal) continue;

    const cleanRegNo = rawVal.toUpperCase().replace(/[^A-Z0-9]/g, '');

    // Strictly enforce Bangalore (KA) registration filter
    if (cleanRegNo && cleanRegNo.startsWith('KA') && !seen.has(cleanRegNo)) {
      seen.add(cleanRegNo);
      vehicles.push({
        original: rawVal,
        clean: cleanRegNo
      });
    }
  }

  console.log(`[VehicleReader Fallback] Successfully loaded ${vehicles.length} Bangalore (KA) vehicles from Excel.`);
  return vehicles;
}

module.exports = {
  loadVehicleNumbers,
  loadVehiclesFromExcel: loadVehicleNumbers,
  getVehiclesToProcess: loadVehicleNumbers
};
