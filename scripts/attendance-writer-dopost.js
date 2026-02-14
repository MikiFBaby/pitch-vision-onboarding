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
      return jsonResponse({ success: true, absences_added: 0, attendance_events_added: 0 });
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
  var absenceCount = 0;
  var attendanceCount = 0;

  for (var i = 0; i < events.length; i++) {
    var evt = events[i];

    if (evt.event_type === 'absent') {
      // Append to "Non Booked Days Off " tab (note: trailing space in tab name)
      var nbSheet = ss.getSheetByName('Non Booked Days Off ') || ss.getSheetByName('Non Booked Days Off');
      if (nbSheet) {
        nbSheet.appendRow([
          evt.agent_name,                       // Agent Name (col A)
          evt.reason || 'Unplanned absence',    // Reason (col B)
          formatDateForSheet(evt.date)           // Date (col C) — "D Mon YYYY"
        ]);
        absenceCount++;
      } else {
        Logger.log('WARNING: "Non Booked Days Off" sheet not found');
      }
    } else {
      // late, early_leave, no_show → Append to "Attendance Events" tab
      var aeSheet = getOrCreateAttendanceEventsSheet(ss);
      aeSheet.appendRow([
        evt.agent_name,                         // Agent Name (col A)
        evt.event_type,                         // Event Type (col B)
        formatDateForSheet(evt.date),           // Date (col C)
        evt.minutes || '',                      // Minutes (col D)
        evt.reason || '',                       // Reason (col E)
        evt.reported_by_name || '',             // Reported By Name (col F)
        formatTimestamp(evt.reported_at),        // Reported At (col G)
        formatTimestamp(evt.confirmed_at)        // Confirmed At (col H)
      ]);
      attendanceCount++;
    }
  }

  Logger.log('Added: ' + absenceCount + ' absences, ' + attendanceCount + ' attendance events');
  return jsonResponse({
    success: true,
    absences_added: absenceCount,
    attendance_events_added: attendanceCount
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

    if (evt.event_type === 'absent') {
      var nbSheet = ss.getSheetByName('Non Booked Days Off ') || ss.getSheetByName('Non Booked Days Off');
      if (nbSheet) {
        var deleted = deleteMatchingRow(nbSheet, evt.agent_name, dateStr, null);
        if (deleted) deletedCount++;
      }
    } else {
      var aeSheet = ss.getSheetByName('Attendance Events');
      if (aeSheet) {
        var deleted = deleteMatchingRow(aeSheet, evt.agent_name, dateStr, evt.event_type);
        if (deleted) deletedCount++;
      }
    }
  }

  Logger.log('Deleted: ' + deletedCount + ' rows');
  return jsonResponse({
    success: true,
    absences_added: 0,
    attendance_events_added: 0,
    rows_deleted: deletedCount
  });
}

/**
 * Finds and deletes the LAST matching row (most recently added).
 * Matches by agent name (col A, case-insensitive), date (col C), and optionally event type (col B).
 */
function deleteMatchingRow(sheet, agentName, dateStr, eventType) {
  var data = sheet.getDataRange().getValues();
  var targetName = agentName.trim().toLowerCase();

  // Search from bottom up to find the most recently added match
  for (var row = data.length - 1; row >= 1; row--) { // Skip header row (row 0)
    var rowName = String(data[row][0] || '').trim().toLowerCase();
    var rowDate = String(data[row][2] || '').trim();

    if (rowName === targetName && rowDate === dateStr) {
      // If event type check is needed (for Attendance Events sheet)
      if (eventType) {
        var rowType = String(data[row][1] || '').trim().toLowerCase();
        if (rowType !== eventType.toLowerCase()) continue;
      }

      // Delete the row (sheet rows are 1-indexed, data is 0-indexed, +1 for header)
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
 * Gets or creates the "Attendance Events" sheet with headers.
 */
function getOrCreateAttendanceEventsSheet(ss) {
  var sheet = ss.getSheetByName('Attendance Events');
  if (!sheet) {
    sheet = ss.insertSheet('Attendance Events');
    sheet.getRange(1, 1, 1, 8).setValues([[
      'Agent Name', 'Event Type', 'Date', 'Minutes', 'Reason', 'Reported By', 'Reported At', 'Confirmed At'
    ]]);
    sheet.getRange(1, 1, 1, 8).setFontWeight('bold');
    Logger.log('Created "Attendance Events" sheet with headers');
  }
  return sheet;
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
 * Converts ISO timestamp to readable format "Feb 13, 2026 4:05 PM".
 */
function formatTimestamp(isoTimestamp) {
  if (!isoTimestamp) return '';
  try {
    var date = new Date(isoTimestamp);
    return Utilities.formatDate(date, Session.getScriptTimeZone(), 'MMM d, yyyy h:mm a');
  } catch (e) {
    return isoTimestamp;
  }
}

/**
 * Creates a JSON response for the web app.
 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
