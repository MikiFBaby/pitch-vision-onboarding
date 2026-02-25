/**
 * DialedIn Report Email → API Ingestion Script
 * ==============================================
 * Google Apps Script that monitors the reports@pitchperfectsolutions.net inbox
 * for DialedIn XLS report attachments and forwards them to the Pitch Vision
 * ETL pipeline via API webhook.
 *
 * Setup:
 *   1. Open Google Apps Script (script.google.com) under the reports@ account
 *   2. Paste this script
 *   3. Set script properties:
 *      - DIALEDIN_API_ENDPOINT: https://your-domain.vercel.app/api/dialedin/ingest
 *      - DIALEDIN_API_KEY: <matching key from .env.local DIALEDIN_INGEST_API_KEY>
 *   4. Run createTrigger() once to set up the daily 6:30 AM trigger
 *   5. Run checkForDialedInReports() manually to test
 *
 * How it works:
 *   - Searches Gmail for DialedIn emails with XLS attachments (last 24h)
 *   - Base64-encodes each XLS attachment
 *   - POSTs to the Pitch Vision /api/dialedin/ingest endpoint
 *   - Labels processed emails as "DialedIn/Processed" to avoid re-processing
 *
 * Report types handled:
 *   - AgentSummaryCampaign (AgentSummar*)
 *   - SubcampaignSummary
 *   - ProductionReport
 *   (Additional report types will be added incrementally)
 */

// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════

function getConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    API_ENDPOINT: props.getProperty('DIALEDIN_API_ENDPOINT') || 'https://pitch-vision-web.vercel.app/api/dialedin/ingest',
    API_KEY: props.getProperty('DIALEDIN_API_KEY') || '',
    // Search for DialedIn emails with XLS attachments from the last day
    SEARCH_QUERY: 'from:noreply@dialedincontactcenter.com has:attachment filename:xls newer_than:1d',
    PROCESSED_LABEL: 'DialedIn/Processed',
    MAX_THREADS: 5,
  };
}

// ═══════════════════════════════════════════════════════════
// MAIN FUNCTION — Triggered daily at 6:30 AM
// ═══════════════════════════════════════════════════════════

function checkForDialedInReports() {
  var config = getConfig();

  if (!config.API_KEY) {
    Logger.log('ERROR: DIALEDIN_API_KEY not set in Script Properties');
    return;
  }

  // Get or create the processed label
  var label = GmailApp.getUserLabelByName(config.PROCESSED_LABEL);
  if (!label) {
    label = GmailApp.createLabel(config.PROCESSED_LABEL);
    Logger.log('Created label: ' + config.PROCESSED_LABEL);
  }

  // Search for matching emails
  var threads = GmailApp.search(config.SEARCH_QUERY, 0, config.MAX_THREADS);
  Logger.log('Found ' + threads.length + ' matching threads');

  var totalProcessed = 0;
  var totalSkipped = 0;
  var errors = [];

  for (var t = 0; t < threads.length; t++) {
    var thread = threads[t];

    // Skip already-processed threads
    var threadLabels = thread.getLabels();
    var alreadyProcessed = false;
    for (var l = 0; l < threadLabels.length; l++) {
      if (threadLabels[l].getName() === config.PROCESSED_LABEL) {
        alreadyProcessed = true;
        break;
      }
    }
    if (alreadyProcessed) {
      totalSkipped++;
      continue;
    }

    var messages = thread.getMessages();
    for (var m = 0; m < messages.length; m++) {
      var message = messages[m];
      var attachments = message.getAttachments();
      var xlsAttachments = [];

      // Collect XLS attachments
      for (var a = 0; a < attachments.length; a++) {
        var attachment = attachments[a];
        var name = attachment.getName();
        if (name.match(/\.(xls|xlsx)$/i)) {
          xlsAttachments.push({
            filename: name,
            data: Utilities.base64Encode(attachment.getBytes()),
          });
        }
      }

      if (xlsAttachments.length === 0) continue;

      // Send to API
      var payload = {
        attachments: xlsAttachments,
        sender: message.getFrom(),
        receivedAt: message.getDate().toISOString(),
        subject: message.getSubject(),
      };

      try {
        var response = UrlFetchApp.fetch(config.API_ENDPOINT, {
          method: 'post',
          contentType: 'application/json',
          headers: {
            'X-API-Key': config.API_KEY,
          },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true,
        });

        var code = response.getResponseCode();
        var body = response.getContentText();

        if (code >= 200 && code < 300) {
          totalProcessed += xlsAttachments.length;
          Logger.log('SUCCESS: ' + xlsAttachments.length + ' files from "' + message.getSubject() + '" — ' + body);
        } else {
          errors.push('HTTP ' + code + ' for "' + message.getSubject() + '": ' + body);
          Logger.log('ERROR: HTTP ' + code + ' — ' + body);
        }
      } catch (e) {
        errors.push('Exception for "' + message.getSubject() + '": ' + e.message);
        Logger.log('ERROR: ' + e.message);
      }
    }

    // Mark thread as processed
    thread.addLabel(label);
  }

  // Summary
  Logger.log('=== DialedIn Ingestion Summary ===');
  Logger.log('Processed: ' + totalProcessed + ' files');
  Logger.log('Skipped: ' + totalSkipped + ' threads (already processed)');
  if (errors.length > 0) {
    Logger.log('Errors: ' + errors.length);
    for (var e = 0; e < errors.length; e++) {
      Logger.log('  - ' + errors[e]);
    }
  }
}

// ═══════════════════════════════════════════════════════════
// TRIGGER MANAGEMENT
// ═══════════════════════════════════════════════════════════

/** Run once to create the daily trigger at 6:30 AM */
function createTrigger() {
  // Delete existing triggers for this function
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'checkForDialedInReports') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Create new daily trigger
  ScriptApp.newTrigger('checkForDialedInReports')
    .timeBased()
    .atHour(6)
    .nearMinute(30)
    .everyDays(1)
    .create();

  Logger.log('Trigger created: checkForDialedInReports will run daily at ~6:30 AM');
}

/** List active triggers */
function listTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    Logger.log(triggers[i].getHandlerFunction() + ' — ' + triggers[i].getTriggerSource());
  }
}
