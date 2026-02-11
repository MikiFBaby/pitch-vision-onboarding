export enum CallStatus {
    CONSENT = 'Consent Received',
    NO_CONSENT = 'No Consent',
    REVIEW = 'Needs Review',
}

// QA Workflow status types
export type QAStatus = 'pending' | 'approved' | 'rejected' | 'escalated' | 'training_flagged';
export type ReviewPriority = 'urgent' | 'normal' | 'low';
export type ProductType = 'ACA' | 'MEDICARE' | 'WHATIF';

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

// Speaker metrics from transcript analysis
export interface SpeakerMetrics {
    agent: {
        turnCount: number;
        speakingTimeSeconds: number;
        speakingTimeFormatted: string;
        speakingPercentage: number;
    };
    customer: {
        turnCount: number;
        speakingTimeSeconds: number;
        speakingTimeFormatted: string;
        speakingPercentage: number;
    };
    total: {
        turnCount: number;
        speakingTimeSeconds: number;
        speakingTimeFormatted: string;
    };
}

// The shape of the data used in the Frontend UI
export interface CallData {
    id: string;
    createdAt: string;
    timestamp: string;
    callId: string;
    productType: ProductType;
    campaignType: string;
    agentName: string;
    phoneNumber: string;
    duration: string;
    originalCallDuration?: string;  // Original recording duration (before any trimming)
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
    qaOverrides?: { [key: string]: string };  // Item key -> override status (PASS/FAIL)
    reviewPriority: ReviewPriority;
    uploadType?: 'manual' | 'automated';

    // Extended analysis fields from n8n pipeline
    languageAssessment?: any;
    focusAreas?: { time: string; reason: string }[];
    callAnalysis?: any;  // Raw analysis data

    timelineMarkers?: {
        time: string;
        time_seconds?: number;
        event?: string;
        title?: string;
        type?: string;
        status?: string;
        evidence?: string;
        item_key?: string;
        confidence?: number;
        points_earned?: number;
        points_possible?: number;
    }[];
    criticalMoments?: { auto_fails: any[]; passes: any[]; warnings: any[] };
    autoFailTriggered?: boolean;
    autoFailReasons?: Array<{
        code: string;              // e.g., 'AF-01', 'AF-03', 'AF-09'
        violation: string;         // e.g., 'Discussing Money', 'Ignoring DNC Request'
        description: string;       // Human-readable explanation
        timestamp: string | null;  // e.g., '2:15' - when in call it occurred
        evidence: string | null;   // Transcript snippet showing violation
        speaker: 'agent' | 'customer';
        additional_info?: string;  // Extra context
        count?: number;            // For threshold violations (e.g., 4 quality issues)
        threshold?: number;        // The threshold that triggered it
    }> | string[];  // Keep string[] for backward compatibility

    // Auto-fail override fields (for false positive marking by QA)
    autoFailOverridden?: boolean;
    autoFailOverrideReason?: string;
    autoFailOverrideAt?: string;
    autoFailOverrideBy?: string;

    // Speaker turn metrics
    speakerMetrics?: SpeakerMetrics;
    agentTurnCount?: number;
    customerTurnCount?: number;
    agentSpeakingTime?: number;
    customerSpeakingTime?: number;

    // Tag for escalation/training/audit tracking
    tag?: 'escalated' | 'training' | 'training_review' | 'audit_list' | 'manual_review';

    // Licensed Agent (LA) detection metadata
    transferDetected?: boolean;
    transferInitiatedAtSeconds?: number;
    laDetected?: boolean;
    laStartedAtSeconds?: number;
    analysisCutoffSeconds?: number;

    // Additional metadata
    batchId?: string;
    suggestedListenStart?: string;
    talkRatio?: string;
    dominantSpeaker?: string;
    totalTalkTime?: number;
    agentSpeakingPct?: number;
    customerSpeakingPct?: number;
}

// The shape of the raw row from Supabase "QA Results" table
export interface DatabaseCallRow {
    id: number;
    created_at: string;
    call_id: string | null;
    product_type: string | null;
    campaign_type: string | null;
    agent_name: string | null;
    phone_number: string | null;
    call_duration: string | null;
    original_call_duration: string | null;  // Original recording duration (before trimming)
    call_date: string | null;
    call_time: string | null;
    call_status: string | null;
    call_score: string | null;
    risk_level: string | null;
    upload_type: string | null;

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

    // Speaker turn metrics
    speaker_metrics: any | null;
    timeline_markers: any | null; // Detailed timeline markers for audio player
    agent_turn_count: number | null;
    customer_turn_count: number | null;
    agent_speaking_time: number | null;
    customer_speaking_time: number | null;

    // Tag for escalation/training/audit tracking
    tag: string | null;

    // Auto-fail columns (TOP-LEVEL per schema)
    auto_fail_triggered: boolean | null;
    auto_fail_reasons: any | null;
    critical_moments: any | null;

    // Auto-fail override columns (for false positive marking)
    auto_fail_overridden: boolean | null;
    auto_fail_override_reason: string | null;
    auto_fail_override_at: string | null;
    auto_fail_override_by: string | null;

    // Licensed Agent (LA) detection columns
    transfer_detected: boolean | null;
    transfer_initiated_at_seconds: number | null;
    la_detected: boolean | null;
    la_started_at_seconds: number | null;
    analysis_cutoff_seconds: number | null;

    // Additional metadata columns
    batch_id: string | null;
    suggested_listen_start: string | null;
    talk_ratio: string | null;
    dominant_speaker: string | null;
    total_talk_time: number | null;
    agent_speaking_pct: number | null;
    customer_speaking_pct: number | null;
}

export interface FilterState {
    agent: string;
    dateRange: string;
    status: string;
    minConfidence: number;
    productType: string;
}

export interface GaugeData {
    label: string;
    value: number; // percentage 0-100
    count: number;
    total: number;
    color: string;
    subLabel: string;
}

export interface ProcessingJob {
    batch_id: string;
    file_name: string;
    status: 'pending' | 'processing' | 'completed' | 'error';
    milestone: string;
    progress_percent: number;
    estimated_seconds_remaining: number | null;
    error_message: string | null;
    qa_result_id?: string;
}
