/**
 * ============================================================================
 * QA VIOLATIONS - Google Sheets to Supabase Sync
 * ============================================================================
 *
 * Syncs the QA Violations spreadsheet to the `qa_manual_reviews` table in Supabase.
 *
 * SHEET STRUCTURE:
 *   Each tab is named "{REVIEWER} {CAMPAIGN}" (e.g., "IAN ACA")
 *   Columns: Date(A), Time(B), Agent Name(C), Phone Number(D), Violation(E)
 *
 * INSTALLATION:
 *   1. Open the QA VIOLATIONS Google Sheet
 *   2. Go to Extensions > Apps Script
 *   3. Delete any existing code in the editor
 *   4. Paste this entire file into the editor
 *   5. Save the project (Ctrl+S / Cmd+S)
 *   6. Run the `setup()` function first (select it from the dropdown, click Run)
 *   7. Run `installTriggers()` to enable real-time sync
 *   8. Run `syncAll()` to do an initial full sync
 *
 * DEDUPLICATION:
 *   Uses Supabase upsert with ON CONFLICT (agent_name, phone_number, review_date, violation)
 *   Safe to re-run — duplicate rows are ignored.
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

var BATCH_SIZE = 100;              // Rows per upsert batch (Supabase REST limit-friendly)
var SCHEDULED_SYNC_MINUTES = 10;   // Backup sync interval

// ---------------------------------------------------------------------------
// Setup & Installation
// ---------------------------------------------------------------------------

/**
 * Run this ONCE to store Supabase credentials.
 * After running, you can delete the key from this function for security.
 */
function setup() {
  PropertiesService.getScriptProperties().setProperties({
    'SUPABASE_URL': 'YOUR_SUPABASE_URL_HERE',
    'SUPABASE_KEY': 'YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE'
  });
  Logger.log('Supabase credentials saved! Next: run installTriggers(), then syncAll().');
}

function installTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var fn = triggers[i].getHandlerFunction();
    if (fn === 'onSheetEdit' || fn === 'onSheetChange' || fn === 'scheduledSync') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('onSheetChange')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onChange()
    .create();

  ScriptApp.newTrigger('onSheetEdit')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();

  ScriptApp.newTrigger('scheduledSync')
    .timeBased()
    .everyMinutes(SCHEDULED_SYNC_MINUTES)
    .create();

  var msg = 'Triggers installed: onChange + onEdit + scheduledSync (every ' + SCHEDULED_SYNC_MINUTES + ' min).';
  Logger.log(msg);
  logToSheet('installTriggers', 'OK', msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
}

function removeAllTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  logToSheet('removeAllTriggers', 'OK', 'All triggers removed.');
  try { SpreadsheetApp.getUi().alert('All triggers removed.'); } catch (e) {}
}

// ---------------------------------------------------------------------------
// Trigger Handlers
// ---------------------------------------------------------------------------

function onSheetChange(e) {
  try {
    var changeType = e.changeType;
    if (changeType === 'INSERT_ROW' || changeType === 'EDIT' || changeType === 'OTHER') {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
      var sheetName = sheet.getName();
      if (sheetName === 'Sync Log') return;
      if (!hasSheetChanged(sheetName)) return;
      logToSheet('onChange', 'INFO', 'Change detected (' + changeType + ') in "' + sheetName + '".');
      var success = syncSheet(sheetName);
      if (success) updateSheetHash(sheetName);
    }
  } catch (err) {
    logToSheet('onChange', 'ERROR', err.message);
  }
}

function onSheetEdit(e) {
  try {
    var sheetName = e.source.getActiveSheet().getName();
    if (sheetName === 'Sync Log') return;
    Utilities.sleep(2000);
    if (!hasSheetChanged(sheetName)) return;
    var success = syncSheet(sheetName);
    if (success) updateSheetHash(sheetName);
  } catch (err) {
    logToSheet('onSheetEdit', 'ERROR', err.message);
  }
}

function scheduledSync() {
  smartSyncAll();
}

// ---------------------------------------------------------------------------
// Sync Orchestration
// ---------------------------------------------------------------------------

function smartSyncAll() {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) {
    logToSheet('smartSyncAll', 'WARN', 'Could not acquire lock.');
    return;
  }

  try {
    var sheets = getDataSheets();
    var synced = 0, skipped = 0, failed = 0;
    for (var i = 0; i < sheets.length; i++) {
      if (hasSheetChanged(sheets[i])) {
        if (syncSheetInternal(sheets[i])) {
          updateSheetHash(sheets[i]);
          synced++;
        } else { failed++; }
      } else { skipped++; }
    }
    var msg = 'Smart sync done. Synced: ' + synced + ', Skipped: ' + skipped + (failed > 0 ? ', Failed: ' + failed : '');
    logToSheet('smartSyncAll', failed > 0 ? 'WARN' : 'OK', msg);
  } finally { lock.releaseLock(); }
}

function syncAll() {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) {
    logToSheet('syncAll', 'WARN', 'Could not acquire lock.');
    return;
  }

  try {
    logToSheet('syncAll', 'INFO', 'Starting full sync...');
    var sheets = getDataSheets();
    var synced = 0, failed = 0, totalRows = 0;
    for (var i = 0; i < sheets.length; i++) {
      var count = syncSheetInternal(sheets[i]);
      if (count >= 0) {
        updateSheetHash(sheets[i]);
        synced++;
        totalRows += count;
      } else { failed++; }
    }
    var msg = 'Full sync complete. Tabs: ' + synced + ', Total rows: ' + totalRows + (failed > 0 ? ', Failed: ' + failed : '');
    logToSheet('syncAll', failed > 0 ? 'WARN' : 'OK', msg);
    try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  } finally { lock.releaseLock(); }
}

function syncSheet(sheetName) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) {
    logToSheet(sheetName, 'INFO', 'Sync skipped — lock timeout.');
    return false;
  }
  try {
    return syncSheetInternal(sheetName) >= 0;
  } finally { lock.releaseLock(); }
}

/**
 * Returns list of sheet names that contain QA data (excludes Sync Log).
 */
function getDataSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var names = [];
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    if (name !== 'Sync Log') names.push(name);
  }
  return names;
}

// ---------------------------------------------------------------------------
// Core Sync — Upsert rows into qa_manual_reviews
// ---------------------------------------------------------------------------

/**
 * Syncs a single sheet tab to Supabase.
 * Returns the number of rows synced, or -1 on failure.
 */
function syncSheetInternal(sheetName) {
  try {
    var config = getSupabaseConfig();
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet) {
      logToSheet(sheetName, 'WARN', 'Sheet not found. Skipping.');
      return -1;
    }

    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      logToSheet(sheetName, 'INFO', 'No data rows. Skipping.');
      return 0;
    }

    // Parse reviewer + campaign from tab name (e.g., "IAN ACA" → reviewer=IAN, campaign=ACA)
    var parts = sheetName.trim().split(/\s+/);
    var reviewer = parts[0] || sheetName;
    var campaign = parts.slice(1).join(' ') || null;

    // Read all data rows (skip header row 1)
    var range = sheet.getRange(2, 1, lastRow - 1, 5);
    var data = range.getDisplayValues();

    var records = [];
    var skipped = 0;
    var sheetId = SpreadsheetApp.getActiveSpreadsheet().getId();

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var rawDate = (row[0] || '').trim();
      var time = (row[1] || '').trim();
      var agentName = (row[2] || '').trim();
      var phone = (row[3] || '').toString().trim();
      var violation = (row[4] || '').trim();

      // Skip blank rows
      if (!agentName && !violation) continue;

      // Parse date
      var reviewDate = parseDate(rawDate);
      if (!reviewDate) {
        // Try to inherit date from previous row (sheets often leave date blank for same day)
        if (records.length > 0 && !rawDate) {
          reviewDate = records[records.length - 1].review_date;
        }
        if (!reviewDate) { skipped++; continue; }
      }

      if (!agentName || !violation) { skipped++; continue; }

      // Normalize phone: strip non-digits, need at least 7 digits
      var phoneDigits = phone.replace(/\D/g, '');
      var normalizedPhone = phoneDigits.length >= 7 ? phoneDigits : null;

      records.push({
        date: reviewDate,
        time: time || null,
        agent_name: agentName,
        phone_number: normalizedPhone,
        violation: violation,
        reviewer: reviewer,
        campaign: campaign,
        sheet_id: sheetId
      });
    }

    if (records.length === 0) {
      logToSheet(sheetName, 'INFO', 'No valid rows to sync.' + (skipped > 0 ? ' Skipped: ' + skipped : ''));
      return 0;
    }

    // Push via Next.js API endpoint → qa_manual_reviews table → agent card QA section
    var inserted = 0;
    var errors = [];
    for (var b = 0; b < records.length; b += BATCH_SIZE) {
      var batch = records.slice(b, b + BATCH_SIZE);
      var url = 'https://pitchvision.io/api/hr/qa-sheet-sync';
      var resp = UrlFetchApp.fetch(url, {
        method: 'post',
        headers: {
          'Authorization': 'Bearer ' + config.key,
          'Content-Type': 'application/json'
        },
        payload: JSON.stringify({ rows: batch, sheet_id: sheetId }),
        muteHttpExceptions: true
      });
      var code = resp.getResponseCode();
      if (code >= 200 && code < 300) {
        var result = JSON.parse(resp.getContentText());
        inserted += result.inserted || batch.length;
      } else {
        var errMsg = 'HTTP ' + code + ': ' + resp.getContentText().substring(0, 200);
        errors.push(errMsg);
        logToSheet(sheetName, 'ERROR', 'Batch sync failed: ' + errMsg);
      }
    }

    var msg = 'Synced ' + inserted + '/' + records.length + ' rows.' + (skipped > 0 ? ' Skipped: ' + skipped + '.' : '');
    if (errors.length > 0) msg += ' Errors: ' + errors.length + '.';
    logToSheet(sheetName, errors.length > 0 ? 'WARN' : 'OK', msg);

    return errors.length > 0 ? -1 : records.length;
  } catch (err) {
    logToSheet(sheetName, 'ERROR', 'Sync failed: ' + err.message);
    return -1;
  }
}

// ---------------------------------------------------------------------------
// Date Parsing
// ---------------------------------------------------------------------------

/**
 * Parses date from various formats:
 *   "9-17-2025"  → M-D-Y
 *   "26-2-2026"  → D-M-Y (when first > 12)
 *   "2025-09-17" → ISO
 *   "1/10/2025"  → M/D/Y
 * Returns ISO string "YYYY-MM-DD" or null.
 */
function parseDate(raw) {
  if (!raw) return null;
  var s = raw.trim();

  // ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // M-D-Y or D-M-Y with - or /
  var match = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (!match) return null;

  var a = parseInt(match[1], 10);
  var b = parseInt(match[2], 10);
  var y = parseInt(match[3], 10);
  var month, day;

  if (a > 12) {
    // First number > 12, must be day: D-M-Y
    month = b; day = a;
  } else if (b > 12) {
    // Second number > 12, must be day: M-D-Y
    month = a; day = b;
  } else {
    // Both ≤ 12: assume M-D-Y, but if result is in the future, try D-M-Y
    month = a; day = b;
    var today = new Date();
    var parsed = new Date(y, month - 1, day);
    if (parsed > today && a !== b) {
      var alt = new Date(y, b - 1, a);
      if (alt <= today) { month = b; day = a; }
    }
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return y + '-' + pad2(month) + '-' + pad2(day);
}

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

// ---------------------------------------------------------------------------
// Content-Hash Change Detection
// ---------------------------------------------------------------------------

function getSheetContentHash(sheetName) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return 'missing';
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 'empty';
  var data = sheet.getRange(2, 1, lastRow - 1, 5).getDisplayValues();
  var str = '';
  for (var i = 0; i < data.length; i++) {
    str += data[i].join('|') + '\n';
  }
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, str);
  var hex = '';
  for (var j = 0; j < digest.length; j++) {
    hex += ('0' + (digest[j] & 0xFF).toString(16)).slice(-2);
  }
  return hex;
}

function hasSheetChanged(sheetName) {
  var storedHash = PropertiesService.getScriptProperties().getProperty('HASH_' + sheetName);
  var currentHash = getSheetContentHash(sheetName);
  return storedHash !== currentHash;
}

function updateSheetHash(sheetName) {
  var hash = getSheetContentHash(sheetName);
  PropertiesService.getScriptProperties().setProperty('HASH_' + sheetName, hash);
}

function resetAllHashes() {
  var sheets = getDataSheets();
  var props = PropertiesService.getScriptProperties();
  for (var i = 0; i < sheets.length; i++) {
    props.deleteProperty('HASH_' + sheets[i]);
  }
  var msg = 'All hashes cleared. Next sync will re-sync all tabs.';
  logToSheet('resetAllHashes', 'OK', msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
}

// ---------------------------------------------------------------------------
// Supabase Helpers
// ---------------------------------------------------------------------------

function getSupabaseConfig() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('SUPABASE_URL');
  var key = props.getProperty('SUPABASE_KEY');
  if (!url || !key) throw new Error('Supabase credentials not set. Run setup() first.');
  return { url: url, key: key };
}

function getSupabaseHeaders(config, extra) {
  var h = {
    'apikey': config.key,
    'Authorization': 'Bearer ' + config.key,
    'Content-Type': 'application/json'
  };
  if (extra) {
    for (var k in extra) h[k] = extra[k];
  }
  return h;
}

// ---------------------------------------------------------------------------
// Sync Log
// ---------------------------------------------------------------------------

function logToSheet(source, level, message) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var logSheet = ss.getSheetByName('Sync Log');
    if (!logSheet) {
      logSheet = ss.insertSheet('Sync Log');
      logSheet.appendRow(['Timestamp', 'Source', 'Level', 'Message']);
      logSheet.setFrozenRows(1);
      logSheet.getRange('A1:D1').setFontWeight('bold');
    }
    // Keep log manageable: max 500 rows
    var lastRow = logSheet.getLastRow();
    if (lastRow > 500) {
      logSheet.deleteRows(2, lastRow - 300);
    }
    logSheet.appendRow([new Date().toISOString(), source, level, message]);
    Logger.log('[' + level + '] ' + source + ': ' + message);
  } catch (e) {
    Logger.log('logToSheet failed: ' + e.message);
  }
}
