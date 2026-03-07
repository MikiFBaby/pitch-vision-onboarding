/**
 * DecisionHR Bulk Employee Onboarding Import — xlsx generation.
 *
 * Produces an xlsx matching DecisionHR's template structure:
 *   Row 1: Group headers (merged cells)
 *   Row 2: Column headers (46 columns A-AT)
 *   Row 3+: Employee data
 *
 * Uses the `xlsx` library (already installed v0.18.5).
 */

import * as XLSX from 'xlsx';
import {
  type DecisionHRPayload,
  COLUMN_HEADERS,
  GROUP_HEADERS,
  payloadToRow,
} from '@/lib/decisionhr-config';

/**
 * Generate a DecisionHR Bulk EE Import xlsx workbook as a Buffer.
 * The workbook has a single sheet "Employee Data" with:
 *   Row 1: group headers (merged)
 *   Row 2: column headers
 *   Row 3: employee data
 */
export function generateDecisionHRWorkbook(payload: DecisionHRPayload): Buffer {
  const wb = XLSX.utils.book_new();

  // Build the sheet data
  const sheetData: (string | null)[][] = [];

  // Row 1: group headers — fill with nulls, place label at startCol
  const groupRow: (string | null)[] = new Array(46).fill(null);
  for (const g of GROUP_HEADERS) {
    groupRow[g.startCol] = g.label;
  }
  sheetData.push(groupRow);

  // Row 2: column headers
  sheetData.push(COLUMN_HEADERS);

  // Row 3: employee data
  sheetData.push(payloadToRow(payload));

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Merge cells for group headers in Row 1
  ws['!merges'] = GROUP_HEADERS.map(g => ({
    s: { r: 0, c: g.startCol },
    e: { r: 0, c: g.endCol },
  }));

  // Set column widths
  ws['!cols'] = COLUMN_HEADERS.map(h => ({
    wch: Math.max(h.length + 2, 16),
  }));

  XLSX.utils.book_append_sheet(wb, ws, 'Employee Data');

  // Write to buffer
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buf);
}

/**
 * Generate xlsx for multiple employees (batch import).
 * Each payload becomes a row after the headers.
 */
export function generateDecisionHRBatchWorkbook(payloads: DecisionHRPayload[]): Buffer {
  const wb = XLSX.utils.book_new();

  const sheetData: (string | null)[][] = [];

  // Row 1: group headers
  const groupRow: (string | null)[] = new Array(46).fill(null);
  for (const g of GROUP_HEADERS) {
    groupRow[g.startCol] = g.label;
  }
  sheetData.push(groupRow);

  // Row 2: column headers
  sheetData.push(COLUMN_HEADERS);

  // Row 3+: employee data
  for (const p of payloads) {
    sheetData.push(payloadToRow(p));
  }

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  ws['!merges'] = GROUP_HEADERS.map(g => ({
    s: { r: 0, c: g.startCol },
    e: { r: 0, c: g.endCol },
  }));

  ws['!cols'] = COLUMN_HEADERS.map(h => ({
    wch: Math.max(h.length + 2, 16),
  }));

  XLSX.utils.book_append_sheet(wb, ws, 'Employee Data');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buf);
}
