const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const config = require('./config');

/**
 * Reads and normalizes vehicle registration numbers from source file.
 */
function loadVehicleNumbers(customPath = null) {
  const filePath = customPath || path.resolve(__dirname, config.SOURCE_EXCEL_PATH);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Source vehicle file not found at path: ${filePath}`);
  }

  console.log(`[VehicleReader] Loading vehicles from: ${filePath}`);

  const workbook = xlsx.readFile(filePath);
  const targetSheetName = (config.SOURCE_SHEET_NAME || 'Daily Vehicle Status').toLowerCase();
  let sheetName = workbook.SheetNames.find(s => s && s.trim().toLowerCase() === targetSheetName);

  // Fallback to first sheet if target sheet name is not found
  if (!sheetName) {
    console.log(`[VehicleReader] Sheet matching '${config.SOURCE_SHEET_NAME}' not found. Available sheets: ${workbook.SheetNames.join(', ')}`);
    sheetName = workbook.SheetNames[0];
    console.log(`[VehicleReader] Fallback to first sheet: '${sheetName}'`);
  }

  const worksheet = workbook.Sheets[sheetName];
  const rawData = xlsx.utils.sheet_to_json(worksheet, { defval: '' });

  if (!rawData || rawData.length === 0) {
    throw new Error(`No data rows found in sheet '${sheetName}'`);
  }

  // Detect column matching 'Vehicle Number' case-insensitively
  const targetHeader = (config.VEHICLE_COLUMN_HEADER || config.COLUMN_NAME || 'Vehicle Number').toLowerCase();
  const firstRowKeys = Object.keys(rawData[0]);
  const targetColKey = firstRowKeys.find(key => key && key.trim().toLowerCase() === targetHeader) || firstRowKeys[0];

  console.log(`[VehicleReader] Using column header: '${targetColKey}'`);

  const vehicles = [];
  const seen = new Set();

  for (const row of rawData) {
    const rawVal = String(row[targetColKey] || '').trim();
    if (!rawVal) continue;

    // Clean registration number (e.g. "KA-05-AP-6039" -> "KA05AP6039")
    const cleanRegNo = rawVal.toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (cleanRegNo && !seen.has(cleanRegNo)) {
      seen.add(cleanRegNo);
      vehicles.push({
        original: rawVal,
        clean: cleanRegNo
      });
    }
  }

  console.log(`[VehicleReader] Successfully parsed ${vehicles.length} unique vehicle numbers.`);
  return vehicles;
}

if (require.main === module) {
  try {
    const list = loadVehicleNumbers();
    console.log(`Sample Vehicles (first 5):`, list.slice(0, 5));
  } catch (err) {
    console.error(`[VehicleReader Error]`, err.message);
  }
}

module.exports = {
  loadVehicleNumbers,
  getVehiclesToProcess: loadVehicleNumbers
};
