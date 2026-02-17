/**
 * ============================================================================
 * DIALEDIN EMAIL WATCHER — Gmail to Pitch Vision Ingest
 * ============================================================================
 *
 * Monitors the Gmail inbox for DialedIn report emails with .xls attachments,
 * base64-encodes them, and POSTs to the Pitch Vision ingest API endpoint.
 *
 * FEATURES:
 * - Time-based trigger (runs every 1 minute)
 * - Dedup guard via Script Properties (email message ID)
 * - Labels processed emails as "DialedIn/Processed" or "DialedIn/Failed"
 * - Supports multiple XLS attachments per email
 * - Logs all activity to a Google Sheet (optional)
 *
 * INSTALLATION INSTRUCTIONS:
 * --------------------------
 * 1. Open Google Apps Script: https://script.google.com
 * 2. Create a new project named "DialedIn Email Watcher"
 * 3. Paste this entire file into the editor
 * 4. Save the project (Ctrl+S / Cmd+S)
 * 5. Run the `setup()` function first (select it from the dropdown, click Run)
 *    - You will be prompted to authorize the script on first run
 *    - Grant Gmail + Script permissions
 * 6. After setup, run `installTrigger()` to enable the 1-minute polling
 * 7. Optionally run `processNewEmails()` once to test against existing emails
 *
 * CONFIGURATION (set via setup() or Script Properties):
 * - INGEST_URL:    https://pitchvision.io/api/dialedin/ingest
 * - INGEST_API_KEY: Your DIALEDIN_INGEST_API_KEY value from .env.local
 * - GMAIL_QUERY:   from:reports@dialedin.com subject:AgentSummary has:attachment filename:xls
 *
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Returns the stored configuration from Script Properties.
 */
function getConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    ingestUrl:   props.getProperty('INGEST_URL') || 'https://pitchvision.io/api/dialedin/ingest',
    apiKey:      props.getProperty('INGEST_API_KEY') || '',
    gmailQuery:  props.getProperty('GMAIL_QUERY') || 'from:reports@dialedin.com subject:AgentSummary has:attachment filename:xls is:unread',
    maxThreads:  parseInt(props.getProperty('MAX_THREADS') || '10', 10),
  };
}

// ---------------------------------------------------------------------------
// Setup & Triggers
// ---------------------------------------------------------------------------

/**
 * First-time setup: stores configuration in Script Properties.
 * Run this manually before installing the trigger.
 */
function setup() {
  var props = PropertiesService.getScriptProperties();

  // Set your ingest URL (production domain)
  props.setProperty('INGEST_URL', 'https://pitchvision.io/api/dialedin/ingest');

  // IMPORTANT: Replace this with your actual DIALEDIN_INGEST_API_KEY
  var apiKey = props.getProperty('INGEST_API_KEY');
  if (!apiKey) {
    props.setProperty('INGEST_API_KEY', 'REPLACE_ME_WITH_YOUR_API_KEY');
    Logger.log('⚠️  INGEST_API_KEY set to placeholder. Update it in Script Properties before running!');
  }

  // Gmail search query — targets DialedIn report emails with XLS attachments
  props.setProperty('GMAIL_QUERY', 'from:reports@dialedin.com subject:AgentSummary has:attachment filename:xls is:unread');
  props.setProperty('MAX_THREADS', '10');

  // Create Gmail labels if they don't exist
  getOrCreateLabel('DialedIn/Processed');
  getOrCreateLabel('DialedIn/Failed');

  Logger.log('✅ Setup complete. Now run installTrigger() to start the email watcher.');
  Logger.log('📌 Make sure to set INGEST_API_KEY in Script Properties!');
}

/**
 * Installs a time-based trigger that runs every 1 minute.
 * Removes any existing triggers for this function first to avoid duplicates.
 */
function installTrigger() {
  // Remove existing triggers for processNewEmails
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processNewEmails') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Install new 1-minute trigger
  ScriptApp.newTrigger('processNewEmails')
    .timeBased()
    .everyMinutes(1)
    .create();

  Logger.log('✅ Trigger installed: processNewEmails runs every 1 minute.');
}

/**
 * Removes all triggers (use to stop the watcher).
 */
function removeTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processNewEmails') {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }
  Logger.log('🛑 Removed ' + removed + ' trigger(s).');
}

// ---------------------------------------------------------------------------
// Core Processing
// ---------------------------------------------------------------------------

/**
 * Main function: searches for unread DialedIn emails with XLS attachments,
 * sends them to the ingest API, and labels them accordingly.
 */
function processNewEmails() {
  var config = getConfig();

  if (!config.apiKey || config.apiKey === 'REPLACE_ME_WITH_YOUR_API_KEY') {
    Logger.log('❌ INGEST_API_KEY not configured. Run setup() and set the key in Script Properties.');
    return;
  }

  var processedLabel = getOrCreateLabel('DialedIn/Processed');
  var failedLabel = getOrCreateLabel('DialedIn/Failed');
  var processedIds = getProcessedIds();

  // Search Gmail for matching threads
  var threads;
  try {
    threads = GmailApp.search(config.gmailQuery, 0, config.maxThreads);
  } catch (e) {
    Logger.log('❌ Gmail search failed: ' + e.message);
    return;
  }

  if (threads.length === 0) {
    return; // No new emails — silent return
  }

  Logger.log('📬 Found ' + threads.length + ' thread(s) to process');

  for (var t = 0; t < threads.length; t++) {
    var thread = threads[t];
    var messages = thread.getMessages();

    for (var m = 0; m < messages.length; m++) {
      var message = messages[m];
      var messageId = message.getId();

      // Skip already-processed messages
      if (processedIds[messageId]) {
        continue;
      }

      // Skip read messages (already processed in a previous run)
      if (!message.isUnread()) {
        continue;
      }

      var attachments = message.getAttachments();
      var xlsAttachments = [];

      for (var a = 0; a < attachments.length; a++) {
        var att = attachments[a];
        var name = att.getName();
        if (name.match(/\.xls$/i) || name.match(/\.xlsx$/i)) {
          xlsAttachments.push({
            filename: name,
            data: Utilities.base64Encode(att.getBytes()),
          });
        }
      }

      if (xlsAttachments.length === 0) {
        // No XLS attachments — skip this message
        continue;
      }

      Logger.log('📎 Processing message: ' + message.getSubject() + ' (' + xlsAttachments.length + ' XLS files)');

      // Build the payload
      var payload = {
        attachments: xlsAttachments,
        sender: message.getFrom(),
        receivedAt: message.getDate().toISOString(),
        subject: message.getSubject(),
        messageId: messageId,
      };

      // POST to the ingest API
      var success = sendToIngestApi(config, payload);

      if (success) {
        // Mark as processed
        message.markRead();
        thread.addLabel(processedLabel);
        markAsProcessed(messageId);
        Logger.log('✅ Successfully ingested: ' + message.getSubject());
      } else {
        // Mark as failed
        thread.addLabel(failedLabel);
        Logger.log('❌ Failed to ingest: ' + message.getSubject());
      }
    }
  }
}

// ---------------------------------------------------------------------------
// API Communication
// ---------------------------------------------------------------------------

/**
 * Sends the payload to the Pitch Vision ingest API.
 * Returns true on success, false on failure.
 */
function sendToIngestApi(config, payload) {
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'X-API-Key': config.apiKey,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  try {
    var response = UrlFetchApp.fetch(config.ingestUrl, options);
    var code = response.getResponseCode();
    var body = response.getContentText();

    if (code >= 200 && code < 300) {
      var json = JSON.parse(body);
      Logger.log('  → API response: ' + json.processed + ' processed, computed=' + json.computed);
      if (json.checklist) {
        Logger.log('  → Checklist: ' + json.checklist.received + '/' + json.checklist.total +
                    (json.checklist.complete ? ' ✅ COMPLETE' : ' ⏳ ' + json.checklist.missing.join(', ')));
      }
      return true;
    } else {
      Logger.log('  → API error (' + code + '): ' + body);
      return false;
    }
  } catch (e) {
    Logger.log('  → Fetch error: ' + e.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Dedup: Processed Message ID Tracking
// ---------------------------------------------------------------------------

/**
 * Returns a map of already-processed message IDs.
 * Uses Script Properties with a rolling window (keeps last 500 IDs to avoid hitting property size limits).
 */
function getProcessedIds() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('PROCESSED_IDS') || '';
  var ids = {};
  if (raw) {
    var arr = raw.split(',');
    for (var i = 0; i < arr.length; i++) {
      if (arr[i]) ids[arr[i]] = true;
    }
  }
  return ids;
}

/**
 * Marks a message ID as processed.
 * Keeps only the last 500 IDs to stay within Script Properties size limits.
 */
function markAsProcessed(messageId) {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('PROCESSED_IDS') || '';
  var arr = raw ? raw.split(',') : [];
  arr.push(messageId);

  // Rolling window: keep last 500
  if (arr.length > 500) {
    arr = arr.slice(arr.length - 500);
  }

  props.setProperty('PROCESSED_IDS', arr.join(','));
}

/**
 * Clears the processed ID list (useful for reprocessing).
 */
function clearProcessedIds() {
  PropertiesService.getScriptProperties().deleteProperty('PROCESSED_IDS');
  Logger.log('🗑️ Processed IDs cleared. Next run will reprocess unread emails.');
}

// ---------------------------------------------------------------------------
// Gmail Label Helpers
// ---------------------------------------------------------------------------

/**
 * Gets an existing Gmail label or creates it if it doesn't exist.
 */
function getOrCreateLabel(name) {
  var label = GmailApp.getUserLabelByName(name);
  if (!label) {
    label = GmailApp.createLabel(name);
    Logger.log('📁 Created Gmail label: ' + name);
  }
  return label;
}

// ---------------------------------------------------------------------------
// Manual / Debug Functions
// ---------------------------------------------------------------------------

/**
 * Manual test: processes a single specific email thread by subject.
 * Useful for testing without waiting for the trigger.
 */
function testProcessSingleEmail() {
  var threads = GmailApp.search('from:reports@dialedin.com subject:AgentSummary has:attachment filename:xls', 0, 1);
  if (threads.length === 0) {
    Logger.log('No matching emails found.');
    return;
  }

  var message = threads[0].getMessages()[0];
  Logger.log('Test email: ' + message.getSubject());
  Logger.log('  From: ' + message.getFrom());
  Logger.log('  Date: ' + message.getDate());

  var attachments = message.getAttachments();
  for (var i = 0; i < attachments.length; i++) {
    Logger.log('  Attachment: ' + attachments[i].getName() + ' (' + attachments[i].getBytes().length + ' bytes)');
  }
}

/**
 * Shows current configuration and stats.
 */
function showStatus() {
  var config = getConfig();
  var processedIds = getProcessedIds();
  var processedCount = Object.keys(processedIds).length;

  Logger.log('=== DialedIn Email Watcher Status ===');
  Logger.log('Ingest URL:      ' + config.ingestUrl);
  Logger.log('API Key:         ' + (config.apiKey ? config.apiKey.substring(0, 8) + '...' : 'NOT SET'));
  Logger.log('Gmail Query:     ' + config.gmailQuery);
  Logger.log('Max Threads:     ' + config.maxThreads);
  Logger.log('Processed IDs:   ' + processedCount);

  var triggers = ScriptApp.getProjectTriggers();
  var active = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processNewEmails') active++;
  }
  Logger.log('Active Triggers: ' + active);
}
