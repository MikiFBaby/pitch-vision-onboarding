---
created: 2026-03-12T15:27:29.860Z
title: Audit HR employee directory filter logic and multi-filter combinations
area: ui
files:
  - src/components/hr/EmployeeTable.tsx
---

## Problem

The EmployeeTable component in the HR portal has multiple filter dimensions (employee status, role, campaign, country, live SLA performance tiers, search text, etc.) that can be combined. Need to verify:

1. **Live SLA filters** — Correct thresholds, proper data joins between employee_directory and intraday/performance data, edge cases (no data = which bucket?)
2. **Campaign filters** — Multi-select behavior, employees with multiple campaigns, "no campaign" edge case
3. **Status/Role filters** — Correct filtering, interaction with other filters
4. **Multi-filter combinations** — AND vs OR logic when multiple filters active simultaneously, filter reset behavior
5. **Filter state management** — State consistency when toggling filters on/off, URL params sync (if any), filter count badges accuracy
6. **Edge cases** — Empty result sets, filter combinations that should be mutually exclusive, performance with large datasets

## Solution

1. Read and trace all filter logic in EmployeeTable.tsx (useMemo chains, filter predicates)
2. Verify live SLA filter thresholds match break-even definitions in dialedin-revenue.ts
3. Test multi-filter AND/OR semantics — ensure selecting Campaign=ACA + Status=Active correctly intersects
4. Check for stale closure bugs in filter callbacks
5. Verify filter UI reflects actual applied state (selected chips, counts)
6. Document any bugs found and fix them
