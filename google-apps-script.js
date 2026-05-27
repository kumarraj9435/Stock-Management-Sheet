// ═══════════════════════════════════════════════════════════════
//  COMBINED SCRIPT: AUTO APPEND + LIVE STOCK API
//  ─────────────────────────────────────────────────────────────
//  Part 1: Auto Append (existing - Daily Blinkit Out STO → Out sheet)
//  Part 2: Live Stock API (NEW - doGet/doPost for app sync)
// ═══════════════════════════════════════════════════════════════

// ╔═══════════════════════════════════════════════════════════════╗
// ║  PART 1: AUTO APPEND SCRIPT v5.0 — ROW NUMBER TRACKING       ║
// ║  Jo row ek baar copy ho gayi, woh dobara nahi aayegi          ║
// ╚═══════════════════════════════════════════════════════════════╝

var SOURCE_SHEET = "Daily Blinkit Out STO";
var DEST_SHEET   = "Out-Blinkit,Zepto,CocoBlu,Etc";

// ── SOURCE columns jo lene hain (column number, 1=A) ──
var SRC_COLS = [9, 10, 7, 3, 6, 8];

// ── DEST mein kahan jaayega ──
var COL_MAP = [
  [0, 1],   // Date    → Dest A
  [1, 2],   // Portal  → Dest B
  [2, 3],   // Po No   → Dest C
  [3, 4],   // EAN     → Dest D
  [4, 7],   // Qty     → Dest G
  [5, 8]    // Invoice → Dest H
];

var SRC_START_ROW  = 2016;
var SRC_READ_COLS  = 15;
var LAST_ROW_KEY   = "lastCopiedSrcRow";

function autoAppendNewRows() {
  try {
    var ss        = SpreadsheetApp.getActiveSpreadsheet();
    var srcSheet  = ss.getSheetByName(SOURCE_SHEET);
    var destSheet = ss.getSheetByName(DEST_SHEET);

    if (!srcSheet)  { Logger.log("❌ Source sheet nahi mili: " + SOURCE_SHEET); return; }
    if (!destSheet) { Logger.log("❌ Dest sheet nahi mili: " + DEST_SHEET); return; }

    var props = PropertiesService.getScriptProperties();
    var lastCopiedRow = parseInt(props.getProperty(LAST_ROW_KEY) || (SRC_START_ROW - 1));
    
    Logger.log("Pichli baar copy ki gayi last row: " + lastCopiedRow);

    var srcLastRow = srcSheet.getLastRow();
    Logger.log("Source mein total rows: " + srcLastRow);

    if (srcLastRow <= lastCopiedRow) {
      Logger.log("✅ Koi naya data nahi. Source last row: " + srcLastRow + ", Last copied: " + lastCopiedRow);
      return;
    }

    var newStartRow  = lastCopiedRow + 1;
    var totalNewRows = srcLastRow - newStartRow + 1;
    
    Logger.log("Naye rows padhne hain: row " + newStartRow + " se row " + srcLastRow + " tak (" + totalNewRows + " rows)");
    
    var srcData = srcSheet.getRange(newStartRow, 1, totalNewRows, SRC_READ_COLS).getValues();

    var rowsToAppend = [];

    for (var r = 0; r < srcData.length; r++) {
      var srcRow = srcData[r];
      var ean = srcRow[3 - 1];

      if (!ean || ean.toString().trim() === "") {
        Logger.log("Row " + (newStartRow + r) + " skip — EAN empty");
        continue;
      }

      var rowValues = [];
      for (var c = 0; c < SRC_COLS.length; c++) {
        var val = srcRow[SRC_COLS[c] - 1];
        if (val instanceof Date) {
          val = Utilities.formatDate(val, Session.getScriptTimeZone(), "dd-MM-yyyy");
        }
        rowValues.push(val !== undefined && val !== null ? val : "");
      }

      rowsToAppend.push(rowValues);
    }

    Logger.log("Valid rows milaye append ke liye: " + rowsToAppend.length);

    if (rowsToAppend.length === 0) {
      Logger.log("✅ Koi valid row nahi — EAN wali rows nahi mili.");
      props.setProperty(LAST_ROW_KEY, srcLastRow.toString());
      return;
    }

    var appendStartRow = destSheet.getLastRow() + 1;
    Logger.log("Dest mein append shuru hoga row " + appendStartRow + " se");

    for (var nr = 0; nr < rowsToAppend.length; nr++) {
      var entry    = rowsToAppend[nr];
      var writeRow = appendStartRow + nr;

      for (var mp = 0; mp < COL_MAP.length; mp++) {
        var valIdx  = COL_MAP[mp][0];
        var destCol = COL_MAP[mp][1];

        if (destCol === 5 || destCol === 6) continue;

        destSheet.getRange(writeRow, destCol).setValue(entry[valIdx]);
      }
    }

    props.setProperty(LAST_ROW_KEY, srcLastRow.toString());
    props.setProperty("lastRun", Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd-MM-yyyy HH:mm:ss"));

    Logger.log("✅ " + rowsToAppend.length + " naye rows append kiye. Last copied row ab: " + srcLastRow);

  } catch(err) {
    Logger.log("❌ Error: " + err.message);
    Logger.log("Stack: " + err.stack);
  }
}

function resetLastRow() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty(LAST_ROW_KEY, (SRC_START_ROW - 1).toString());
  Logger.log("✅ Reset ho gaya. Agli baar row " + SRC_START_ROW + " se shuru hoga.");
  SpreadsheetApp.getUi().alert("✅ Reset ho gaya!\nAgli sync row " + SRC_START_ROW + " se shuru hogi.");
}

function checkStatus() {
  var props = PropertiesService.getScriptProperties();
  var lastRow = props.getProperty(LAST_ROW_KEY) || "Abhi set nahi hua";
  var lastRun = props.getProperty("lastRun") || "Kabhi nahi chala";
  SpreadsheetApp.getUi().alert(
    "📊 Status:\n\n" +
    "Last copied source row: " + lastRow + "\n" +
    "Last run time: " + lastRun
  );
}

function setupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "autoAppendNewRows") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger("autoAppendNewRows")
    .timeBased()
    .everyMinutes(5)
    .create();

  SpreadsheetApp.getUi().alert(
    "✅ Auto-Append ON!\n\n" +
    "Har 5 min mein:\n" +
    "• Naye rows automatically copy honge\n" +
    "• Row number track hoga — duplicate kabhi nahi\n" +
    "• E col (VLOOKUP) — safe ✓\n" +
    "• F col (Dropdown) — safe ✓"
  );
}

function removeTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var count = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "autoAppendNewRows") {
      ScriptApp.deleteTrigger(triggers[i]); count++;
    }
  }
  SpreadsheetApp.getUi().alert("🛑 Auto-Append band. (" + count + " trigger removed)");
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🔄 Auto Append")
    .addItem("▶ Abhi Sync Karo (Manual)", "autoAppendNewRows")
    .addSeparator()
    .addItem("⚡ Auto-Sync ON (Har 5 min)", "setupTrigger")
    .addItem("🛑 Auto-Sync Band Karo", "removeTrigger")
    .addSeparator()
    .addItem("📊 Status Check Karo", "checkStatus")
    .addItem("🔁 Reset (Row 2016 se shuru)", "resetLastRow")
    .addToUi();
}


// ╔═══════════════════════════════════════════════════════════════╗
// ║  PART 2: LIVE STOCK API — doGet / doPost                      ║
// ║  App se Google Sheet read + write (bidirectional sync)        ║
// ║  ALL SHEETS support — sabhi sheets ka data dikhata hai        ║
// ╚═══════════════════════════════════════════════════════════════╝

var SPREADSHEET_ID = '1KP9ge5g4_7ugdeJDwbOSPV26Qo9xVvo3SgDG5R6jHlo';
var DEFAULT_SHEET  = 'Master Sheet 2026';

/**
 * Handle GET requests — Read data from sheet(s)
 * 
 * Parameters:
 *   action=read (default) — read single sheet
 *   action=readAll — read ALL sheets
 *   action=listSheets — get list of all sheet names
 *   action=getSKUList — get SKU list from Master Sheet 2026 (for auto-suggest)
 *   sheet=SheetName — specify which sheet to read (default: Master Sheet 2026)
 */
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'read';
    var sheetName = (e && e.parameter && e.parameter.sheet) ? e.parameter.sheet : DEFAULT_SHEET;
    
    if (action === 'read') {
      return readSheetData(sheetName);
    } else if (action === 'readAll') {
      return readAllSheets();
    } else if (action === 'listSheets') {
      return listAllSheets();
    } else if (action === 'getSKUList') {
      return getSKUList();
    }
    
    return jsonResponse({ success: false, error: 'Invalid action. Use: read, readAll, listSheets, getSKUList' });
    
  } catch (error) {
    return jsonResponse({ success: false, error: error.toString() });
  }
}

/**
 * Handle POST requests — Write/Update data in sheet
 * 
 * Body JSON:
 *   action: 'update' | 'add' | 'delete'
 *   sheet: 'SheetName' (optional, default: Master Sheet 2026)
 *   masterSKU: 'SKU value' (for update/delete)
 *   updates: { columnName: newValue } (for update)
 *   rowData: { columnName: value } (for add)
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action || 'update';
    var sheetName = data.sheet || DEFAULT_SHEET;
    
    if (action === 'update') {
      return updateSheetRow(data, sheetName);
    } else if (action === 'add') {
      return addSheetRow(data, sheetName);
    } else if (action === 'delete') {
      return deleteSheetRow(data, sheetName);
    }
    
    return jsonResponse({ success: false, error: 'Invalid action. Use: update, add, delete' });
    
  } catch (error) {
    return jsonResponse({ success: false, error: error.toString() });
  }
}

// ── Helper: JSON Response ──
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── List all sheet names ──
function listAllSheets() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheets = ss.getSheets();
  var sheetNames = sheets.map(function(s) { return s.getName(); });
  
  return jsonResponse({
    success: true,
    sheets: sheetNames,
    totalSheets: sheetNames.length
  });
}

// ── Read ALL sheets data ──
function readAllSheets() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheets = ss.getSheets();
  var allData = {};
  
  sheets.forEach(function(sheet) {
    var name = sheet.getName();
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    
    if (lastRow < 1 || lastCol < 1) {
      allData[name] = { headers: [], data: [], totalRows: 0 };
      return;
    }
    
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).trim(); });
    
    if (lastRow < 2) {
      allData[name] = { headers: headers, data: [], totalRows: 0 };
      return;
    }
    
    var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    
    var rows = [];
    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var isEmpty = true;
      var obj = {};
      
      for (var j = 0; j < headers.length; j++) {
        var val = row[j];
        if (val instanceof Date) {
          val = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
        }
        obj[headers[j]] = (val !== null && val !== undefined) ? val : '';
        if (val !== '' && val !== null && val !== undefined) isEmpty = false;
      }
      
      if (!isEmpty) {
        obj._rowNumber = i + 2;
        rows.push(obj);
      }
    }
    
    allData[name] = { headers: headers, data: rows, totalRows: rows.length };
  });
  
  return jsonResponse({
    success: true,
    sheets: allData,
    lastUpdated: new Date().toISOString()
  });
}

// ── Get SKU list from Master Sheet 2026 (for auto-suggest in app) ──
function getSKUList() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(DEFAULT_SHEET);
  
  if (!sheet) {
    return jsonResponse({ success: false, error: 'Master Sheet 2026 not found' });
  }
  
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  
  if (lastRow < 2 || lastCol < 1) {
    return jsonResponse({ success: true, skuList: [], totalItems: 0 });
  }
  
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).trim(); });
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  
  // Find relevant column indices
  var skuColIdx = headers.findIndex(function(h) { 
    var lower = h.toLowerCase();
    return lower === 'master sku' || lower.includes('master sku');
  });
  if (skuColIdx === -1) skuColIdx = headers.findIndex(function(h) { return h.toLowerCase() === 'sku'; });
  if (skuColIdx === -1) skuColIdx = 0;
  
  var nameColIdx = headers.findIndex(function(h) { 
    var lower = h.toLowerCase();
    return lower.includes('product name') || lower === 'name' || lower === 'product';
  });
  
  var eanColIdx = headers.findIndex(function(h) { 
    var lower = h.toLowerCase();
    return lower.includes('ean') || lower.includes('barcode');
  });
  
  var categoryColIdx = headers.findIndex(function(h) { 
    return h.toLowerCase().includes('category');
  });
  
  var skuList = [];
  
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var sku = skuColIdx >= 0 ? String(row[skuColIdx]).trim() : '';
    var name = nameColIdx >= 0 ? String(row[nameColIdx]).trim() : '';
    var ean = eanColIdx >= 0 ? String(row[eanColIdx]).trim() : '';
    var category = categoryColIdx >= 0 ? String(row[categoryColIdx]).trim() : '';
    
    if (!sku && !ean) continue; // Skip empty rows
    
    skuList.push({
      sku: sku,
      name: name,
      ean: ean,
      category: category
    });
  }
  
  return jsonResponse({
    success: true,
    skuList: skuList,
    totalItems: skuList.length,
    lastUpdated: new Date().toISOString()
  });
}

// ── Read single sheet data ──
function readSheetData(sheetName) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    return jsonResponse({ success: false, error: 'Sheet not found: ' + sheetName });
  }
  
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  
  if (lastRow < 2 || lastCol < 1) {
    return jsonResponse({
      success: true,
      sheetName: sheetName,
      data: [],
      headers: lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).trim(); }) : [],
      totalRows: 0,
      lastUpdated: new Date().toISOString()
    });
  }
  
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).trim(); });
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var isEmpty = true;
    var obj = {};
    
    for (var j = 0; j < headers.length; j++) {
      var val = row[j];
      if (val instanceof Date) {
        val = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
      }
      obj[headers[j]] = (val !== null && val !== undefined) ? val : '';
      if (val !== '' && val !== null && val !== undefined) isEmpty = false;
    }
    
    if (!isEmpty) {
      obj._rowNumber = i + 2;
      rows.push(obj);
    }
  }
  
  return jsonResponse({
    success: true,
    sheetName: sheetName,
    data: rows,
    headers: headers,
    totalRows: rows.length,
    lastUpdated: new Date().toISOString()
  });
}

// ── Update a row by Master SKU (or first column match) ──
function updateSheetRow(data, sheetName) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    return jsonResponse({ success: false, error: 'Sheet not found: ' + sheetName });
  }
  
  var sku = data.masterSKU;
  var updates = data.updates;
  var searchColumn = data.searchColumn; // optional: specify which column to search
  
  if (!sku || !updates) {
    return jsonResponse({ success: false, error: 'masterSKU and updates required' });
  }
  
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).trim(); });
  
  // Find the search column index
  var skuColIdx = -1;
  if (searchColumn) {
    skuColIdx = headers.findIndex(function(h) { return h === searchColumn; });
  }
  if (skuColIdx === -1) {
    // Try common SKU column names
    skuColIdx = headers.findIndex(function(h) { 
      var lower = h.toLowerCase();
      return lower.includes('master sku') || lower === 'sku' || lower === 'master sku' || lower.includes('ean') || lower.includes('barcode');
    });
  }
  if (skuColIdx === -1) {
    skuColIdx = 0; // fallback to first column
  }
  
  var allData = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var targetRow = -1;
  
  for (var i = 0; i < allData.length; i++) {
    if (String(allData[i][skuColIdx]).trim() === String(sku).trim()) {
      targetRow = i + 2;
      break;
    }
  }
  
  if (targetRow === -1) {
    return jsonResponse({ success: false, error: 'Value not found: ' + sku + ' in column: ' + headers[skuColIdx] });
  }
  
  var updatedCols = [];
  var keys = Object.keys(updates);
  for (var k = 0; k < keys.length; k++) {
    var colName = keys[k];
    var colIdx = headers.indexOf(colName);
    if (colIdx !== -1) {
      sheet.getRange(targetRow, colIdx + 1).setValue(updates[colName]);
      updatedCols.push(colName);
    }
  }
  
  return jsonResponse({
    success: true,
    message: 'Updated row ' + targetRow + ' in sheet: ' + sheetName,
    updatedColumns: updatedCols
  });
}

// ── Add a new row to sheet ──
function addSheetRow(data, sheetName) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    return jsonResponse({ success: false, error: 'Sheet not found: ' + sheetName });
  }
  
  var rowData = data.rowData;
  
  if (!rowData) {
    return jsonResponse({ success: false, error: 'rowData required' });
  }
  
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).trim(); });
  
  var newRow = headers.map(function(header) {
    return rowData[header] !== undefined ? rowData[header] : '';
  });
  
  sheet.appendRow(newRow);
  
  return jsonResponse({
    success: true,
    message: 'Row added to sheet: ' + sheetName,
    rowNumber: sheet.getLastRow()
  });
}

// ── Delete a row by SKU/identifier ──
function deleteSheetRow(data, sheetName) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    return jsonResponse({ success: false, error: 'Sheet not found: ' + sheetName });
  }
  
  var sku = data.masterSKU;
  var searchColumn = data.searchColumn;
  
  if (!sku) {
    return jsonResponse({ success: false, error: 'masterSKU required' });
  }
  
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).trim(); });
  
  var skuColIdx = -1;
  if (searchColumn) {
    skuColIdx = headers.findIndex(function(h) { return h === searchColumn; });
  }
  if (skuColIdx === -1) {
    skuColIdx = headers.findIndex(function(h) { 
      var lower = h.toLowerCase();
      return lower.includes('master sku') || lower === 'sku' || lower === 'master sku';
    });
  }
  if (skuColIdx === -1) skuColIdx = 0;
  
  var allData = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var targetRow = -1;
  
  for (var i = 0; i < allData.length; i++) {
    if (String(allData[i][skuColIdx]).trim() === String(sku).trim()) {
      targetRow = i + 2;
      break;
    }
  }
  
  if (targetRow === -1) {
    return jsonResponse({ success: false, error: 'SKU not found: ' + sku });
  }
  
  sheet.deleteRow(targetRow);
  
  return jsonResponse({
    success: true,
    message: 'Row ' + targetRow + ' deleted from sheet: ' + sheetName
  });
}
