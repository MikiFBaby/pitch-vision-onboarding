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
    call_id: string | null;
    campaign_type: string | null;
    agent_name: string | null;
    phone_number: string | null;
    call_duration: string | null;
    call_date: string | null;
    call_time: string | null;
    call_status: string | null;
    call_score: string | null;
    risk_level: string | null;

    // JSONB Columns
    checklist: any | null;
    violations: any | null;
    review_flags: any | null;
    coaching_notes: any | null;
    summary: string | null;
    key_quotes: any | null;
    recording_url: string | null;
    analyzed_at: string | null;
    transcript: string | null;

    // New JSONB Structure items
    duration_assessment: any | null;
    language_assessment: any | null;
    focus_areas: any | null;
    call_analysis: any | null; // Raw/Backup

    // QA Workflow columns
    qa_status: string | null;
    qa_reviewed_by: string | null;
    qa_reviewed_at: string | null;
    qa_notes: string | null;
    review_priority: string | null;
    buyer: string | null;
    compliance_score: number | null;
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
