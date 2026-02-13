/**
 * ============================================================================
 * HR TRACKER - Google Sheets to Supabase Sync (Enhanced V3)
 * ============================================================================
 *
 * FEATURES:
 * - Zero-downtime atomic sync (old data stays visible until new data confirmed)
 * - onChange trigger for paste/import/bulk edit detection
 * - onEdit trigger for individual cell edits
 * - Content-hash smart scheduling (skips unchanged sheets)
 * - Sync lock to prevent overlapping syncs on the same sheet
 * - Auto-creates employee_directory entries for new hires
 * - Auto-marks employee_directory entries as Terminated
 * - Comprehensive audit logging with Sync Log sheet
 *
 * INSTALLATION INSTRUCTIONS:
 * --------------------------
 * 1. Open your HR TRACKER Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Delete any existing code in the editor
 * 4. Paste this entire file into the editor
 * 5. Save the project (Ctrl+S / Cmd+S)
 * 6. Run the `setup()` function first (select it from the dropdown, click Run)
 *    - This stores Supabase credentials as Script Properties
 *    - You will be prompted to authorize the script on first run
 * 7. Run `installTriggers()` to enable real-time sync
 * 8. Run `syncAll()` to do an initial full sync of all tabs
 *
 * MANUAL SYNC:
 * - Run `syncAll()` to force-sync every tab at once
 * - Use the "Supabase Sync" menu for individual tab syncs
 *
 * TROUBLESHOOTING:
 * - Check the "Sync Log" sheet tab for error details
 * - Re-run `setup()` if credentials need updating
 * - Re-run `installTriggers()` if real-time sync stops working
 * - Run `removeAllTriggers()` to clear all triggers and start fresh
 *
 * TAB -> TABLE MAPPINGS:
 *   "Agent Schedule"       -> Supabase "Agent Schedule" table
 *   "Booked Days Off"      -> Supabase "Booked Days Off" table
 *   "Non Booked Days Off"  -> Supabase "Non Booked Days Off" table
 *   "Hired"                -> Supabase "HR Hired" table
 *   "Terminated"           -> Supabase "HR Fired" table
 *   "Agent Break Schedule" -> Supabase "Agent Break Schedule" table
 *   "Agent Attendance Watch List" -> Supabase "Agent Attendance Watch List" table
 *
 * POST-SYNC HOOKS:
 *   After "Hired" sync     -> Creates employee_directory entries for new hires
 *   After "Terminated" sync-> Marks employee_directory entries as Terminated
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

var SHEET_TABLE_MAP = {
  'Agent Schedule': 'Agent Schedule',
  'Booked Days Off': 'Booked Days Off',
  'Non Booked Days Off ': 'Non Booked Days Off',  // NOTE: tab name has trailing space
  'Hired': 'HR Hired',
  'Terminated': 'HR Fired',
  'Agent Break Schedule': 'Agent Break Schedule',
  'Agent Attendance Watch List': 'Agent Attendance Watch List'
};

var BATCH_SIZE = 50;               // Rows per insert batch
var DELETE_BATCH_SIZE = 40;        // IDs per delete batch (40 UUIDs ≈ 1.5KB URL, under Apps Script 2KB limit)
var SCHEDULED_SYNC_MINUTES = 5;    // Backup sync interval

// ---------------------------------------------------------------------------
// Setup & Installation
// ---------------------------------------------------------------------------

/**
 * Run this ONCE to store Supabase credentials.
 * IMPORTANT: Use the service_role key (NOT anon key) because several tables
 * have RLS enabled. Find it at: Supabase Dashboard > Settings > API > service_role key
 */
function setup() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt(
    'Supabase Setup',
    'Enter your Supabase service_role key\n(Dashboard > Settings > API > service_role):\n\nIMPORTANT: Use service_role, NOT anon key.',
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() === ui.Button.OK) {
    var key = result.getResponseText().trim();
    if (key) {
      PropertiesService.getScriptProperties().setProperties({
        'SUPABASE_URL': 'https://eyrxkirpubylgkkvcrlh.supabase.co',
        'SUPABASE_KEY': key
      });
      ui.alert('Supabase credentials saved!\n\nNext steps:\n1. Run installTriggers()\n2. Run syncAll()');
    } else {
      ui.alert('No key entered. Please try again.');
    }
  }
}

/**
 * Installs all three triggers:
 * 1. onChange — catches paste, import, bulk edits, row inserts/deletes
 * 2. onEdit — catches individual cell edits
 * 3. scheduledSync — backup full sync every N minutes
 */
function installTriggers() {
  // Remove existing sync triggers to avoid duplicates
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var fn = triggers[i].getHandlerFunction();
    if (fn === 'onSheetEdit' || fn === 'onSheetChange' || fn === 'scheduledSync') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // 1. onChange — fires on paste, import, bulk edits, row insert/delete
  ScriptApp.newTrigger('onSheetChange')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onChange()
    .create();

  // 2. onEdit — fires on individual cell edits
  ScriptApp.newTrigger('onSheetEdit')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();

  // 3. Scheduled backup sync
  ScriptApp.newTrigger('scheduledSync')
    .timeBased()
    .everyMinutes(SCHEDULED_SYNC_MINUTES)
    .create();

  var msg = 'Triggers installed: onChange + onEdit + scheduledSync (every ' + SCHEDULED_SYNC_MINUTES + ' min).';
  Logger.log(msg);
  logToSheet('installTriggers', 'OK', msg);

  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    // UI not available in time-driven context
  }
}

/**
 * Removes all triggers — use if you need to reset.
 */
function removeAllTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  logToSheet('removeAllTriggers', 'OK', 'All triggers removed.');
  try {
    SpreadsheetApp.getUi().alert('All triggers removed.');
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// Trigger Handlers
// ---------------------------------------------------------------------------

/**
 * onChange handler — fires on paste, import, bulk edits, row inserts/deletes.
 * Does NOT provide specific cell info, so syncs the entire sheet.
 * Skips if content hash unchanged (prevents redundant syncs after syncAll).
 */
function onSheetChange(e) {
  try {
    var changeType = e.changeType;
    // Only process data-modifying changes
    if (changeType === 'INSERT_ROW' || changeType === 'EDIT' || changeType === 'OTHER') {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
      var sheetName = sheet.getName();
      if (SHEET_TABLE_MAP[sheetName]) {
        if (!hasSheetChanged(sheetName)) return; // Skip if content unchanged
        logToSheet('onChange', 'INFO', 'Change detected (' + changeType + ') in "' + sheetName + '".');
        syncSheet(sheetName);
        updateSheetHash(sheetName);
      }
    }
  } catch (err) {
    logToSheet('onChange', 'ERROR', err.message);
  }
}

/**
 * onEdit handler — fires on individual cell edits.
 * Debounces 2 seconds for rapid edits, then syncs the full sheet.
 * Skips if content hash unchanged (prevents redundant syncs).
 */
function onSheetEdit(e) {
  try {
    var sheetName = e.source.getActiveSheet().getName();
    if (SHEET_TABLE_MAP[sheetName]) {
      Utilities.sleep(2000);
      if (!hasSheetChanged(sheetName)) return; // Skip if content unchanged
      syncSheet(sheetName);
      updateSheetHash(sheetName);
    }
  } catch (err) {
    logToSheet('onSheetEdit', 'ERROR', err.message);
  }
}

/**
 * Scheduled sync — only syncs sheets that have changed since last sync.
 * Uses content hashing to skip unchanged sheets and reduce API calls.
 */
function scheduledSync() {
  smartSyncAll();
}

// ---------------------------------------------------------------------------
// Sync Orchestration
// ---------------------------------------------------------------------------

/**
 * Smart sync: only syncs sheets whose content hash has changed.
 * Called by the scheduled trigger to minimize unnecessary API calls.
 * Holds the script lock for the entire duration to prevent concurrent syncs.
 */
function smartSyncAll() {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    logToSheet('smartSyncAll', 'WARN', 'Could not acquire lock. Another sync in progress.');
    return;
  }

  try {
    logToSheet('smartSyncAll', 'INFO', 'Starting smart sync...');
    var synced = 0;
    var skipped = 0;
    var failed = 0;
    var sheetNames = Object.keys(SHEET_TABLE_MAP);

    for (var i = 0; i < sheetNames.length; i++) {
      var sheetName = sheetNames[i];
      if (hasSheetChanged(sheetName)) {
        var success = syncSheetInternal(sheetName);
        if (success) {
          updateSheetHash(sheetName);
          synced++;
        } else {
          failed++;
        }
      } else {
        skipped++;
      }
    }

    var msg = 'Smart sync done. Synced: ' + synced + ', Skipped (unchanged): ' + skipped + (failed > 0 ? ', Failed: ' + failed : '') + '.';
    logToSheet('smartSyncAll', failed > 0 ? 'WARN' : 'OK', msg);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Force sync ALL sheets regardless of content changes.
 * Use for initial setup or manual recovery.
 * Holds the script lock for the entire duration to prevent concurrent syncs.
 */
function syncAll() {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    logToSheet('syncAll', 'WARN', 'Could not acquire lock. Another sync in progress.');
    return;
  }

  try {
    logToSheet('syncAll', 'INFO', 'Starting full sync of all tabs...');
    var sheetNames = Object.keys(SHEET_TABLE_MAP);
    var synced = 0;
    var failed = 0;
    for (var i = 0; i < sheetNames.length; i++) {
      var success = syncSheetInternal(sheetNames[i]);
      if (success) {
        updateSheetHash(sheetNames[i]);
        synced++;
      } else {
        failed++;
      }
    }
    var msg = 'Full sync complete. Synced: ' + synced + ', Failed: ' + failed + '.';
    logToSheet('syncAll', failed > 0 ? 'WARN' : 'OK', msg);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Syncs a single sheet by name. Acquires script lock, runs the sync,
 * then releases. Used by trigger handlers (onChange, onEdit).
 */
function syncSheet(sheetName) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    logToSheet(sheetName, 'INFO', 'Sync skipped — another sync in progress (lock timeout).');
    return;
  }

  try {
    syncSheetInternal(sheetName);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Internal sync dispatcher — runs the appropriate sync function for a sheet.
 * MUST be called while holding the script lock.
 * Returns true if sync succeeded, false if it failed.
 */
function syncSheetInternal(sheetName) {
  try {
    switch (sheetName) {
      case 'Agent Schedule':       syncAgentSchedule();       break;
      case 'Booked Days Off':      syncBookedDaysOff();       break;
      case 'Non Booked Days Off ':  syncNonBookedDaysOff();    break;  // trailing space in tab name
      case 'Hired':                syncHired();               break;
      case 'Terminated':           syncTerminated();          break;
      case 'Agent Break Schedule': syncAgentBreakSchedule();  break;
      case 'Agent Attendance Watch List': syncAgentAttendanceWatchList(); break;
    }
    return true;
  } catch (err) {
    logToSheet(sheetName, 'ERROR', 'Sync failed: ' + err.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Content-Hash Change Detection
// ---------------------------------------------------------------------------

/**
 * Computes MD5 hash of a sheet's content for change detection.
 */
function getSheetContentHash(sheetName) {
  var data = getSheetData(sheetName);
  if (!data || data.length === 0) return 'empty';
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

/**
 * Returns true if the sheet content differs from the last synced hash.
 */
function hasSheetChanged(sheetName) {
  var props = PropertiesService.getScriptProperties();
  var storedHash = props.getProperty('HASH_' + sheetName);
  var currentHash = getSheetContentHash(sheetName);
  return storedHash !== currentHash;
}

/**
 * Stores the current content hash for a sheet after successful sync.
 */
function updateSheetHash(sheetName) {
  var hash = getSheetContentHash(sheetName);
  PropertiesService.getScriptProperties().setProperty('HASH_' + sheetName, hash);
}

/**
 * Clears all stored content hashes, forcing the next smartSyncAll to re-sync
 * every sheet. Use this after recovering from a failed sync or API key change.
 */
function resetAllHashes() {
  var props = PropertiesService.getScriptProperties();
  var sheetNames = Object.keys(SHEET_TABLE_MAP);
  for (var i = 0; i < sheetNames.length; i++) {
    props.deleteProperty('HASH_' + sheetNames[i]);
  }
  var msg = 'All content hashes cleared. Next scheduled sync will re-sync all ' + sheetNames.length + ' sheets.';
  logToSheet('resetAllHashes', 'OK', msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
}

/**
 * Verifies the Supabase API key is working by making a lightweight health check.
 * Run this after setting up credentials or if syncs are failing with 401.
 */
function verifyApiKey() {
  var config = getSupabaseConfig();
  var url = config.url + '/rest/v1/';
  var resp = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: getSupabaseHeaders(config),
    muteHttpExceptions: true
  });
  var code = resp.getResponseCode();
  var ok = code >= 200 && code < 300;
  var msg = ok
    ? 'API key is valid. HTTP ' + code
    : 'API key check FAILED. HTTP ' + code + ': ' + resp.getContentText();
  logToSheet('verifyApiKey', ok ? 'OK' : 'ERROR', msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return ok;
}

// ---------------------------------------------------------------------------
// Sync Lock — handled by LockService.getScriptLock() in syncSheet/syncAll
// ---------------------------------------------------------------------------
// NOTE: The previous PropertiesService-based lock had a TOCTOU race condition
// where two concurrent executions could both read the lock as "free" before
// either one wrote it. LockService.getScriptLock() provides a true atomic
// mutex that prevents this race condition entirely.

// ---------------------------------------------------------------------------
// Individual Sync Functions
// ---------------------------------------------------------------------------

/**
 * Agent Schedule tab -> "Agent Schedule" table
 * Columns: First Name(A), Last Name(B), Mon(C), Tue(D), Wed(E), Thu(F), Fri(G), Notes(H), Active(I)
 */
function syncAgentSchedule() {
  var sheetName = 'Agent Schedule';
  var tableName = SHEET_TABLE_MAP[sheetName];
  try {
    var data = getSheetData(sheetName);
    if (!data || data.length === 0) { logToSheet(sheetName, 'WARN', 'No data rows. Skipping.'); return; }
    var rows = [];
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (isBlank(row[0]) && isBlank(row[1])) continue;
      rows.push({
        'First Name': trimVal(row[0]),
        'Last Name': trimVal(row[1]),
        'Monday': trimVal(row[2]),
        'Tuesday': trimVal(row[3]),
        'Wednesday': trimVal(row[4]),
        'Thursday': trimVal(row[5]),
        'Friday': trimVal(row[6]),
        'Notes': trimVal(row[7]),
        'is_active': parseBoolean(row[8], true)
      });
    }
    atomicReplaceSync(tableName, rows, sheetName);
  } catch (err) { logToSheet(sheetName, 'ERROR', err.message); throw err; }
}

/**
 * Booked Days Off tab -> "Booked Days Off" table
 * Columns: Agent Name(A), Date(B)
 * Date format: "5 Jan 2026" or "DD Mon YYYY" -> ISO
 */
function syncBookedDaysOff() {
  var sheetName = 'Booked Days Off';
  var tableName = SHEET_TABLE_MAP[sheetName];
  try {
    var data = getSheetData(sheetName);
    if (!data || data.length === 0) { logToSheet(sheetName, 'WARN', 'No data rows. Skipping.'); return; }
    var rows = [];
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (isBlank(row[0]) && isBlank(row[1])) continue;
      rows.push({
        'Agent Name': trimVal(row[0]),
        'Date': parseDateDDMonYYYY(row[1])
      });
    }
    atomicReplaceSync(tableName, rows, sheetName);
  } catch (err) { logToSheet(sheetName, 'ERROR', err.message); throw err; }
}

/**
 * Non Booked Days Off tab -> "Non Booked Days Off" table
 * Columns: Agent Name(A), Reason(B), Date(C)
 * Date format: "5 Jan 2026" or Date object -> ISO
 */
function syncNonBookedDaysOff() {
  var sheetName = 'Non Booked Days Off ';  // trailing space in tab name
  var tableName = SHEET_TABLE_MAP[sheetName];
  try {
    var data = getSheetData(sheetName);
    if (!data || data.length === 0) { logToSheet(sheetName, 'WARN', 'No data rows. Skipping.'); return; }
    var rows = [];
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (isBlank(row[0])) continue; // Skip rows without an agent name
      rows.push({
        'Agent Name': trimVal(row[0]),
        'Reason': trimVal(row[1]),
        'Date': parseDateDDMonYYYY(row[2])
      });
    }
    atomicReplaceSync(tableName, rows, sheetName);
  } catch (err) { logToSheet(sheetName, 'ERROR', err.message); throw err; }
}

/**
 * Agent Break Schedule tab -> "Agent Break Schedule" table
 * Columns: First Name(A), Last Name(B), First Break(C), Lunch Break(D), Second Break(E), Notes(F)
 */
function syncAgentBreakSchedule() {
  var sheetName = 'Agent Break Schedule';
  var tableName = SHEET_TABLE_MAP[sheetName];
  try {
    var data = getSheetData(sheetName);
    if (!data || data.length === 0) { logToSheet(sheetName, 'WARN', 'No data rows. Skipping.'); return; }
    var rows = [];
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (isBlank(row[0]) && isBlank(row[1])) continue;
      rows.push({
        'First Name': trimVal(row[0]),
        'Last Name': trimVal(row[1]),
        'First Break': trimVal(row[2]),
        'Lunch Break': trimVal(row[3]),
        'Second Break': trimVal(row[4]),
        'Notes': trimVal(row[5])
      });
    }
    atomicReplaceSync(tableName, rows, sheetName);
  } catch (err) { logToSheet(sheetName, 'ERROR', err.message); throw err; }
}

/**
 * Agent Attendance Watch List tab -> "Agent Attendance Watch List" table
 * Columns: Agent Name(A), COUNTA of Reason(B)
 * This is a pivot/summary sheet that counts unplanned absences per agent.
 */
function syncAgentAttendanceWatchList() {
  var sheetName = 'Agent Attendance Watch List';
  var tableName = SHEET_TABLE_MAP[sheetName];
  try {
    var data = getSheetData(sheetName);
    if (!data || data.length === 0) { logToSheet(sheetName, 'WARN', 'No data rows. Skipping.'); return; }
    var rows = [];
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (isBlank(row[0])) continue;
      var count = parseInt(row[1], 10);
      if (isNaN(count) || count <= 0) continue;
      rows.push({
        'Agent Name': trimVal(row[0]),
        'COUNTA of Reason': count
      });
    }
    atomicReplaceSync(tableName, rows, sheetName);
  } catch (err) { logToSheet(sheetName, 'ERROR', err.message); throw err; }
}

/**
 * Hired tab -> "HR Hired" table
 * Columns: Agent Name(A), Hire Date(B), Campaign(C), Canadian/American(D)
 * Date format: DD/MM/YYYY -> ISO
 *
 * Post-sync: creates employee_directory entries for new hires.
 */
function syncHired() {
  var sheetName = 'Hired';
  var tableName = SHEET_TABLE_MAP[sheetName];
  try {
    var data = getSheetData(sheetName, true);
    if (!data || data.length === 0) { logToSheet(sheetName, 'WARN', 'No data rows. Skipping.'); return; }
    var rows = [];
    var skipped = 0;
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (isBlank(row[0])) continue;
      var parsedDate = parseDateDDMMYYYY(row[1]);
      if (parsedDate && !isValidISODate(parsedDate)) {
        logToSheet(sheetName, 'WARN', 'Skipping row ' + (i + 2) + ' (' + trimVal(row[0]) + '): invalid date "' + row[1] + '"');
        skipped++;
        continue;
      }
      rows.push({
        'Agent Name': trimVal(row[0]),
        'Hire Date': parsedDate,
        'Campaign': trimVal(row[2]),
        'Canadian/American': trimVal(row[3])
      });
    }
    if (skipped > 0) logToSheet(sheetName, 'WARN', 'Skipped ' + skipped + ' rows with invalid dates.');
    atomicReplaceSync(tableName, rows, sheetName);

    // Post-sync: create employee_directory entries for new hires
    createEmployeeDirectoryEntries(rows, sheetName);
  } catch (err) { logToSheet(sheetName, 'ERROR', err.message); throw err; }
}

/**
 * Terminated tab -> "HR Fired" table
 * Columns: Canadian/American(A), Agent Name(B), Termination Date(C),
 *   Fired/Quit(D), Reason for Termination(E), Campaign(F)
 * Date format: DD/MM/YYYY -> ISO
 *
 * Post-sync: marks employee_directory entries as Terminated.
 */
function syncTerminated() {
  var sheetName = 'Terminated';
  var tableName = SHEET_TABLE_MAP[sheetName];
  try {
    var data = getSheetData(sheetName, true);
    if (!data || data.length === 0) { logToSheet(sheetName, 'WARN', 'No data rows. Skipping.'); return; }
    var rows = [];
    var skipped = 0;
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (isBlank(row[1])) continue; // Agent Name is col B
      var parsedDate = parseDateDDMMYYYY(row[2]);
      if (parsedDate && !isValidISODate(parsedDate)) {
        logToSheet(sheetName, 'WARN', 'Skipping row ' + (i + 2) + ' (' + trimVal(row[1]) + '): invalid date "' + row[2] + '"');
        skipped++;
        continue;
      }
      rows.push({
        'Canadian/American': trimVal(row[0]),
        'Agent Name': trimVal(row[1]),
        'Termination Date': parsedDate,
        'Fired/Quit': trimVal(row[3]),
        'Reason for Termination': trimVal(row[4]),
        'Campaign': trimVal(row[5])
      });
    }
    if (skipped > 0) logToSheet(sheetName, 'WARN', 'Skipped ' + skipped + ' rows with invalid dates.');
    atomicReplaceSync(tableName, rows, sheetName);

    // Post-sync: mark terminated employees in employee_directory
    updateEmployeeDirectoryStatuses(rows, sheetName);
  } catch (err) { logToSheet(sheetName, 'ERROR', err.message); throw err; }
}

// ---------------------------------------------------------------------------
// Core Sync Engine — Zero-Downtime Atomic Replace
// ---------------------------------------------------------------------------

/**
 * Atomic replace sync: inserts new data BEFORE deleting old data.
 *
 * Strategy:
 * 1. Fetch all existing row IDs (old data stays visible)
 * 2. Insert all new rows in batches (table temporarily has old + new)
 * 3. Delete old rows by their IDs (only new data remains)
 *
 * This ensures the table is NEVER empty — the frontend always sees data.
 * The client-side dedup functions in hr-utils.ts handle any brief overlap.
 */
function atomicReplaceSync(tableName, newRows, logSource) {
  logToSheet(logSource, 'INFO', 'Atomic sync: ' + newRows.length + ' rows -> "' + tableName + '"');

  // Step 1: Collect all existing row IDs
  var oldIds = getAllRowIds(tableName, logSource);
  logToSheet(logSource, 'INFO', 'Found ' + oldIds.length + ' existing rows to replace.');

  // Step 2: Insert all new rows in batches
  var inserted = 0;
  for (var i = 0; i < newRows.length; i += BATCH_SIZE) {
    var batch = newRows.slice(i, i + BATCH_SIZE);
    insertRows(tableName, batch, logSource);
    inserted += batch.length;
  }

  // Step 3: Delete old rows by ID (new rows have different auto-generated IDs)
  if (oldIds.length > 0) {
    deleteRowsByIds(tableName, oldIds, logSource);
  }

  logToSheet(logSource, 'OK', 'Sync complete: +' + inserted + ' new, -' + oldIds.length + ' old in "' + tableName + '".');
}

/**
 * Fetches all row IDs from a Supabase table (paginated).
 * Returns an array of UUID strings.
 */
function getAllRowIds(tableName, logSource) {
  var config = getSupabaseConfig();
  var encodedTable = encodeURIComponent(tableName);
  var ids = [];
  var offset = 0;
  var pageSize = 1000;

  while (true) {
    var url = config.url + '/rest/v1/' + encodedTable
      + '?select=id&order=id&offset=' + offset + '&limit=' + pageSize;
    var resp = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: getSupabaseHeaders(config),
      muteHttpExceptions: true
    });

    if (resp.getResponseCode() !== 200) {
      var errText = resp.getContentText();
      logToSheet(logSource, 'ERROR', 'Failed to fetch IDs from "' + tableName + '" (HTTP ' + resp.getResponseCode() + '): ' + errText);
      throw new Error('Failed to fetch IDs from "' + tableName + '": HTTP ' + resp.getResponseCode());
    }

    var rows = JSON.parse(resp.getContentText());
    if (!rows || rows.length === 0) break;

    for (var i = 0; i < rows.length; i++) {
      ids.push(rows[i].id);
    }

    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return ids;
}

/**
 * Deletes rows by their IDs in batches using the PostgREST `in` filter.
 */
function deleteRowsByIds(tableName, ids, logSource) {
  var config = getSupabaseConfig();
  var encodedTable = encodeURIComponent(tableName);

  for (var i = 0; i < ids.length; i += DELETE_BATCH_SIZE) {
    var batch = ids.slice(i, i + DELETE_BATCH_SIZE);
    // PostgREST in filter format: ?id=in.(uuid1,uuid2,uuid3)
    var idList = '(' + batch.join(',') + ')';
    var url = config.url + '/rest/v1/' + encodedTable + '?id=in.' + idList;

    var resp = UrlFetchApp.fetch(url, {
      method: 'delete',
      headers: getSupabaseHeaders(config, { 'Prefer': 'return=minimal' }),
      muteHttpExceptions: true
    });

    var code = resp.getResponseCode();
    if (code < 200 || code >= 300) {
      logToSheet(logSource, 'WARN', 'Delete batch failed (' + code + '): ' + resp.getContentText());
    }
  }
}

/**
 * Inserts rows into a Supabase table via POST.
 */
function insertRows(tableName, rows, logSource) {
  if (!rows || rows.length === 0) return;
  var config = getSupabaseConfig();
  var encodedTable = encodeURIComponent(tableName);
  var url = config.url + '/rest/v1/' + encodedTable;
  var options = {
    method: 'post',
    headers: getSupabaseHeaders(config, { 'Prefer': 'return=minimal' }),
    payload: JSON.stringify(rows),
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    var errMsg = 'INSERT failed (' + code + '): ' + response.getContentText();
    logToSheet(logSource, 'ERROR', errMsg);
    throw new Error(errMsg);
  }
}

// ---------------------------------------------------------------------------
// Post-Sync Hooks: Employee Directory
// ---------------------------------------------------------------------------

/**
 * After Hired sync: creates employee_directory entries for new hires
 * that don't already exist. Sets basic info (name, role, status, hired_at, country).
 * Does NOT overwrite existing entries — safe for onboarding data.
 *
 * PERFORMANCE: Fetches all existing employees in ONE bulk query, checks in-memory,
 * then batch-inserts all new entries in one POST. ~2-3 API calls total instead of
 * 2 per employee (was causing 6-minute timeout with 200+ hires).
 */
function createEmployeeDirectoryEntries(hiredRows, logSource) {
  var config = getSupabaseConfig();

  // Step 1: Bulk-fetch all existing employees (id, first_name, last_name)
  var existingEmployees = getAllEmployeeDirectory(config);

  // Normalize: strip apostrophes/accents, replace hyphens with spaces for word splitting
  function normalizeName(s) {
    return (s || '').trim().toLowerCase().replace(/[''`]/g, '').replace(/[-]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Build multiple lookup keys per employee to handle middle names & hyphenated surnames
  //   "Alexus McCully" → keys: "alexus|mccully", "alexus|mccully" (lastWord same)
  //   When HR sheet says "Alexus McCully-Couture", firstName+lastWord = "alexus|couture"
  //   But we also check if existing lastName is CONTAINED in the hired lastName
  var existingExactSet = {};    // normalized firstName|fullLastName
  var existingLastWordSet = {}; // normalized firstName|lastWordOfLastName
  var existingFirstNames = {};  // normalized firstName → count (for first-name-only fallback)

  for (var e = 0; e < existingEmployees.length; e++) {
    var exFirst = normalizeName(existingEmployees[e].first_name);
    var exLast = normalizeName(existingEmployees[e].last_name);
    if (!exFirst) continue;

    existingExactSet[exFirst + '|' + exLast] = true;

    var exLastWords = exLast.split(/\s+/);
    var exLastWord = exLastWords[exLastWords.length - 1] || exLast;
    existingLastWordSet[exFirst + '|' + exLastWord] = true;

    // Also index by first word of last name (handles "McCully" matching "McCully-Couture")
    if (exLastWords.length > 0) {
      existingLastWordSet[exFirst + '|' + exLastWords[0]] = true;
    }

    existingFirstNames[exFirst] = (existingFirstNames[exFirst] || 0) + 1;
  }

  // Step 2: Filter to only new hires not already in directory
  var newEntries = [];
  var alreadyExists = 0;

  for (var i = 0; i < hiredRows.length; i++) {
    var agentName = hiredRows[i]['Agent Name'];
    var hireDate = hiredRows[i]['Hire Date'];
    var location = hiredRows[i]['Canadian/American'];
    if (!agentName) continue;

    var parts = agentName.trim().split(/\s+/);
    if (parts.length < 2) {
      logToSheet(logSource, 'WARN', 'Cannot split name: "' + agentName + '". Skipping directory entry.');
      continue;
    }
    var firstName = parts[0];
    var lastName = parts.slice(1).join(' ');
    var normFirst = normalizeName(firstName);
    var normLast = normalizeName(lastName);
    var normLastWords = normLast.split(/\s+/);
    var normLastWord = normLastWords[normLastWords.length - 1] || normLast;
    var normLastFirstWord = normLastWords[0] || normLast;

    // Match strategy (in order):
    //   1. Exact normalized firstName|fullLastName
    //   2. firstName + last word of lastName (handles middle names: "Angel Francis Wright" → "angel|wright")
    //   3. firstName + first word of lastName (handles hyphenated: "McCully-Couture" first word = "mccully")
    var matched = existingExactSet[normFirst + '|' + normLast]
      || existingLastWordSet[normFirst + '|' + normLastWord]
      || existingLastWordSet[normFirst + '|' + normLastFirstWord];

    if (matched) {
      alreadyExists++;
      continue;
    }

    // Mark as seen so we don't create duplicates within the same batch
    existingExactSet[normFirst + '|' + normLast] = true;
    existingLastWordSet[normFirst + '|' + normLastWord] = true;
    existingLastWordSet[normFirst + '|' + normLastFirstWord] = true;

    var newEmployee = {
      'first_name': firstName,
      'last_name': lastName,
      'role': 'Agent',
      'employee_status': 'Pending'
    };
    if (hireDate) {
      newEmployee['hired_at'] = hireDate + 'T00:00:00Z';
    }
    if (location) {
      var loc = location.toLowerCase();
      var country = loc.indexOf('canad') >= 0 ? 'Canada' :
                    loc.indexOf('americ') >= 0 ? 'USA' : location;
      newEmployee['country'] = country;
    }

    newEntries.push(newEmployee);
  }

  // Step 3: Batch-insert all new entries in one POST
  var created = 0;
  var errors = 0;
  if (newEntries.length > 0) {
    var encodedTable = encodeURIComponent('employee_directory');
    for (var b = 0; b < newEntries.length; b += BATCH_SIZE) {
      var batch = newEntries.slice(b, b + BATCH_SIZE);
      try {
        var insertResp = UrlFetchApp.fetch(config.url + '/rest/v1/' + encodedTable, {
          method: 'post',
          headers: getSupabaseHeaders(config, { 'Prefer': 'return=minimal' }),
          payload: JSON.stringify(batch),
          muteHttpExceptions: true
        });
        var insertCode = insertResp.getResponseCode();
        if (insertCode >= 200 && insertCode < 300) {
          created += batch.length;
        } else {
          logToSheet(logSource, 'WARN', 'Batch insert failed (' + insertCode + '): ' + insertResp.getContentText());
          errors += batch.length;
        }
      } catch (err) {
        logToSheet(logSource, 'ERROR', 'Batch insert error: ' + err.message);
        errors += batch.length;
      }
    }
  }

  logToSheet(logSource, 'OK',
    'Employee directory: ' + created + ' new entries, ' +
    alreadyExists + ' already exist, ' + errors + ' errors.');
}

/**
 * After Terminated sync: sets employee_status='Terminated' and terminated_at
 * for every agent found in the Terminated sheet.
 * Matches by splitting "Agent Name" into first/last and doing case-insensitive lookup.
 *
 * PERFORMANCE: Fetches all existing employees in ONE bulk query, checks in-memory,
 * then uses fetchAll() for concurrent PATCH updates. ~2-10 API calls total instead of
 * 2 per terminated employee (was causing 6-minute timeout with 120+ terminated).
 */
function updateEmployeeDirectoryStatuses(terminatedRows, logSource) {
  var config = getSupabaseConfig();

  // Step 1: Bulk-fetch all existing employees
  var existingEmployees = getAllEmployeeDirectory(config);
  var employeeMap = {};
  for (var e = 0; e < existingEmployees.length; e++) {
    var emp = existingEmployees[e];
    var key = (emp.first_name || '').trim().toLowerCase()
      + '|' + (emp.last_name || '').trim().toLowerCase();
    employeeMap[key] = { id: emp.id, employee_status: emp.employee_status };
  }

  // Step 2: Identify employees that need updating
  var toUpdate = [];
  var notFound = 0;
  var alreadyTerminated = 0;

  for (var i = 0; i < terminatedRows.length; i++) {
    var agentName = terminatedRows[i]['Agent Name'];
    var termDate = terminatedRows[i]['Termination Date'];
    if (!agentName) continue;

    var parts = agentName.trim().split(/\s+/);
    if (parts.length < 2) {
      logToSheet(logSource, 'WARN', 'Cannot split name: "' + agentName + '". Skipping directory update.');
      continue;
    }
    var firstName = parts[0];
    var lastName = parts.slice(1).join(' ');
    var lookupKey = firstName.toLowerCase() + '|' + lastName.toLowerCase();

    var match = employeeMap[lookupKey];
    if (!match) {
      notFound++;
      continue;
    }

    if (match.employee_status === 'Terminated') {
      alreadyTerminated++;
      continue;
    }

    var updateBody = { 'employee_status': 'Terminated' };
    if (termDate) {
      updateBody['terminated_at'] = termDate + 'T00:00:00Z';
    }

    toUpdate.push({ id: match.id, agentName: agentName, body: updateBody });
  }

  // Step 3: Batch PATCH using fetchAll for concurrency
  var updated = 0;
  var errors = 0;
  if (toUpdate.length > 0) {
    var encodedTable = encodeURIComponent('employee_directory');
    var requests = [];
    for (var u = 0; u < toUpdate.length; u++) {
      requests.push({
        url: config.url + '/rest/v1/' + encodedTable + '?id=eq.' + toUpdate[u].id,
        method: 'patch',
        headers: getSupabaseHeaders(config, { 'Prefer': 'return=minimal' }),
        payload: JSON.stringify(toUpdate[u].body),
        muteHttpExceptions: true
      });
    }

    try {
      var responses = UrlFetchApp.fetchAll(requests);
      for (var r = 0; r < responses.length; r++) {
        var code = responses[r].getResponseCode();
        if (code >= 200 && code < 300) {
          updated++;
        } else {
          logToSheet(logSource, 'WARN', 'Update failed for "' + toUpdate[r].agentName + '": ' + responses[r].getContentText());
          errors++;
        }
      }
    } catch (err) {
      logToSheet(logSource, 'ERROR', 'Batch update error: ' + err.message);
      errors = toUpdate.length;
    }
  }

  logToSheet(logSource, 'OK',
    'Employee directory update: ' + updated + ' set to Terminated, ' +
    alreadyTerminated + ' already Terminated, ' +
    notFound + ' not found in directory, ' +
    errors + ' errors.');
}

/**
 * Fetches ALL employee_directory entries (id, first_name, last_name, employee_status)
 * in a single paginated bulk query. Used by post-sync hooks to avoid per-employee lookups.
 */
function getAllEmployeeDirectory(config) {
  var encodedTable = encodeURIComponent('employee_directory');
  var employees = [];
  var offset = 0;
  var pageSize = 1000;

  while (true) {
    var url = config.url + '/rest/v1/' + encodedTable
      + '?select=id,first_name,last_name,employee_status&order=id&offset=' + offset + '&limit=' + pageSize;
    var resp = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: getSupabaseHeaders(config),
      muteHttpExceptions: true
    });

    if (resp.getResponseCode() !== 200) break;
    var rows = JSON.parse(resp.getContentText());
    if (!rows || rows.length === 0) break;

    for (var i = 0; i < rows.length; i++) {
      employees.push(rows[i]);
    }

    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return employees;
}

// ---------------------------------------------------------------------------
// Supabase Config
// ---------------------------------------------------------------------------

function getSupabaseConfig() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('SUPABASE_URL');
  var key = props.getProperty('SUPABASE_KEY');
  if (!url || !key) {
    throw new Error('Supabase credentials not found. Run the setup() function first.');
  }
  return { url: url, key: key };
}

/**
 * Returns standard headers for Supabase API requests.
 * Includes a non-browser User-Agent to avoid Supabase's sb_secret_ key
 * browser detection (which rejects requests with Mozilla/5.0 User-Agent).
 */
function getSupabaseHeaders(config, extra) {
  var headers = {
    'apikey': config.key,
    'Authorization': 'Bearer ' + config.key,
    'Content-Type': 'application/json',
    'User-Agent': 'Google-Apps-Script/Supabase-Sync'
  };
  if (extra) {
    for (var k in extra) {
      headers[k] = extra[k];
    }
  }
  return headers;
}

// ---------------------------------------------------------------------------
// Sheet Data Helpers
// ---------------------------------------------------------------------------

/**
 * Gets all data rows (excluding header row 1) from a named sheet tab.
 */
function getSheetData(sheetName, useDisplayValues) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    logToSheet(sheetName, 'ERROR', 'Sheet tab "' + sheetName + '" not found.');
    return null;
  }
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol === 0) return [];
  var range = sheet.getRange(2, 1, lastRow - 1, lastCol);
  // Use getDisplayValues() for sheets with DD/MM/YYYY dates to avoid
  // locale-dependent Date object misinterpretation by Google Sheets.
  if (useDisplayValues) return range.getDisplayValues();
  return range.getValues();
}

// ---------------------------------------------------------------------------
// Date Parsing
// ---------------------------------------------------------------------------

/**
 * Parses "D Mon YYYY" / "DD Mon YYYY" (e.g. "5 Jan 2026") -> "YYYY-MM-DD".
 * Also handles Date objects from Sheets.
 */
function parseDateDDMonYYYY(val) {
  if (!val) return null;
  if (val instanceof Date) return formatDateISO(val);
  var str = String(val).trim();
  if (str === '') return null;
  var months = {
    'jan':'01','feb':'02','mar':'03','apr':'04','may':'05','jun':'06',
    'jul':'07','aug':'08','sep':'09','oct':'10','nov':'11','dec':'12'
  };
  var match = str.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (match) {
    var day = padZero(parseInt(match[1], 10));
    var monKey = match[2].substring(0, 3).toLowerCase();
    var month = months[monKey];
    if (month) return match[3] + '-' + month + '-' + day;
  }
  var d = new Date(str);
  if (!isNaN(d.getTime())) return formatDateISO(d);
  return str;
}

/**
 * Parses "DD/MM/YYYY" -> "YYYY-MM-DD".
 * Also handles Date objects from Sheets.
 */
function parseDateDDMMYYYY(val) {
  if (!val) return null;
  // Convert Date objects to DD/MM/YYYY string so we can re-parse correctly.
  // Google Sheets may misinterpret DD/MM as MM/DD based on spreadsheet locale,
  // so we cannot trust the Date object directly.
  var str;
  if (val instanceof Date) {
    // Format as DD/MM/YYYY to re-parse below (getDate=day, getMonth=month from Sheets locale)
    // Since we can't trust Sheets' interpretation, use getDisplayValues() in callers instead.
    // Fallback: if we still receive a Date, extract ISO directly.
    return formatDateISO(val);
  }
  str = String(val).trim();
  if (str === '') return null;
  // Normalize double slashes (e.g. "20/01//2026" -> "20/01/2026")
  str = str.replace(/\/\//g, '/');
  var match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    var day = padZero(parseInt(match[1], 10));
    var month = padZero(parseInt(match[2], 10));
    return match[3] + '-' + month + '-' + day;
  }
  var d = new Date(str);
  if (!isNaN(d.getTime())) return formatDateISO(d);
  return str;
}

function formatDateISO(d) {
  return d.getFullYear() + '-' + padZero(d.getMonth() + 1) + '-' + padZero(d.getDate());
}

/**
 * Validates that a string is a proper ISO date (YYYY-MM-DD).
 */
function isValidISODate(str) {
  if (!str) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(String(str));
}

function padZero(n) {
  return n < 10 ? '0' + n : String(n);
}

// ---------------------------------------------------------------------------
// Value Helpers
// ---------------------------------------------------------------------------

function parseBoolean(val, defaultVal) {
  if (val === undefined || val === null || val === '') return defaultVal;
  if (typeof val === 'boolean') return val;
  var str = String(val).trim().toLowerCase();
  if (str === 'true' || str === 'yes' || str === '1') return true;
  if (str === 'false' || str === 'no' || str === '0') return false;
  return defaultVal;
}

function trimVal(val) {
  if (val === undefined || val === null) return '';
  return String(val).trim();
}

function isBlank(val) {
  return val === undefined || val === null || String(val).trim() === '';
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

/**
 * Logs to a "Sync Log" sheet tab (auto-created). Newest entries at top.
 * Keeps max 500 entries to prevent unbounded growth.
 */
function logToSheet(source, level, message) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var logSheet = ss.getSheetByName('Sync Log');
    if (!logSheet) {
      logSheet = ss.insertSheet('Sync Log');
      logSheet.getRange(1, 1, 1, 4).setValues([['Timestamp', 'Source', 'Level', 'Message']]);
      logSheet.getRange(1, 1, 1, 4).setFontWeight('bold');
      logSheet.setColumnWidth(1, 180);
      logSheet.setColumnWidth(2, 150);
      logSheet.setColumnWidth(3, 60);
      logSheet.setColumnWidth(4, 500);
    }
    logSheet.insertRowAfter(1);
    logSheet.getRange(2, 1, 1, 4).setValues([
      [new Date().toLocaleString(), source, level, message]
    ]);
    var maxRows = 501;
    var totalRows = logSheet.getLastRow();
    if (totalRows > maxRows) {
      logSheet.deleteRows(maxRows + 1, totalRows - maxRows);
    }
  } catch (e) {
    Logger.log('[' + level + '] ' + source + ': ' + message);
    Logger.log('Logging error: ' + e.message);
  }
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

/**
 * Adds a custom menu to the spreadsheet for manual sync operations.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Supabase Sync')
    .addItem('Sync All Sheets', 'syncAll')
    .addSeparator()
    .addItem('Sync Agent Schedule', 'syncAgentSchedule')
    .addItem('Sync Booked Days Off', 'syncBookedDaysOff')
    .addItem('Sync Non Booked Days Off', 'syncNonBookedDaysOff')
    .addItem('Sync Hired', 'syncHired')
    .addItem('Sync Terminated', 'syncTerminated')
    .addItem('Sync Break Schedule', 'syncAgentBreakSchedule')
    .addItem('Sync Attendance Watch List', 'syncAgentAttendanceWatchList')
    .addSeparator()
    .addItem('Setup Supabase Key', 'setup')
    .addItem('Verify API Key', 'verifyApiKey')
    .addItem('Reset All Hashes (force re-sync)', 'resetAllHashes')
    .addItem('Install Triggers', 'installTriggers')
    .addItem('Remove All Triggers', 'removeAllTriggers')
    .addToUi();
}
