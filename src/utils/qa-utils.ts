
import { CallData, DatabaseCallRow, ProductType } from "@/types/qa-types";

// Standardize "Met Compliance" Logic based on System Prompt Section 9
// COMPLIANT: Score 85-100
// REVIEW: Score 60-84
// FAIL: Score 0-59

export const COMPLIANCE_THRESHOLD = 85;

export const isCallCompliant = (call: CallData | { complianceScore: number }): boolean => {
    return (call.complianceScore || 0) >= COMPLIANCE_THRESHOLD;
};

// Transform database row to CallData format
export function transformRow(row: DatabaseCallRow): CallData {
    // Parse compliance score (e.g., "85" or "85%" -> 85)
    const parseScore = (score: string | number | null): number => {
        if (typeof score === 'number') return score;
        if (!score) return 0;
        const match = String(score).match(/(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
    };

    // Parse JSON fields that might be stored as strings OR are already objects
    const parseJsonField = <T,>(field: T | string | null, fallback: T): T => {
        if (!field) return fallback;
        if (typeof field === 'object') return field as T; // Already JSONB
        if (typeof field === 'string') {
            try {
                return JSON.parse(field) as T;
            } catch {
                return fallback;
            }
        }
        return field as T;
    };

    // Determine QA status based on Call Status if not explicitly set
    const determineQAStatus = (): 'pending' | 'approved' | 'rejected' | 'escalated' | 'training_flagged' => {
        if (row.qa_status) {
            return row.qa_status as 'pending' | 'approved' | 'rejected' | 'escalated' | 'training_flagged';
        }
        // Auto-set based on compliance status
        const callStatus = row.call_status?.toUpperCase();
        if (callStatus === 'COMPLIANT') return 'approved';
        if (callStatus === 'COMPLIANCE_FAIL') return 'rejected';
        return 'pending';
    };

    return {
        id: String(row.id),
        createdAt: row.created_at,
        timestamp: row.created_at,
        callId: row.call_id || `CALL-${row.id}`,
        productType: (row.product_type as ProductType) || 'ACA',
        campaignType: row.campaign_type || "General",
        agentName: row.agent_name || "Unknown Agent",
        phoneNumber: row.phone_number || "",
        duration: row.call_duration || "",
        originalCallDuration: row.original_call_duration || undefined,
        callDate: row.call_date || "",
        callTime: row.call_time || "",
        status: row.call_status || "",
        // OVERRIDE: Force all uploads to manual until backend properly sends upload_type
        // TODO: Restore original logic once n8n webhook sends correct upload_type
        uploadType: 'manual' as 'manual' | 'automated',
        // Prefer integer column, fallback to parsing text column
        // CRITICAL: Auto-fail ALWAYS overrides to score of 0
        complianceScore: (() => {
            // Check for auto-fail from TOP-LEVEL column (per schema)
            const autoFailFromColumn = row.auto_fail_triggered === true;

            // Check for auto-fail from call_status as backup
            const statusIndicatesAutoFail = (row.call_status || '').toLowerCase().includes('auto_fail');

            // If auto-fail is triggered, score MUST be 0
            if (autoFailFromColumn || statusIndicatesAutoFail) {
                return 0;
            }

            const dbScore = parseScore(row.compliance_score ?? row.call_score);
            if (dbScore > 0) return dbScore;

            // Fallback: Calculate from checklist if DB score is 0/missing
            const parsedChecklist = parseJsonField(row.checklist, []) as any[];
            if (!parsedChecklist || parsedChecklist.length === 0) return 0;

            const SCORING_WEIGHTS: { [key: string]: number } = {
                'recorded line disclosure': 20,
                'company identification': 15,
                'geographic verification': 15,
                'eligibility verification': 20,
                'verbal consent': 15,
                'handoff execution': 10,
                'benefit mention': 5,
            };

            const getItemWeight = (name: string): number => {
                const lowerName = (name || '').toLowerCase();
                for (const [key, weight] of Object.entries(SCORING_WEIGHTS)) {
                    if (lowerName.includes(key) || key.includes(lowerName.split(' ')[0])) {
                        return weight;
                    }
                }
                return 10; // Default weight
            };

            let earned = 0;
            let possible = 0;

            // Normalize checklist to array (Handle Object vs Array format)
            const checklistItems = Array.isArray(parsedChecklist)
                ? parsedChecklist
                : Object.entries(parsedChecklist).map(([key, val]) => ({ ...(val as any), name: key }));

            checklistItems.forEach(item => {
                const name = item.name || item.requirement || 'Item';
                const status = (item.status || '').toLowerCase();
                if (status === 'n/a') return;

                const weight = getItemWeight(name);
                possible += weight;

                if (['met', 'pass', 'yes', 'true'].includes(status)) {
                    earned += weight;
                }
            });

            return possible > 0 ? Math.round((earned / possible) * 100) : 0;
        })(),
        riskLevel: row.risk_level || "Low",

        checklist: parseJsonField(row.checklist, []),
        violations: parseJsonField(row.violations, []),
        reviewFlags: parseJsonField(row.review_flags, []),
        coachingNotes: (parseJsonField(row.coaching_notes, []) as any[]).map(note => {
            if (typeof note === 'string') return note;
            if (typeof note === 'object' && note !== null) {
                // Handle structured coaching note object
                const suggestion = note.suggestion || note.message || note.note || '';
                const area = note.area ? `[${note.area}] ` : '';
                return `${area}${suggestion}`;
            }
            return String(note);
        }).filter(n => n.length > 0),
        summary: row.summary || "",
        keyQuotes: parseJsonField(row.key_quotes, []),
        recordingUrl: row.recording_url || "",
        analyzedAt: row.analyzed_at || row.created_at,
        transcript: row.transcript || "",

        // QA Workflow fields
        qaStatus: determineQAStatus(),
        qaReviewedBy: row.qa_reviewed_by || undefined,
        qaReviewedAt: row.qa_reviewed_at || undefined,
        qaNotes: row.qa_notes || undefined,
        reviewPriority: (row.review_priority as 'urgent' | 'normal' | 'low') || 'normal',


        // Extended analysis fields from n8n pipeline
        languageAssessment: parseJsonField(row.language_assessment, null),
        focusAreas: parseJsonField(row.focus_areas, []),
        callAnalysis: parseJsonField(row.call_analysis, null),
        timelineMarkers: (() => {
            // Prefer top-level column if available (parsed safely)
            const topLevel = parseJsonField(row.timeline_markers, null);
            if (topLevel && Array.isArray(topLevel)) return topLevel;

            // Extract timeline markers from call_analysis if available
            const analysis = parseJsonField(row.call_analysis, null);
            if (analysis?.timeline_markers) return analysis.timeline_markers;
            return [];
        })(),
        // Read from TOP-LEVEL columns per schema, fallback to call_analysis for legacy
        criticalMoments: (() => {
            // Prefer top-level column
            if (row.critical_moments) return parseJsonField(row.critical_moments, { auto_fails: [], passes: [], warnings: [] });
            // Fallback: Extract from call_analysis
            const analysis = parseJsonField(row.call_analysis, null);
            if (analysis?.critical_moments) return analysis.critical_moments;
            return { auto_fails: [], passes: [], warnings: [] };
        })(),
        autoFailTriggered: (() => {
            // Prefer top-level column
            if (row.auto_fail_triggered !== null && row.auto_fail_triggered !== undefined) {
                return row.auto_fail_triggered;
            }
            // Fallback: Extract from call_analysis
            const analysis = parseJsonField(row.call_analysis, null);
            return analysis?.auto_fail_triggered || false;
        })(),
        autoFailReasons: (() => {
            // Prefer top-level column
            if (row.auto_fail_reasons) {
                return parseJsonField(row.auto_fail_reasons, []);
            }
            // Fallback: Extract from call_analysis
            const analysis = parseJsonField(row.call_analysis, null);
            return analysis?.auto_fail_reasons || [];
        })(),

        // Speaker turn metrics
        speakerMetrics: (() => {
            const raw = parseJsonField(row.speaker_metrics, null);
            if (!raw) return undefined;

            // Check if it's already in the nested format we expect
            if (raw.agent && raw.customer) return raw;

            // Otherwise, map from flat format (as seen in DB query)
            // { agent_speaking_time: 112, customer_speaking_time: 6, agent_turn_count: 4, ... }
            return {
                agent: {
                    turnCount: raw.agent_turn_count || 0,
                    speakingTimeSeconds: raw.agent_speaking_time || 0,
                    speakingTimeFormatted: raw.agent_time_formatted || "0:00",
                    speakingPercentage: raw.agent_speaking_pct || 0
                },
                customer: {
                    turnCount: raw.customer_turn_count || 0,
                    speakingTimeSeconds: raw.customer_speaking_time || 0,
                    speakingTimeFormatted: raw.customer_time_formatted || "0:00",
                    speakingPercentage: raw.customer_speaking_pct || 0
                },
                total: {
                    turnCount: (raw.agent_turn_count || 0) + (raw.customer_turn_count || 0),
                    speakingTimeSeconds: raw.total_speaking_time || 0,
                    speakingTimeFormatted: raw.call_duration_seconds ? String(raw.call_duration_seconds) + "s" : "0:00"
                }
            };
        })(),
        agentTurnCount: row.agent_turn_count || undefined,
        customerTurnCount: row.customer_turn_count || undefined,
        agentSpeakingTime: row.agent_speaking_time || undefined,
        customerSpeakingTime: row.customer_speaking_time || undefined,

        // Tag for escalation/training/audit tracking
        tag: row.tag as 'escalated' | 'training_review' | 'audit_list' | undefined,

        // Licensed Agent (LA) detection metadata
        transferDetected: row.transfer_detected ?? undefined,
        transferInitiatedAtSeconds: row.transfer_initiated_at_seconds ?? undefined,
        laDetected: row.la_detected ?? undefined,
        laStartedAtSeconds: row.la_started_at_seconds ?? undefined,
        analysisCutoffSeconds: row.analysis_cutoff_seconds ?? undefined,

        // Additional metadata (previously missing)
        batchId: row.batch_id || undefined,
        suggestedListenStart: row.suggested_listen_start || undefined,
        talkRatio: row.talk_ratio || undefined,
        dominantSpeaker: row.dominant_speaker || undefined,
        totalTalkTime: row.total_talk_time || undefined,
        agentSpeakingPct: row.agent_speaking_pct || undefined,
        customerSpeakingPct: row.customer_speaking_pct || undefined,
    };
}
