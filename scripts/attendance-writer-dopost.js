/**
 * Google Apps Script — Attendance Writer (doPost)
 *
 * Receives attendance events from the Pitch Vision Slack bot
 * and appends them to the appropriate sheet tabs.
 *
 * STANDALONE PROJECT SETUP:
 * 1. Go to script.google.com → New project
 * 2. Paste this code, replacing default content
 * 3. Set SPREADSHEET_ID below to your HR Tracker spreadsheet ID
 * 4. Run setupWebhookSecret() to store the shared secret
 * 5. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6. Copy the deployment URL → set as GOOGLE_SHEETS_WEBHOOK_URL in .env.local
 * 7. Set the same secret as ATTENDANCE_WEBHOOK_SECRET in .env.local
 *
 * ACTIONS:
 * - "add" (default): Appends attendance rows to the appropriate sheet tab
 * - "delete": Removes specific rows (for undo functionality)
 *
 * SAFETY:
 * - Only appends rows (add) or removes specific matched rows (delete)
 * - Never modifies existing data structure, formulas, or formatting
 * - Uses LockService to prevent concurrent writes
 */

// ============================================================================
// CONFIGURATION — Set your spreadsheet ID here
// ============================================================================

var SPREADSHEET_ID = '1kHR-j7RsxiyUyL952It1vCEDaTyYxtnsEOSKsRZv7kg';

// ============================================================================
// SETUP
// ============================================================================

/**
 * Run this once to store the webhook secret.
 * After running, check the Execution log to confirm it was saved.
 */
function setupWebhookSecret() {
  // Set the secret directly here, then run this function once:
  var secret = 'e1341b54a3ab6398676fe36e504f22ac4f740caf60033061';
  PropertiesService.getScriptProperties().setProperty('ATTENDANCE_WEBHOOK_SECRET', secret);
  Logger.log('Webhook secret saved successfully!');
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return jsonResponse({ success: false, error: 'Lock timeout — another write is in progress' });
  }

  try {
    var payload = JSON.parse(e.postData.contents);

    // Verify shared secret
    var secret = PropertiesService.getScriptProperties().getProperty('ATTENDANCE_WEBHOOK_SECRET');
    if (secret && payload.secret !== secret) {
      return jsonResponse({ success: false, error: 'Unauthorized' });
    }

    var events = payload.events || [];
    if (events.length === 0) {
      return jsonResponse({ success: true, planned_added: 0, unplanned_added: 0 });
    }

    var action = payload.action || 'add';

    if (action === 'add') {
      return handleAdd(events);
    } else if (action === 'delete') {
      return handleDelete(events);
    } else {
      return jsonResponse({ success: false, error: 'Unknown action: ' + action });
    }
  } catch (err) {
    Logger.log('doPost error: ' + err.message);
    return jsonResponse({ success: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}

// ============================================================================
// ADD ACTION — Append rows to sheets
// ============================================================================

function handleAdd(events) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var plannedCount = 0;
  var unplannedCount = 0;

  for (var i = 0; i < events.length; i++) {
    var evt = events[i];
    var dateStr = formatDateForSheet(evt.date);

    if (evt.event_type === 'planned') {
      // Append to "Booked Days Off" tab
      var bdSheet = ss.getSheetByName('Booked Days Off ') || ss.getSheetByName('Booked Days Off');
      if (bdSheet) {
        bdSheet.appendRow([
          evt.agent_name,                     // Agent Name (col A)
          dateStr                             // Date (col B)
        ]);
        plannedCount++;
      } else {
        Logger.log('WARNING: "Booked Days Off" sheet not found');
      }

    } else {
      // unplanned (including legacy no_show) → "Non Booked Days Off" tab
      var nbSheet = ss.getSheetByName('Non Booked Days Off ') || ss.getSheetByName('Non Booked Days Off');
      if (nbSheet) {
        var dateWithTime = dateStr + ' ' + formatCurrentTime();
        nbSheet.appendRow([
          evt.agent_name,                     // Agent Name (col A)
          evt.reason || 'Unplanned absence',  // Reason (col B)
          dateWithTime,                       // Date (col C) — "D Mon YYYY H:MM AM/PM"
          evt.reported_by_name || ''          // Reported By (col D)
        ]);
        unplannedCount++;
      } else {
        Logger.log('WARNING: "Non Booked Days Off" sheet not found');
      }
    }
  }

  Logger.log('Added: ' + plannedCount + ' planned, ' + unplannedCount + ' unplanned');
  return jsonResponse({
    success: true,
    planned_added: plannedCount,
    unplanned_added: unplannedCount,
  });
}

// ============================================================================
// DELETE ACTION — Remove specific rows (for undo)
// ============================================================================

function handleDelete(events) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var deletedCount = 0;

  for (var i = 0; i < events.length; i++) {
    var evt = events[i];
    var dateStr = formatDateForSheet(evt.date);

    if (evt.event_type === 'planned') {
      // Delete from "Booked Days Off" tab (date in col B = index 1)
      var bdSheet = ss.getSheetByName('Booked Days Off ') || ss.getSheetByName('Booked Days Off');
      if (bdSheet) {
        if (deleteMatchingRow(bdSheet, evt.agent_name, dateStr, 1)) deletedCount++;
      }

    } else {
      // unplanned (including legacy no_show) → "Non Booked Days Off" tab (date in col C = index 2)
      var nbSheet = ss.getSheetByName('Non Booked Days Off ') || ss.getSheetByName('Non Booked Days Off');
      if (nbSheet) {
        if (deleteMatchingRow(nbSheet, evt.agent_name, dateStr, 2)) deletedCount++;
      }
      // Legacy "Attendance Events" sheet fallback removed — fully migrated to two-table model
    }
  }

  Logger.log('Deleted: ' + deletedCount + ' rows');
  return jsonResponse({
    success: true,
    planned_added: 0,
    unplanned_added: 0,
    rows_deleted: deletedCount
  });
}

/**
 * Finds and deletes the LAST matching row (most recently added).
 * Matches by agent name (col A, case-insensitive) and date (starts-with match to handle timestamps).
 * @param {Sheet} sheet - The sheet to search
 * @param {string} agentName - Agent name to match
 * @param {string} dateStr - Date string to match (e.g. "26 Feb 2026")
 * @param {number} dateColIndex - Column index for the date (1 for Booked, 2 for Non Booked)
 */
function deleteMatchingRow(sheet, agentName, dateStr, dateColIndex) {
  var data = sheet.getDataRange().getValues();
  var targetName = agentName.trim().toLowerCase();

  // Search from bottom up to find the most recently added match
  for (var row = data.length - 1; row >= 1; row--) { // Skip header row (row 0)
    var rowName = String(data[row][0] || '').trim().toLowerCase();
    var rowDate = String(data[row][dateColIndex] || '').trim();

    // Starts-with match: "26 Feb 2026 9:33 AM" matches target "26 Feb 2026"
    if (rowName === targetName && rowDate.indexOf(dateStr) === 0) {
      sheet.deleteRow(row + 1);
      return true;
    }
  }

  return false;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Returns current time as "H:MM AM/PM" (e.g. "9:33 AM", "2:15 PM").
 */
function formatCurrentTime() {
  var now = new Date();
  var hours = now.getHours();
  var minutes = now.getMinutes();
  var ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return hours + ':' + (minutes < 10 ? '0' + minutes : minutes) + ' ' + ampm;
}

/**
 * Converts ISO date "2026-02-13" to sheet format "13 Feb 2026" (D Mon YYYY).
 * Matches the existing date format used in "Non Booked Days Off" and "Booked Days Off".
 */
function formatDateForSheet(isoDate) {
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var parts = isoDate.split('-');
  var day = parseInt(parts[2], 10);
  var month = months[parseInt(parts[1], 10) - 1];
  var year = parts[0];
  return day + ' ' + month + ' ' + year;
}


/**
 * Creates a JSON response for the web app.
 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
