// ---------------------------------------------------------------------------
// DecisionHR payroll integration configuration
// Used by: push API route, xlsx generation, OnboardingPortal
// ---------------------------------------------------------------------------

/** Checklist item ID for Photo ID (triggers OCR on upload) */
export const PHOTO_ID_ITEM_ID = '2c3161b2-81a9-467c-bc01-2f0ac5838175';

/** SSN checklist item ID (value stored in onboarding_progress.notes) */
export const SSN_ITEM_ID = '8a2fcd14-1595-4421-bb4d-ab50135163dc';

/** Payroll USA checklist item ID (marked complete after push) */
export const PAYROLL_USA_ITEM_ID = 'c0a80121-0002-4000-8000-000000000005';

// ---------------------------------------------------------------------------
// Work Comp Codes — 33 states mapped from DecisionHR SysOptions
// ---------------------------------------------------------------------------

export const WORK_COMP_CODES: Record<string, string> = {
  AL: '8871 - AL/CLERICAL TELECOMMUTER EMPLOYEES',
  AR: '8871 - AR/CLERICAL TELECOMMUTER EMPLOYEES',
  AZ: '8871 - AZ/CLERICAL TELECOMMUTER EMPLOYEES',
  CA: '8871 - CA/CLERICAL TELECOMMUTER EMPLOYEES',
  CO: '8871 - CO/CLERICAL TELECOMMUTER EMPLOYEES',
  CT: '8871 - CT/CLERICAL TELECOMMUTER EMPLOYEES',
  FL: '8871 - FL/CLERICAL TELECOMMUTER EMPLOYEES',
  GA: '8871 - GA/CLERICAL TELECOMMUTER EMPLOYEES',
  IA: '8871 - IA/CLERICAL TELECOMMUTER EMPLOYEES',
  ID: '8871 - ID/CLERICAL TELECOMMUTER EMPLOYEES',
  IL: '8871 - IL/CLERICAL TELECOMMUTER EMPLOYEES',
  IN: '8871 - IN/CLERICAL TELECOMMUTER EMPLOYEES',
  KS: '8871 - KS/CLERICAL TELECOMMUTER EMPLOYEES',
  KY: '8871 - KY/CLERICAL TELECOMMUTER EMPLOYEES',
  LA: '8871 - LA/CLERICAL TELECOMMUTER EMPLOYEES',
  MD: '8871 - MD/CLERICAL TELECOMMUTER EMPLOYEES',
  MI: '8810 - MI/CLERICAL',
  MO: '8871 - MO/CLERICAL TELECOMMUTER EMPLOYEES',
  MS: '8871 - MS/CLERICAL TELECOMMUTER EMPLOYEES',
  NC: '8871 - NC/CLERICAL TELECOMMUTER EMPLOYEES',
  NJ: '8871 - NJ/CLERICAL TELECOMMUTER EMPLOYEES',
  NV: '8871 - NV/CLERICAL TELECOMMUTER EMPLOYEES',
  NY: '8871 - NY/CLERICAL TELECOMMUTER EMPLOYEES',
  OK: '8871 - OK/CLERICAL TELECOMMUTER EMPLOYEES',
  OR: '8810 - OR/CLERICAL',
  PA: '0953 - PA/Clerical',
  RI: '8871 - RI/CLERICAL TELECOMMUTER EMPLOYEES',
  SC: '8871 - SC/CLERICAL TELECOMMUTER EMPLOYEES',
  TN: '8871 - TN/CLERICAL TELECOMMUTER EMPLOYEES',
  TX: '8810 - TX/CLERICAL',
  VA: '8871 - VA/CLERICAL TELECOMMUTER EMPLOYEES',
  WA: '8871 - WA/CLERICAL TELECOMMUTER EMPLOYEES',
  WI: '8871 - WI/CLERICAL TELECOMMUTER EMPLOYEES',
};

/** Get Work Comp Code for a state abbreviation. Returns null if state not in list. */
export function getWorkCompCode(state: string | null | undefined): string | null {
  if (!state) return null;
  return WORK_COMP_CODES[state.toUpperCase().trim()] ?? null;
}

// ---------------------------------------------------------------------------
// US States
// ---------------------------------------------------------------------------

export const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY',
] as const;

export const US_STATE_NAMES: Record<string, string> = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',
  CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',
  FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',
  IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',
  MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',
  MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
  NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',
  OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
  SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',
  WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
};

// ---------------------------------------------------------------------------
// Fixed defaults — same for every Pitch Perfect agent
// ---------------------------------------------------------------------------

export const DECISIONHR_DEFAULTS = {
  authentication: 'Login Email',
  employeeIdentification: 'SSN',
  status: 'Active',
  pullIntoPayroll: 'Yes',
  position: 'Call Center',
  workLocation: 'Work From Home',
  unionMember: 'No',
  compensationType: 'Hourly',
  payrollRule: '2444 - BW ON Web WIRE',
  payPeriod: 'Bi-Weekly',
  workerType: 'Non-Exempt',
} as const;

// ---------------------------------------------------------------------------
// 46-column payload type
// ---------------------------------------------------------------------------

export interface DecisionHRPayload {
  // Basic Identification (1-6)
  firstName: string;
  lastName: string;
  authentication: string;
  employeeIdentification: string;
  ssn: string;              // 9 bare digits
  loginEmail: string;

  // General Information (7-17)
  employeeId: string;       // blank
  clockNumber: string;      // blank
  originalHireDate: string;  // MM/DD/YYYY
  liabilityStart: string;    // MM/DD/YYYY
  distributionCode: string;  // blank
  benefitsWaitingPeriodStart: string; // MM/DD/YYYY
  unionMember: string;
  union: string;             // blank
  effectiveDate: string;     // MM/DD/YYYY
  status: string;
  pullIntoPayroll: string;

  // Position Details (18-29)
  position: string;
  socCode: string;           // blank
  homeDivision: string;      // blank
  workLocation: string;
  department: string;        // blank
  reportsTo: string;
  workCompCode: string;
  certifiedCode: string;     // blank
  benefitGroup: string;      // blank
  benefitGroupAssignmentDate: string; // blank
  eeoClass: string;          // blank
  timeOffGroup: string;      // blank

  // Compensation (30-37)
  employmentType: string;    // blank
  compensationType: string;
  payrollRule: string;
  payPeriod: string;
  workerType: string;
  compensableHours: string;  // blank
  hourlyRate: string;        // decimal
  numberOfUnits: string;     // blank

  // Job Costing (38-46) — all blank
  jobCosting1: string;
  jobCosting2: string;
  jobCosting3: string;
  jobCosting4: string;
  jobCosting5: string;
  jobCosting6: string;
  jobCosting7: string;
  jobCosting8: string;
  jobCosting9: string;
}

/** Column headers in exact template order (Row 4 of xlsx) */
export const COLUMN_HEADERS: string[] = [
  'First Name',
  'Last Name',
  'Authentication',
  'Employee Identification',
  'SSN / FEIN',
  'Login Email Address',
  'Employee ID',
  'Clock Number',
  'Original Hire Date',
  'Liability Start',
  'Distribution Code',
  'Benefits Waiting Period Start',
  'Union Member',
  'Union',
  'Effective Date',
  'Status',
  'Pull Into Payroll',
  'Position',
  'SOC Code',
  'Home Division (Default)',
  'Work Location (Default)',
  'Department',
  'Reports To',
  'Work Comp Code (Default)',
  'Certified Code (Default)',
  'Benefit Group',
  'Benefit Group Assignment Date',
  'EEO Class',
  'Time Off Group',
  'Employment Type',
  'Compensation Type',
  'Payroll Rule',
  'Pay Period',
  'Worker Type',
  'Compensable Hours',
  'Amount / Hourly Rate / Unit Work Rate',
  'Number Of Units',
  'Job Costing Code 1',
  'Job Costing Code 2',
  'Job Costing Code 3',
  'Job Costing Code 4',
  'Job Costing Code 5',
  'Job Costing Code 6',
  'Job Costing Code 7',
  'Job Costing Code 8',
  'Job Costing Code 9',
];

/** Group headers (Row 3 of xlsx) — spans of columns */
export const GROUP_HEADERS = [
  { label: 'Basic Identification', startCol: 0, endCol: 5 },
  { label: 'Employment - General Information', startCol: 6, endCol: 16 },
  { label: 'Employment - Position Details', startCol: 17, endCol: 28 },
  { label: 'Employment - Compensation', startCol: 29, endCol: 36 },
  { label: 'Employment - Job Costing Code', startCol: 37, endCol: 45 },
];

/** Convert payload to ordered array matching COLUMN_HEADERS */
export function payloadToRow(p: DecisionHRPayload): string[] {
  return [
    p.firstName,
    p.lastName,
    p.authentication,
    p.employeeIdentification,
    p.ssn,
    p.loginEmail,
    p.employeeId,
    p.clockNumber,
    p.originalHireDate,
    p.liabilityStart,
    p.distributionCode,
    p.benefitsWaitingPeriodStart,
    p.unionMember,
    p.union,
    p.effectiveDate,
    p.status,
    p.pullIntoPayroll,
    p.position,
    p.socCode,
    p.homeDivision,
    p.workLocation,
    p.department,
    p.reportsTo,
    p.workCompCode,
    p.certifiedCode,
    p.benefitGroup,
    p.benefitGroupAssignmentDate,
    p.eeoClass,
    p.timeOffGroup,
    p.employmentType,
    p.compensationType,
    p.payrollRule,
    p.payPeriod,
    p.workerType,
    p.compensableHours,
    p.hourlyRate,
    p.numberOfUnits,
    p.jobCosting1,
    p.jobCosting2,
    p.jobCosting3,
    p.jobCosting4,
    p.jobCosting5,
    p.jobCosting6,
    p.jobCosting7,
    p.jobCosting8,
    p.jobCosting9,
  ];
}

/** Format a Date as MM/DD/YYYY */
export function formatDateMMDDYYYY(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '';
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/** Strip dashes/spaces from SSN to get 9 bare digits */
export function normalizeSSN(ssn: string | null | undefined): string {
  if (!ssn) return '';
  return ssn.replace(/[\s-]/g, '');
}
