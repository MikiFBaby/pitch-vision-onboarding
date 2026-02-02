// ============================================
// HR Sheets → Supabase COMPREHENSIVE Real-Time Sync
// Version 2.0 - With Installable Triggers
// ============================================
// 
// INSTALLATION INSTRUCTIONS:
// 1. Open the HR Google Sheet
// 2. Go to Extensions → Apps Script
// 3. Delete any existing code in Code.gs
// 4. Paste this entire script
// 5. Click Save (Ctrl+S)
// 6. Run: createInstallableTriggers() from the menu (Run → createInstallableTriggers)
// 7. Approve permissions when prompted
// 8. Test by pasting data into any HR sheet
//
// ============================================

const SUPABASE_FUNCTION_URL = "https://eyrxkirpubylgkkvcrlh.supabase.co/functions/v1/sync-hr-sheets";

// Sheet name to Supabase table mapping
const SHEET_CONFIG = {
    "Hired": {
        table: "HR Hired",
        columns: ["agentName", "hireDate", "campaign", "location"],
        getRowData: (row) => ({
            agentName: row[0],
            hireDate: formatDate(row[1]),
            campaign: row[2],
            location: row[3]
        })
    },
    "Terminated": {
        table: "HR Fired",
        columns: ["location", "agentName", "terminationDate", "firedQuit", "reason", "campaign"],
        getRowData: (row) => ({
            location: row[0],
            agentName: row[1],
            terminationDate: formatDate(row[2]),
            firedQuit: row[3],
            reason: row[4],
            campaign: row[5]
        })
    },
    "Booked Days Off": {
        table: "Booked Days Off",
        columns: ["agentName", "dateOff"],
        getRowData: (row) => ({
            agentName: row[0],
            dateOff: formatDate(row[1])
        })
    },
    "Non Booked Days Off": {
        table: "Non Booked Days Off",
        columns: ["agentName", "dateOff", "reason"],
        getRowData: (row) => ({
            agentName: row[0],
            dateOff: formatDate(row[1]),
            reason: row[2] || ""
        })
    },
    "Agent Schedule": {
        table: "Agent Schedule",
        columns: ["firstName", "lastName", "shift", "dayOfWeek", "startTime", "endTime"],
        getRowData: (row) => ({
            firstName: row[0],
            lastName: row[1],
            shift: row[2],
            dayOfWeek: row[3],
            startTime: row[4],
            endTime: row[5]
        })
    },
    "Agent Break Schedule": {
        table: "Agent Break Schedule",
        columns: ["agentName", "breakTime", "breakDuration"],
        getRowData: (row) => ({
            agentName: row[0],
            breakTime: row[1],
            breakDuration: row[2]
        })
    },
    "Employee Directory": {
        table: "employee_directory",
        columns: ["firstName", "lastName", "email", "phone", "department", "startDate"],
        getRowData: (row) => ({
            firstName: row[0],
            lastName: row[1],
            email: row[2],
            phone: row[3],
            department: row[4],
            startDate: formatDate(row[5])
        })
    }
};

// ============================================
// INSTALLABLE TRIGGER SETUP
// Run this ONCE to enable paste/import detection
// ============================================

/**
 * Creates installable triggers - RUN THIS ONCE from Apps Script menu
 * This enables detection of paste, import, and all change types
 */
function createInstallableTriggers() {
    // Remove any existing triggers to avoid duplicates
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));

    // Create onChange trigger (fires on paste, import, etc.)
    ScriptApp.newTrigger("onSheetChange")
        .forSpreadsheet(SpreadsheetApp.getActive())
        .onChange()
        .create();

    // Create onEdit trigger for real-time single cell edits
    ScriptApp.newTrigger("onEditInstallable")
        .forSpreadsheet(SpreadsheetApp.getActive())
        .onEdit()
        .create();

    SpreadsheetApp.getUi().alert(
        "✅ Installable Triggers Created!\n\n" +
        "The following triggers are now active:\n" +
        "• onChange - Detects paste, import, bulk edits\n" +
        "• onEdit - Detects single cell edits\n\n" +
        "All HR sheets will now sync to Supabase automatically."
    );

    console.log("Triggers created successfully");
}

/**
 * Remove all triggers - use if you need to reset
 */
function removeAllTriggers() {
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));
    SpreadsheetApp.getUi().alert("All triggers removed.");
}

// ============================================
// TRIGGER HANDLERS
// ============================================

/**
 * Handles onChange events (paste, import, bulk edits)
 * These don't provide specific row info, so we sync the entire sheet
 */
function onSheetChange(e) {
    try {
        const changeType = e.changeType;
        console.log(`onChange triggered: ${changeType}`);

        // Only process INSERT_ROW, EDIT, or OTHER changes
        if (changeType === "INSERT_ROW" || changeType === "EDIT" || changeType === "OTHER") {
            const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
            const sheetName = sheet.getName();

            if (SHEET_CONFIG[sheetName]) {
                console.log(`Processing full sync for: ${sheetName}`);
                fullSyncSheet(sheetName);
            }
        }
    } catch (error) {
        console.error("onSheetChange error:", error);
    }
}

/**
 * Handles single-cell edits (installable version with more permissions)
 */
function onEditInstallable(e) {
    try {
        const sheet = e.source.getActiveSheet();
        const sheetName = sheet.getName();
        const row = e.range.getRow();

        // Skip header row
        if (row === 1) return;

        if (SHEET_CONFIG[sheetName]) {
            console.log(`Single edit in ${sheetName}, row ${row}`);
            syncSingleRow(sheet, sheetName, row);
        }
    } catch (error) {
        console.error("onEditInstallable error:", error);
    }
}

/**
 * Simple onEdit for backward compatibility
 */
function onEdit(e) {
    onEditInstallable(e);
}

// ============================================
// SYNC FUNCTIONS
// ============================================

/**
 * Sync a single row from any configured sheet
 */
function syncSingleRow(sheet, sheetName, row) {
    const config = SHEET_CONFIG[sheetName];
    const numColumns = config.columns.length;
    const rowData = sheet.getRange(row, 1, 1, numColumns).getValues()[0];

    const data = config.getRowData(rowData);

    // Skip empty rows (check first column which is usually the name)
    const firstValue = Object.values(data)[0];
    if (!firstValue) return;

    sendToSupabase(sheetName, "update", data);
}

/**
 * Full sync of any configured sheet
 */
function fullSyncSheet(sheetName) {
    const config = SHEET_CONFIG[sheetName];
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);

    if (!sheet) {
        console.error(`Sheet not found: ${sheetName}`);
        return;
    }

    const data = sheet.getDataRange().getValues();

    // Skip header row and map to objects
    const rows = data.slice(1)
        .map(row => config.getRowData(row))
        .filter(row => {
            const firstValue = Object.values(row)[0];
            return firstValue && String(firstValue).trim() !== "";
        });

    const payload = {
        sheet: "full_sync",
        action: "sync",
        data: {
            sheetName: sheetName,
            tableName: config.table,
            rows: rows
        }
    };

    const options = {
        method: "POST",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    };

    try {
        const response = UrlFetchApp.fetch(SUPABASE_FUNCTION_URL, options);
        const responseText = response.getContentText();
        console.log(`Full sync ${sheetName} result:`, responseText);
        return JSON.parse(responseText);
    } catch (error) {
        console.error(`Full sync ${sheetName} error:`, error);
        return { success: false, error: error.message };
    }
}

/**
 * Send data to Supabase Edge Function
 */
function sendToSupabase(sheet, action, data) {
    const config = SHEET_CONFIG[sheet];
    const payload = {
        sheet: sheet,
        tableName: config ? config.table : sheet,
        action: action,
        data: data
    };

    const options = {
        method: "POST",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    };

    try {
        const response = UrlFetchApp.fetch(SUPABASE_FUNCTION_URL, options);
        const result = JSON.parse(response.getContentText());
        console.log("Sync result:", result);
        return result;
    } catch (error) {
        console.error("Supabase sync error:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Format date to DD/MM/YYYY string (Edge Function will normalize to ISO)
 */
function formatDate(value) {
    if (!value) return "";
    if (typeof value === "string") return value;

    const date = new Date(value);
    if (isNaN(date.getTime())) return "";

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
}

// ============================================
// MANUAL FULL SYNC FUNCTIONS
// Run these from the Apps Script menu if needed
// ============================================

function fullSyncHired() {
    const result = fullSyncSheet("Hired");
    SpreadsheetApp.getUi().alert("Hired sync complete: " + JSON.stringify(result));
}

function fullSyncTerminated() {
    const result = fullSyncSheet("Terminated");
    SpreadsheetApp.getUi().alert("Terminated sync complete: " + JSON.stringify(result));
}

function fullSyncBookedDaysOff() {
    const result = fullSyncSheet("Booked Days Off");
    SpreadsheetApp.getUi().alert("Booked Days Off sync complete: " + JSON.stringify(result));
}

function fullSyncNonBookedDaysOff() {
    const result = fullSyncSheet("Non Booked Days Off");
    SpreadsheetApp.getUi().alert("Non Booked Days Off sync complete: " + JSON.stringify(result));
}

function fullSyncAgentSchedule() {
    const result = fullSyncSheet("Agent Schedule");
    SpreadsheetApp.getUi().alert("Agent Schedule sync complete: " + JSON.stringify(result));
}

function fullSyncEmployeeDirectory() {
    const result = fullSyncSheet("Employee Directory");
    SpreadsheetApp.getUi().alert("Employee Directory sync complete: " + JSON.stringify(result));
}

function fullSyncAllSheets() {
    const results = {};
    for (const sheetName of Object.keys(SHEET_CONFIG)) {
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
        if (sheet) {
            results[sheetName] = fullSyncSheet(sheetName);
        } else {
            results[sheetName] = { skipped: true, reason: "Sheet not found" };
        }
    }
    SpreadsheetApp.getUi().alert("Full sync complete!\n\n" + JSON.stringify(results, null, 2));
}

// ============================================
// MENU SETUP
// ============================================

function onOpen() {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu("🔄 Supabase Sync")
        .addItem("⚡ Setup Triggers (Run Once)", "createInstallableTriggers")
        .addSeparator()
        .addItem("📋 Full Sync: Hired", "fullSyncHired")
        .addItem("📋 Full Sync: Terminated", "fullSyncTerminated")
        .addItem("📋 Full Sync: Booked Days Off", "fullSyncBookedDaysOff")
        .addItem("📋 Full Sync: Non Booked Days Off", "fullSyncNonBookedDaysOff")
        .addItem("📋 Full Sync: Agent Schedule", "fullSyncAgentSchedule")
        .addItem("📋 Full Sync: Employee Directory", "fullSyncEmployeeDirectory")
        .addSeparator()
        .addItem("🚀 Full Sync: ALL SHEETS", "fullSyncAllSheets")
        .addSeparator()
        .addItem("❌ Remove All Triggers", "removeAllTriggers")
        .addToUi();
}
