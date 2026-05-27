/**
 * Google Apps Script - Deploy as Web App
 * =======================================
 * 
 * SETUP INSTRUCTIONS:
 * 1. Go to https://script.google.com
 * 2. Create a new project
 * 3. Paste this entire code
 * 4. Deploy > New Deployment > Web App
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the Web App URL and paste it in app.js (GOOGLE_SCRIPT_URL variable)
 * 
 * Sheet: "Master Sheet 2026" in spreadsheet ID: 1KP9ge5g4_7ugdeJDwbOSPV26Qo9xVvo3SgDG5R6jHlo
 * Columns: Category | Master SKU | Product Name | Title | EAN/Barcode | Status | Opening Stock | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec
 */

const SPREADSHEET_ID = '1KP9ge5g4_7ugdeJDwbOSPV26Qo9xVvo3SgDG5R6jHlo';
const SHEET_NAME = 'Master Sheet 2026';

/**
 * Handle GET requests - Read data from sheet
 */
function doGet(e) {
  try {
    const action = e.parameter.action || 'read';
    
    if (action === 'read') {
      return readSheetData();
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'Invalid action'
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle POST requests - Write/Update data in sheet
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action || 'update';
    
    if (action === 'update') {
      return updateSheetRow(data);
    } else if (action === 'add') {
      return addSheetRow(data);
    } else if (action === 'delete') {
      return deleteSheetRow(data);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'Invalid action'
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Read all data from the sheet
 */
function readSheetData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'Sheet not found: ' + SHEET_NAME
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  
  if (lastRow < 2) {
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      data: [],
      headers: [],
      lastUpdated: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  // Get headers (row 1)
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  
  // Get all data (row 2 onwards)
  const dataRange = sheet.getRange(2, 1, lastRow - 1, lastCol);
  const values = dataRange.getValues();
  
  const rows = values.map((row, index) => {
    const obj = {};
    headers.forEach((header, colIdx) => {
      obj[header] = row[colIdx] !== null && row[colIdx] !== undefined ? row[colIdx] : '';
    });
    obj._rowNumber = index + 2; // Actual row number in sheet
    return obj;
  }).filter(row => {
    // Filter out completely empty rows
    return Object.keys(row).some(key => key !== '_rowNumber' && row[key] !== '');
  });
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    data: rows,
    headers: headers,
    totalRows: rows.length,
    lastUpdated: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Update a specific row by Master SKU
 */
function updateSheetRow(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'Sheet not found'
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const sku = data.masterSKU;
  const updates = data.updates; // { columnName: newValue, ... }
  
  if (!sku || !updates) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'masterSKU and updates required'
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  
  // Find the SKU column index
  const skuColIdx = headers.findIndex(h => h.toLowerCase().includes('master sku') || h.toLowerCase() === 'master sku');
  if (skuColIdx === -1) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'Master SKU column not found in headers'
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  // Find the row with matching SKU
  const allData = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  let targetRow = -1;
  
  for (let i = 0; i < allData.length; i++) {
    if (String(allData[i][skuColIdx]).trim() === String(sku).trim()) {
      targetRow = i + 2; // +2 because array is 0-indexed and data starts at row 2
      break;
    }
  }
  
  if (targetRow === -1) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'SKU not found: ' + sku
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  // Update each specified column
  let updatedCols = [];
  Object.keys(updates).forEach(colName => {
    const colIdx = headers.findIndex(h => h === colName);
    if (colIdx !== -1) {
      sheet.getRange(targetRow, colIdx + 1).setValue(updates[colName]);
      updatedCols.push(colName);
    }
  });
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: `Updated row ${targetRow} for SKU: ${sku}`,
    updatedColumns: updatedCols
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Add a new row to the sheet
 */
function addSheetRow(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'Sheet not found'
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const rowData = data.rowData; // { columnName: value, ... }
  
  if (!rowData) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'rowData required'
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  
  // Build the new row array based on headers
  const newRow = headers.map(header => {
    return rowData[header] !== undefined ? rowData[header] : '';
  });
  
  sheet.appendRow(newRow);
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: 'Row added successfully',
    rowNumber: sheet.getLastRow()
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Delete a row by Master SKU
 */
function deleteSheetRow(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'Sheet not found'
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const sku = data.masterSKU;
  
  if (!sku) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'masterSKU required'
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  
  const skuColIdx = headers.findIndex(h => h.toLowerCase().includes('master sku') || h.toLowerCase() === 'master sku');
  if (skuColIdx === -1) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'Master SKU column not found'
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const allData = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  let targetRow = -1;
  
  for (let i = 0; i < allData.length; i++) {
    if (String(allData[i][skuColIdx]).trim() === String(sku).trim()) {
      targetRow = i + 2;
      break;
    }
  }
  
  if (targetRow === -1) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'SKU not found: ' + sku
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  sheet.deleteRow(targetRow);
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: `Row ${targetRow} deleted for SKU: ${sku}`
  })).setMimeType(ContentService.MimeType.JSON);
}
