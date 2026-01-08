export enum CallStatus {
    CONSENT = 'Consent Received',
    NO_CONSENT = 'No Consent',
    REVIEW = 'Needs Review',
}

// QA Workflow status types
export type QAStatus = 'pending' | 'approved' | 'rejected' | 'escalated' | 'training_flagged';
export type ReviewPriority = 'urgent' | 'normal' | 'low';

export interface Chapter {
    title: string;
    startTime: string;
}

export interface ChecklistItem {
    name: string;
    status: 'met' | 'not_met' | 'n/a' | 'PASS' | 'FAIL';
    evidence?: string;
    notes?: string;
    weight?: string;
    points_possible?: number;
    points_earned?: number;
    time?: string;
}

export interface KeyQuote {
    category: string;
    quote: string;
    assessment: string;
}

// The shape of the data used in the Frontend UI
export interface CallData {
    id: string;
    createdAt: string;
    timestamp: string;
    callId: string;
    campaignType: string;
    agentName: string;
    phoneNumber: string;
    duration: string;
    callDate: string;
    callTime: string;
    status: string;
    complianceScore: number;
    riskLevel: string;
    checklist: ChecklistItem[];
    violations: string[];
    reviewFlags: string[];
    coachingNotes: string[];
    summary: string;
    keyQuotes: KeyQuote[];
    recordingUrl: string;
    analyzedAt: string;
    transcript: string;

    // Additional fields for component support
    transcriptPreview?: string;
    chapters?: Chapter[];
    overallCompliance?: string;
    campaignTags?: string[];

    // QA Workflow fields
    qaStatus: QAStatus;
    qaReviewedBy?: string;
    qaReviewedAt?: string;
    qaNotes?: string;
    reviewPriority: ReviewPriority;
}

// The shape of the raw row from Supabase "Pitch Perfect" table
export interface DatabaseCallRow {
    id: number;
    created_at: string;
    "Call ID": string | null;
    "Campaign Type": string | null;
    "Agent Name": string | null;
    "Phone Number": string | null;
    "Call Duration": string | null;
    "Call Date": string | null;
    "Call Time": string | null;
    "Call Status": string | null;
    "Call Score": string | null;
    "Risk Level": string | null;
    "Checklist": ChecklistItem[] | string | null;
    "Violations": string[] | string | null;
    "Review Flags": string[] | string | null;
    "Coaching Notes": string[] | string | null;
    "Summary": string | null;
    "Key Quotes": KeyQuote[] | string | null;
    "Call Recording URL": string | null;
    "Call Analyzed Date/Time": string | null;
    "Transcript": string | null;
    // QA Workflow columns
    "QA Status": string | null;
    "QA Reviewed By": string | null;
    "QA Reviewed At": string | null;
    "QA Notes": string | null;
    "Review Priority": string | null;
}

export interface FilterState {
    agent: string;
    dateRange: string;
    status: string;
    minConfidence: number;
}

export interface GaugeData {
    label: string;
    value: number; // percentage 0-100
    count: number;
    total: number;
    color: string;
    subLabel: string;
}
