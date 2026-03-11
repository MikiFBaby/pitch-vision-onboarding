---
created: 2026-03-11T22:41:05.184Z
title: Add bulk Slack messaging with PDF/CSV attachments to HR portal
area: ui
files:
  - src/components/hr/EmployeeTable.tsx
  - src/components/hr/EmployeeProfileDrawer.tsx
  - src/app/api/slack/send-dm/route.ts
  - src/utils/slack-helpers.ts
---

## Problem

HR staff can only send Slack messages about a single employee at a time, from within the EmployeeProfileDrawer. There is no way to:

1. **Select multiple employees** from the directory table and compose a bulk message about them
2. **Attach a PDF or CSV report** summarizing the selected employees (performance, attendance, compliance data)
3. **Send to multiple recipients** (managers, leadership, custom) in a single compose flow from the table-level bulk action bar

The existing Slack integration (`/api/slack/send-dm`) only supports plain text + optional Agent Snapshot card. No file upload capability exists (`files.uploadV2` not wired up). The EmployeeTable has multi-select with bulk terminate/remove actions but no messaging action.

## Solution

### Sub-feature 1: Bulk Message Compose Modal
- Add "Message" button to EmployeeTable's bulk action bar (alongside existing Terminate/Remove)
- New `BulkMessageModal` component with:
  - List of selected employees (chips, removable)
  - Multi-recipient picker (reuse leadership contacts + campaign manager logic from drawer)
  - Message templates adapted for bulk context ("Re: 5 agents on ACA team...")
  - Textarea for custom message
  - Toggle: "Include Agent Snapshot cards" (one per employee)

### Sub-feature 2: Auto-generate PDF/CSV Report
- Generate a summary report of selected employees' data on demand
  - CSV: tabular export (name, campaign, status, TPH, compliance score, attendance)
  - PDF: formatted report card using existing performance data (jsPDF or server-side)
- Checkbox in compose modal: "Attach employee report (PDF / CSV)"
- Format selector dropdown

### Sub-feature 3: Slack File Upload Integration
- Add `uploadSlackFile()` to `src/utils/slack-helpers.ts` using Slack `files.uploadV2` API
- Update `/api/slack/send-dm` (or new `/api/slack/send-bulk`) to accept file buffer + filename
- Post message first, then upload file to the same DM channel thread
- Audit trail: record attachment metadata in `employee_write_ups`
