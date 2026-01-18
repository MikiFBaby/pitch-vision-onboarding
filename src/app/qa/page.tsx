"use client";

import React, { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useAuth } from "@/context/AuthContext";
import { useQA, QAProvider } from "@/context/QAContext";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { CallData, CallStatus, DatabaseCallRow, QAStatus } from "@/types/qa-types";

// Layout
import DashboardLayout from "@/components/layout/DashboardLayout";

// QA Components
import { DashboardMetricCard } from "@/components/qa/DashboardMetricCard";
import { GaugeCluster } from "@/components/qa/GaugeCluster";
import { ComplianceTrendChart } from "@/components/qa/ComplianceTrendChart";
import { RecentCallsTable } from "@/components/qa/QARecentCallsTable";
import { TranscriptDrawer } from "@/components/qa/TranscriptDrawer";
import { AgentScoreboard } from "@/components/qa/AgentScoreboard";
import { ReportsView } from "@/components/qa/ReportsView";
import { VoiceCopilot } from "@/components/qa/VoiceCopilot";
import { CallAnalyzer } from "@/components/qa/CallAnalyzer";

// Icons
import {
    LayoutDashboard, Zap, Users, FileBarChart, Settings,
    Search, Bell, Plus, ChevronRight, AlertTriangle
} from "lucide-react";

// Transform database row to CallData format
function transformRow(row: DatabaseCallRow): CallData {
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
        campaignType: row.campaign_type || "General",
        agentName: row.agent_name || "Unknown Agent",
        phoneNumber: row.phone_number || "",
        duration: row.call_duration || "",
        callDate: row.call_date || "",
        callTime: row.call_time || "",
        status: row.call_status || "",
        // Prefer integer column, fallback to parsing text column
        complianceScore: (() => {
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
        coachingNotes: parseJsonField(row.coaching_notes, []),
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
        uploadType: (row.upload_type as 'manual' | 'automated') || 'manual',
    };
}

type ViewType = 'dashboard' | 'live' | 'review' | 'agents' | 'reports';

// ... (imports remain the same above)

// Move the main logic to a sub-component
function QADashboardContent() {
    const { user, profile } = useAuth();
    const searchParams = useSearchParams();
    const router = useRouter();

    // ... (rest of the component logic: state, effects, etc. - copy from lines 158-738)
    // Be careful to include EVERYTHING from the original component

    // State
    const [calls, setCalls] = useState<CallData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    // View state derives from URL, default to 'dashboard'
    const currentView = (searchParams.get('view') as ViewType) || 'dashboard';

    const [selectedCall, setSelectedCall] = useState<CallData | null>(null);
    const { setReviewCount: setReviewCountFn, isAnalyzerOpen, setAnalyzerOpen } = useQA();

    // Filters
    const [selectedAgent, setSelectedAgent] = useState('');
    const [selectedCampaign, setSelectedCampaign] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [minScore, setMinScore] = useState(0);
    const [selectedRiskLevel, setSelectedRiskLevel] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');

    // Fetch calls from Supabase
    const fetchCalls = useCallback(async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('Pitch Perfect')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching calls:', error);
                return;
            }

            if (data) {
                const transformed = data.map((row: DatabaseCallRow) => transformRow(row));
                setCalls(transformed);
            }
        } catch (e) {
            console.error('Fetch error:', e);
        } finally {
            if (!silent) setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCalls();
    }, [fetchCalls]);

    // Real-time subscription for auto-refresh
    useEffect(() => {
        const channel = supabase
            .channel('pitch-perfect-changes')
            .on(
                'postgres_changes',
                {
                    event: '*', // Listen to INSERT, UPDATE, DELETE
                    schema: 'public',
                    table: 'Pitch Perfect'
                },
                (payload) => {
                    console.log('Real-time update received:', payload.eventType);
                    // Refresh data silently (no loading spinner)
                    fetchCalls(true);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchCalls]);

    // Calculate Review Queue Count and Sync to Context
    useEffect(() => {
        // Queue Logic:
        // 1. Status explicitly "Needs Review" or "Requires Review"
        // 2. Score between 70-89% (Medium Risk)
        // 3. EXCLUDE items that have been manually reviewed (qaStatus is set to approved/rejected)
        const count = calls.filter(c => {
            // If manual QA status is set to final state, it's NOT in queue
            if (c.qaStatus === 'approved' || c.qaStatus === 'rejected') return false;

            const statusLower = (c.status || '').toLowerCase();
            const isReviewStatus = statusLower.includes('review') || statusLower.includes('requires');

            // Medium risk score range (70-89%)
            const isMidRangeScore = c.complianceScore >= 70 && c.complianceScore < 90;

            return isReviewStatus || isMidRangeScore;
        }).length;

        setReviewCountFn(count);
    }, [calls, setReviewCountFn]);


    // Keyboard shortcuts for rapid QA review
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't trigger if user is typing in an input field
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                return;
            }

            // Get current index if a call is selected
            const currentIndex = selectedCall ? calls.findIndex(c => c.id === selectedCall.id) : -1;

            switch (e.key.toLowerCase()) {
                case 'escape':
                    // Close drawer
                    if (selectedCall) {
                        setSelectedCall(null);
                    }
                    break;

                case 'n':
                    // Next call
                    if (selectedCall && currentIndex < calls.length - 1) {
                        e.preventDefault();
                        setSelectedCall(calls[currentIndex + 1]);
                    }
                    break;

                case 'p':
                    // Previous call
                    if (selectedCall && currentIndex > 0) {
                        e.preventDefault();
                        setSelectedCall(calls[currentIndex - 1]);
                    }
                    break;

                case 'arrowdown':
                    // Next call with arrow
                    if (selectedCall && currentIndex < calls.length - 1) {
                        e.preventDefault();
                        setSelectedCall(calls[currentIndex + 1]);
                    }
                    break;

                case 'arrowup':
                    // Previous call with arrow
                    if (selectedCall && currentIndex > 0) {
                        e.preventDefault();
                        setSelectedCall(calls[currentIndex - 1]);
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedCall, calls]);

    // Delete handler - uses API route with admin client
    const handleDeleteCalls = async (ids: string[]) => {
        try {
            console.log('Deleting calls with IDs:', ids);

            const response = await fetch('/api/qa/delete-calls', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids })
            });

            const result = await response.json();
            console.log('Delete result:', result);

            if (!response.ok || !result.success) {
                console.error('Delete failed:', result.error);
                alert(`Failed to delete: ${result.error || 'Unknown error'}`);
                return;
            }

            // Remove from UI
            setCalls(prev => prev.filter(c => !ids.includes(c.id)));

        } catch (e: any) {
            console.error('Delete exception:', e);
            alert('Failed to delete calls');
        }
    };

    // Agent review handler
    const handleAgentReview = (agentName: string) => {
        setSelectedAgent(agentName);
        setSearchQuery('');
        setSelectedCampaign('');
        setSelectedRiskLevel('');
        setMinScore(0);
        // In a real implementation we would push to URL
    };

    // QA Status change handler
    const handleStatusChange = async (id: string, status: QAStatus, notes?: string) => {
        try {
            console.log('Updating status:', { id, status, notes });

            const response = await fetch('/api/qa/update-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id,
                    status,
                    notes,
                    reviewedBy: profile?.email || user?.email || 'Unknown'
                })
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                console.error('Status update failed:', result.error);
                return;
            }

            // Update local state
            setCalls(prev => prev.map(c =>
                c.id === id
                    ? { ...c, qaStatus: status, qaReviewedBy: profile?.email, qaReviewedAt: new Date().toISOString() }
                    : c
            ));

        } catch (e: any) {
            console.error('Status update error:', e);
        }
    };

    // Handle score update from TranscriptDrawer
    const handleScoreUpdate = (callId: number | string, newScore: number) => {
        console.log('Score update received from drawer:', callId, newScore);
        setCalls(prev => prev.map(c =>
            c.id === callId
                ? { ...c, complianceScore: newScore }
                : c
        ));
        // Also update selectedCall if it's the same call
        if (selectedCall && selectedCall.id === callId) {
            setSelectedCall(prev => prev ? { ...prev, complianceScore: newScore } : null);
        }
    };

    // Computed stats with trends
    const stats = useMemo(() => {
        const total = calls.length;
        if (total === 0) return {
            avgScore: 0,
            complianceRate: 0,
            riskCount: 0,
            complianceCount: 0,
            trend: 0
        };

        const totalScore = calls.reduce((acc, curr) => acc + (curr.complianceScore || 0), 0);

        // Overall Compliance: 90%+ score (matches Compliant status)
        const complianceCount = calls.filter(c => c.complianceScore >= 90).length;

        // Risk Detection: Align with High Risk labels in feed
        const riskCount = calls.filter(c => {
            const riskLower = (c.riskLevel || '').toLowerCase();
            const statusLower = (c.status || '').toLowerCase();
            return (
                riskLower === 'high' ||
                riskLower === 'critical' ||
                (c.violations && c.violations.length > 0) ||
                statusLower.includes('no consent') ||
                statusLower.includes('fail') ||
                statusLower.includes('rejected') ||
                statusLower.includes('compliance_fail')
            );
        }).length;

        // Trend Calculation: Compare today vs yesterday
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

        const todayCalls = calls.filter(c => new Date(c.timestamp) >= today).length;
        const yesterdayCalls = calls.filter(c => {
            const d = new Date(c.timestamp);
            return d >= yesterday && d < today;
        }).length;

        const trend = yesterdayCalls > 0
            ? Math.round(((todayCalls - yesterdayCalls) / yesterdayCalls) * 100)
            : (todayCalls > 0 ? 100 : 0);

        return {
            avgScore: Math.round(totalScore / total),
            complianceRate: Math.round((complianceCount / total) * 100),
            riskCount,
            complianceCount,
            trend
        };
    }, [calls]);

    const uniqueAgents = useMemo(() => Array.from(new Set(calls.map(c => c.agentName))), [calls]);
    const uniqueCampaigns = useMemo(() => Array.from(new Set(calls.map(c => c.campaignType))), [calls]);

    const filteredCalls = useMemo(() => {
        return calls.filter(c => {
            const matchesAgent = selectedAgent ? c.agentName === selectedAgent : true;
            const matchesCampaign = selectedCampaign ? c.campaignType === selectedCampaign : true;
            const matchesSearch = searchQuery
                ? c.agentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                c.phoneNumber.includes(searchQuery)
                : true;

            let matchesDate = true;
            if (dateRange.start) matchesDate = matchesDate && new Date(c.timestamp) >= new Date(dateRange.start);
            if (dateRange.end) matchesDate = matchesDate && new Date(c.timestamp) <= new Date(dateRange.end + 'T23:59:59');

            const matchesScore = c.complianceScore >= minScore;
            const matchesRisk = selectedRiskLevel
                ? (c.riskLevel || '').toLowerCase() === selectedRiskLevel.toLowerCase()
                : true;

            return matchesAgent && matchesCampaign && matchesSearch && matchesDate && matchesScore && matchesRisk;
        });
    }, [calls, selectedAgent, selectedCampaign, searchQuery, dateRange, minScore, selectedRiskLevel]);

    // Get greeting
    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Good morning";
        if (hour < 17) return "Good afternoon";
        return "Good evening";
    };

    const userName = profile?.first_name || user?.displayName?.split(" ")[0] || "QA Specialist";

    // Render content based on current view
    const renderContent = () => {
        switch (currentView) {
            case 'dashboard':
                return (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
                        {/* Greeting */}
                        <div className="flex justify-between items-start">
                            <div className="flex flex-col gap-2">
                                <h2 className="text-4xl font-bold tracking-tight text-white group cursor-default">
                                    Compliance Dashboard
                                    <span className="inline-block ml-3 w-3 h-3 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
                                </h2>
                                <div className="flex items-center gap-3 text-lg text-white/60 font-medium mt-1">
                                    <span className="text-indigo-200/80">{getGreeting()}, <span className="text-white font-bold">{userName}</span></span>
                                    <div className="h-1 w-1 rounded-full bg-white/20" />
                                    <span>You have <span className="text-indigo-400 font-bold">{filteredCalls.length} calls</span> in your view.</span>
                                </div>
                            </div>

                            <button
                                onClick={() => setAnalyzerOpen(true)}
                                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-sm uppercase tracking-widest rounded-xl shadow-lg shadow-purple-900/30 hover:shadow-purple-700/50 hover:scale-[1.02] active:scale-[0.98] transition-all"
                            >
                                <Zap size={18} fill="currentColor" />
                                New Analysis
                            </button>
                        </div>

                        {/* Metric Cards - Count focused */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <DashboardMetricCard
                                title="Total Analyzed"
                                value={calls.length}
                                subLabel="Calls Processed"
                                color="#8b5cf6"
                                trend={{ label: "vs yesterday", value: stats.trend }}
                            />
                            <DashboardMetricCard
                                title="Met Compliance"
                                value={stats.complianceCount}
                                subLabel="Perfect Score (100%)"
                                color="#10b981"
                            />
                            <DashboardMetricCard
                                title="Risk Detected"
                                value={stats.riskCount}
                                subLabel="High Risk Interactions"
                                color="#f43f5e"
                            />
                        </div>

                        {/* Gauge Cluster - Percentage visualizations */}
                        <GaugeCluster gauges={[
                            { label: "Avg. Quality", value: stats.avgScore, color: "#8b5cf6", description: "Mean score across all analyzed calls" },
                            { label: "Compliance Rate", value: stats.complianceRate, color: "#10b981", description: "% of calls achieving 90%+ (Compliant)" },
                            { label: "Risk Factor", value: calls.length > 0 ? Math.round((stats.riskCount / calls.length) * 100) : 0, color: "#f43f5e", description: "% of calls flagged as high risk" }
                        ]} />

                        {/* Trend Chart */}
                        <ComplianceTrendChart calls={calls} />

                        {/* Recent Calls Table */}
                        <div className="min-h-[500px]">
                            <RecentCallsTable
                                calls={filteredCalls}
                                onViewTranscript={setSelectedCall}
                                selectedAgent={selectedAgent}
                                onAgentChange={setSelectedAgent}
                                availableAgents={uniqueAgents}
                                selectedCampaign={selectedCampaign}
                                onCampaignChange={setSelectedCampaign}
                                availableCampaigns={uniqueCampaigns}
                                searchQuery={searchQuery}
                                onSearchChange={setSearchQuery}
                                startDate={dateRange.start}
                                onStartDateChange={(d) => setDateRange(prev => ({ ...prev, start: d }))}
                                endDate={dateRange.end}
                                onEndDateChange={(d) => setDateRange(prev => ({ ...prev, end: d }))}
                                minScore={minScore}
                                onMinScoreChange={setMinScore}
                                selectedRiskLevel={selectedRiskLevel}
                                onRiskLevelChange={setSelectedRiskLevel}
                                selectedStatus={selectedStatus}
                                onStatusFilterChange={setSelectedStatus}
                                onDelete={handleDeleteCalls}
                                onStatusChange={handleStatusChange}
                            />
                        </div>
                    </div>
                );
            case 'live':
                return (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
                        <div className="flex justify-between items-center glass-card p-6 rounded-2xl border border-white/10">
                            <div>
                                <h2 className="text-2xl font-bold text-white tracking-tight">Live Operations Center</h2>
                                <p className="text-white/40 text-sm mt-1">Real-time stream management</p>
                            </div>
                            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 bg-emerald-950/30 border border-emerald-500/30 px-4 py-2 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_10px_#34d399]" />
                                SYSTEM ONLINE
                            </div>
                        </div>
                        <div className="min-h-[600px]">
                            <RecentCallsTable
                                calls={filteredCalls}
                                onViewTranscript={setSelectedCall}
                                selectedAgent={selectedAgent}
                                onAgentChange={setSelectedAgent}
                                availableAgents={uniqueAgents}
                                selectedCampaign={selectedCampaign}
                                onCampaignChange={setSelectedCampaign}
                                availableCampaigns={uniqueCampaigns}
                                searchQuery={searchQuery}
                                onSearchChange={setSearchQuery}
                                startDate={dateRange.start}
                                onStartDateChange={(d) => setDateRange(prev => ({ ...prev, start: d }))}
                                endDate={dateRange.end}
                                onEndDateChange={(d) => setDateRange(prev => ({ ...prev, end: d }))}
                                minScore={minScore}
                                onMinScoreChange={setMinScore}
                                selectedRiskLevel={selectedRiskLevel}
                                onRiskLevelChange={setSelectedRiskLevel}
                                selectedStatus={selectedStatus}
                                onStatusFilterChange={setSelectedStatus}
                                onDelete={handleDeleteCalls}
                                onStatusChange={handleStatusChange}
                            />
                        </div>
                    </div>
                );
            case 'review':
                // Include: status contains 'review' (Needs Review, Requires Review) OR score 70-89%
                // MUST filter out already processed items (approved/rejected)
                const reviewCalls = calls.filter(c => {
                    // 1. Exclude finalized items
                    if (c.qaStatus === 'approved' || c.qaStatus === 'rejected') return false;

                    // 2. EXPLICIT EXCLUSION: High Compliance (90-100%) should NOT be in review queue
                    // unless specifically marked as failed/rejected (handled by finalized check above)
                    if (c.complianceScore >= 90) return false;

                    // 3. Include review-needed status
                    const statusLower = (c.status || '').toLowerCase();
                    const isReviewStatus = statusLower.includes('review') || statusLower.includes('requires');

                    // 4. Include medium risk score (70-89%)
                    const isMidRangeScore = c.complianceScore >= 70 && c.complianceScore < 90;

                    return isReviewStatus || isMidRangeScore;
                });
                return (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
                        <div className="flex justify-between items-center glass-card p-6 rounded-2xl border border-white/10">
                            <div>
                                <h2 className="text-2xl font-bold text-white tracking-tight">Review Queue</h2>
                                <p className="text-indigo-200/70 text-xs font-bold uppercase tracking-widest mt-1">
                                    {reviewCalls.length} call{reviewCalls.length !== 1 ? 's' : ''} requiring human review
                                </p>
                            </div>
                            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 bg-amber-950/30 border border-amber-500/30 px-4 py-2 rounded-full shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                                <AlertTriangle size={14} />
                                {reviewCalls.length} PENDING
                            </div>
                        </div>
                        <div className="min-h-[600px]">
                            <RecentCallsTable
                                calls={reviewCalls}
                                onViewTranscript={setSelectedCall}
                                selectedAgent={selectedAgent}
                                onAgentChange={setSelectedAgent}
                                availableAgents={uniqueAgents}
                                selectedCampaign={selectedCampaign}
                                onCampaignChange={setSelectedCampaign}
                                availableCampaigns={uniqueCampaigns}
                                searchQuery={searchQuery}
                                onSearchChange={setSearchQuery}
                                startDate={dateRange.start}
                                onStartDateChange={(d) => setDateRange(prev => ({ ...prev, start: d }))}
                                endDate={dateRange.end}
                                onEndDateChange={(d) => setDateRange(prev => ({ ...prev, end: d }))}
                                minScore={minScore}
                                onMinScoreChange={setMinScore}
                                selectedRiskLevel={selectedRiskLevel}
                                onRiskLevelChange={setSelectedRiskLevel}
                                selectedStatus={selectedStatus}
                                onStatusFilterChange={setSelectedStatus}
                                onDelete={handleDeleteCalls}
                                onStatusChange={handleStatusChange}
                            />
                        </div>
                    </div>
                );
            case 'agents':
                return <AgentScoreboard calls={calls} onReviewAgent={handleAgentReview} />;
            case 'reports':
                return <ReportsView calls={filteredCalls} />;
            default:
                return null;
        }
    };

    return (
        <DashboardLayout>
            <div className="flex flex-col h-full">
                {/* Main content */}
                <div className="flex-1 overflow-y-auto">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="flex flex-col items-center gap-6 animate-pulse">
                                <div className="h-16 w-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 shadow-2xl">
                                    <Zap size={32} className="text-purple-400" fill="currentColor" />
                                </div>
                                <p className="text-white/40 font-bold text-xs uppercase tracking-[0.2em]">Loading System Data...</p>
                            </div>
                        </div>
                    ) : (
                        renderContent()
                    )}
                </div>
            </div>

            {/* Modals */}
            <CallAnalyzer
                isOpen={isAnalyzerOpen}
                onClose={() => setAnalyzerOpen(false)}
                onAnalysisComplete={(newCall) => {
                    setCalls(prev => {
                        if (prev.some(c => c.id === newCall.id)) return prev;
                        return [newCall, ...prev];
                    });
                    setAnalyzerOpen(false);
                }}
                onUploadSuccess={() => {
                    fetchCalls(true);
                    setTimeout(() => fetchCalls(true), 5000);
                }}
            />

            {selectedCall && (
                <TranscriptDrawer
                    call={selectedCall}
                    onClose={() => setSelectedCall(null)}
                    onScoreUpdate={handleScoreUpdate}
                />
            )}
        </DashboardLayout>
    );
}

export default function QADashboard() {
    return (
        <QAProvider>
            <Suspense fallback={
                <div className="flex items-center justify-center h-screen bg-[#0F0720]">
                    <div className="flex flex-col items-center gap-6 animate-pulse">
                        <div className="h-16 w-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 shadow-2xl">
                            <Zap size={32} className="text-purple-400" fill="currentColor" />
                        </div>
                        <p className="text-white/40 font-bold text-xs uppercase tracking-[0.2em]">Loading Dashboard...</p>
                    </div>
                </div>
            }>
                <QADashboardContent />
            </Suspense>
        </QAProvider>
    );
}
