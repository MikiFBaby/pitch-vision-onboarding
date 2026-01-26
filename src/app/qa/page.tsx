"use client";

import React, { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useAuth } from "@/context/AuthContext";
import { useQA, QAProvider } from "@/context/QAContext";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { CallData, CallStatus, DatabaseCallRow, QAStatus } from "@/types/qa-types";
import { isCallCompliant, transformRow } from "@/utils/qa-utils";
import { useUserSettings } from "@/hooks/useUserSettings";

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
import { MessagesView } from "@/components/qa/MessagesView";
import { SettingsView } from "@/components/qa/SettingsView";
import { AuraChat } from "@/components/qa/AuraChat";
import { VoiceCopilot } from "@/components/qa/VoiceCopilot";
import { CallAnalyzer } from "@/components/qa/CallAnalyzer";

// Icons
import {
    LayoutDashboard, Zap, Users, FileBarChart, Settings,
    Search, Bell, Plus, ChevronRight, AlertTriangle, Activity, ClipboardCheck
} from "lucide-react";

// Transform database row to CallData format


type ViewType = 'dashboard' | 'live' | 'review' | 'agents' | 'reports' | 'messages' | 'settings' | 'aura';

// ... (imports remain the same above)

// Move the main logic to a sub-component
function QADashboardContent() {
    const { user, profile } = useAuth();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { displayName: settingsName } = useUserSettings();

    // ... (rest of the component logic: state, effects, etc. - copy from lines 158-738)
    // Be careful to include EVERYTHING from the original component

    // State
    const [calls, setCalls] = useState<CallData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    // View state derives from URL, default to 'dashboard'
    const currentView = (searchParams.get('view') as ViewType) || 'dashboard';

    // Time Range Selector State (Dashboard Metrics AND Live Feed)
    type TimeRange = 'today' | '7d' | '14d' | '30d' | '90d' | 'all';
    const [timeRange, setTimeRange] = useState<TimeRange>('today');

    const [selectedCall, setSelectedCall] = useState<CallData | null>(null);
    const { setReviewCount: setReviewCountFn, isAnalyzerOpen, setAnalyzerOpen } = useQA();

    // Filters
    const [selectedAgent, setSelectedAgent] = useState('');
    const [selectedCampaign, setSelectedCampaign] = useState('');
    const [selectedProductType, setSelectedProductType] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [minScore, setMinScore] = useState(0);
    const [selectedRiskLevel, setSelectedRiskLevel] = useState('');
    const [selectedRiskyAgents, setSelectedRiskyAgents] = useState<string[]>([]);
    const [selectedStatus, setSelectedStatus] = useState('');
    const [selectedTag, setSelectedTag] = useState('');
    const [reviewQueueTab, setReviewQueueTab] = useState<'pending' | 'reviewed'>('pending');

    // Fetch calls from Supabase
    const fetchCalls = useCallback(async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('QA Results')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching calls:', error);
                return;
            }

            if (data) {
                const transformed = data.map((row: DatabaseCallRow) => transformRow(row));

                // Preserve local QA review state if database hasn't caught up yet
                // This prevents optimistic updates from being overwritten by stale data
                setCalls(prev => {
                    // Create a map of locally-approved calls for quick lookup
                    const localApprovedCalls = new Map(
                        prev.filter(c => c.qaStatus === 'approved' && c.qaReviewedBy)
                            .map(c => [c.id, c])
                    );

                    return transformed.map(newCall => {
                        const localVersion = localApprovedCalls.get(newCall.id);
                        // If we have local approval data but database doesn't, preserve local data
                        if (localVersion && localVersion.qaStatus === 'approved' && !newCall.qaReviewedBy) {
                            return {
                                ...newCall,
                                qaStatus: localVersion.qaStatus,
                                qaReviewedBy: localVersion.qaReviewedBy,
                                qaReviewedAt: localVersion.qaReviewedAt,
                                qaNotes: localVersion.qaNotes
                            };
                        }
                        return newCall;
                    });
                });
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
            .channel('qa-results-changes')
            .on(
                'postgres_changes',
                {
                    event: '*', // Listen to INSERT, UPDATE, DELETE
                    schema: 'public',
                    table: 'QA Results'
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

    // Calculate Review Queue Count
    const reviewQueueCount = useMemo(() => {
        return calls.filter(c => {
            // If manual QA status is set to final state, it's NOT in queue
            if (c.qaStatus === 'approved' || c.qaStatus === 'rejected') return false;

            const statusLower = (c.status || '').toLowerCase();
            const isReviewStatus = statusLower.includes('review') || statusLower.includes('requires');

            // Medium risk score range (70-89%)
            const isMidRangeScore = c.complianceScore >= 70 && c.complianceScore < 90;

            return isReviewStatus || isMidRangeScore;
        }).length;
    }, [calls]);

    // Sync Review Count to Context
    useEffect(() => {
        setReviewCountFn(reviewQueueCount);
    }, [reviewQueueCount, setReviewCountFn]);


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

    // Agent review handler - can filter by specific agent or multiple risky agents
    const handleAgentReview = (agentName: string, riskyAgentNames?: string[]) => {
        if (riskyAgentNames && riskyAgentNames.length > 0) {
            // Filter by multiple risky agents (for risky agent watch list)
            setSelectedAgent('');
            setSelectedRiskyAgents(riskyAgentNames);
            setSelectedRiskLevel('');
        } else {
            // Filter by specific agent
            setSelectedAgent(agentName);
            setSelectedRiskyAgents([]);
            setSelectedRiskLevel('');
        }
        setSearchQuery('');
        setSelectedCampaign('');
        setMinScore(0);
        // Navigate to live feed view to show filtered calls
        router.push('/qa?view=live');
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
                    reviewedBy: profile?.first_name && profile?.last_name
                        ? `${profile.first_name} ${profile.last_name}`
                        : user?.displayName || user?.email || 'Unknown'
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
                    ? {
                        ...c,
                        qaStatus: status,
                        qaReviewedBy: profile?.first_name && profile?.last_name
                            ? `${profile.first_name} ${profile.last_name}`
                            : user?.displayName || user?.email || 'Unknown',
                        qaReviewedAt: new Date().toISOString()
                    }
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

    // Handle QA review submission from TranscriptDrawer
    const handleQASubmit = async (callId: string, reviewerName: string, notes?: string) => {
        try {
            console.log('Submitting QA review:', { callId, reviewerName, notes });

            const response = await fetch('/api/qa/update-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: callId,
                    status: 'approved',
                    notes,
                    reviewedBy: reviewerName
                })
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                console.error('QA review submission failed:', result.error);
                throw new Error(result.error || 'Failed to submit review');
            }

            // Update local state
            setCalls(prev => prev.map(c =>
                c.id === callId
                    ? {
                        ...c,
                        qaStatus: 'approved',
                        qaReviewedBy: reviewerName,
                        qaReviewedAt: new Date().toISOString(),
                        qaNotes: notes
                    }
                    : c
            ));

            // Also update selectedCall if it's the same call
            if (selectedCall && selectedCall.id === callId) {
                setSelectedCall(prev => prev ? {
                    ...prev,
                    qaStatus: 'approved',
                    qaReviewedBy: reviewerName,
                    qaReviewedAt: new Date().toISOString(),
                    qaNotes: notes
                } : null);
            }

        } catch (e: any) {
            console.error('QA review submission error:', e);
            throw e;
        }
    };

    // --- Time Range Filtering Logic for Metrics AND Live Feed ---
    const metricsCalls = useMemo(() => {
        // 'all' means no time filter
        if (timeRange === 'all') return calls;

        const now = new Date();
        const start = new Date();
        start.setHours(0, 0, 0, 0); // Reset to beginning of today

        if (timeRange === 'today') {
            // Already set to start of today
        } else if (timeRange === '7d') {
            start.setDate(now.getDate() - 6); // 7 days including today
        } else if (timeRange === '14d') {
            start.setDate(now.getDate() - 13);
        } else if (timeRange === '30d') {
            start.setDate(now.getDate() - 29);
        } else if (timeRange === '90d') {
            start.setDate(now.getDate() - 89);
        }

        return calls.filter(c => new Date(c.timestamp) >= start);
    }, [calls, timeRange]);


    // Computed stats with trends (Using metricsCalls)
    const stats = useMemo(() => {
        const total = metricsCalls.length;
        if (total === 0) return {
            avgScore: 0,
            complianceRate: 0,
            riskCount: 0,
            complianceCount: 0,
            trend: 0
        };

        const totalScore = metricsCalls.reduce((acc, curr) => acc + (curr.complianceScore || 0), 0);


        // Overall Compliance: 85%+ score (matches System Prompt)
        const complianceCount = metricsCalls.filter(c => isCallCompliant(c)).length;

        // Risk Detection: Align with High Risk labels in feed
        const riskCount = metricsCalls.filter(c => {
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

        // Trend Calculation: Compare selected period vs previous period of same length
        // e.g. if 7d is selected, compare last 7 days vs previous 7 days
        const now = new Date();
        const periodDays = timeRange === 'today' ? 1
            : timeRange === '7d' ? 7
                : timeRange === '14d' ? 14
                    : timeRange === '30d' ? 30
                        : 90;

        const periodStart = new Date();
        periodStart.setHours(0, 0, 0, 0);
        if (timeRange !== 'today') periodStart.setDate(periodStart.getDate() - (periodDays - 1));

        const prevPeriodStart = new Date(periodStart);
        prevPeriodStart.setDate(prevPeriodStart.getDate() - periodDays);

        const prevPeriodEnd = new Date(periodStart);
        // End of previous period is start of current period (exclusive in filter, inclusive logic)

        const currentPeriodCount = metricsCalls.length;
        const prevPeriodCount = calls.filter(c => {
            const d = new Date(c.timestamp);
            return d >= prevPeriodStart && d < periodStart;
        }).length;

        const trend = prevPeriodCount > 0
            ? Math.round(((currentPeriodCount - prevPeriodCount) / prevPeriodCount) * 100)
            : (currentPeriodCount > 0 ? 100 : 0);

        return {
            avgScore: Math.round(totalScore / total),
            complianceRate: Math.round((complianceCount / total) * 100),
            riskCount,
            complianceCount,
            trend
        };
    }, [metricsCalls, calls, timeRange]);

    // QA Validation Stats - Track validations per agent
    const validationStats = useMemo(() => {
        // Get current user's display name for matching
        const currentUserName = profile?.first_name && profile?.last_name
            ? `${profile.first_name} ${profile.last_name}`
            : user?.displayName || '';

        // Total team validations (all approved/rejected calls)
        const teamValidations = calls.filter(c => c.qaStatus === 'approved' || c.qaStatus === 'rejected').length;

        // Current user's validations
        const myValidations = calls.filter(c =>
            (c.qaStatus === 'approved' || c.qaStatus === 'rejected') &&
            c.qaReviewedBy &&
            c.qaReviewedBy.toLowerCase() === currentUserName.toLowerCase()
        ).length;

        // Validations within the selected time range
        const periodTeamValidations = metricsCalls.filter(c => c.qaStatus === 'approved' || c.qaStatus === 'rejected').length;
        const periodMyValidations = metricsCalls.filter(c =>
            (c.qaStatus === 'approved' || c.qaStatus === 'rejected') &&
            c.qaReviewedBy &&
            c.qaReviewedBy.toLowerCase() === currentUserName.toLowerCase()
        ).length;

        return {
            myValidations,
            teamValidations,
            periodMyValidations,
            periodTeamValidations
        };
    }, [calls, metricsCalls, profile, user]);

    const uniqueAgents = useMemo(() => Array.from(new Set(calls.map(c => c.agentName))), [calls]);
    const uniqueCampaigns = useMemo(() => Array.from(new Set(calls.map(c => c.campaignType))), [calls]);
    const uniqueProductTypes = useMemo(() => Array.from(new Set(calls.map(c => c.productType).filter(Boolean))), [calls]);
    const uniqueTags = useMemo(() => Array.from(new Set(calls.map(c => c.tag).filter(Boolean))), [calls]);

    const filteredCalls = useMemo(() => {
        // Apply additional filters on top of the time-filtered metricsCalls
        return metricsCalls.filter(c => {
            // If filtering by risky agents, match any agent in the list
            // Aggressive normalization matching AgentScoreboard logic
            const normalizeForMatch = (name: string): string => {
                return name
                    .trim()
                    .replace(/\s+/g, ' ')
                    .replace(/[\u200B-\u200D\uFEFF]/g, '')
                    .normalize('NFKC')
                    .toLowerCase();
            };
            const matchesRiskyAgents = selectedRiskyAgents.length > 0
                ? selectedRiskyAgents.some(name => {
                    const normalizedCallAgent = normalizeForMatch(c.agentName || '');
                    const normalizedFilterName = normalizeForMatch(name);
                    return normalizedCallAgent === normalizedFilterName;
                })
                : true;

            const matchesAgent = selectedAgent ? c.agentName === selectedAgent : true;
            const matchesCampaign = selectedCampaign ? c.campaignType === selectedCampaign : true;
            const matchesProductType = selectedProductType ? c.productType === selectedProductType : true;
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
            const matchesTag = selectedTag ? c.tag === selectedTag : true;

            return matchesRiskyAgents && matchesAgent && matchesCampaign && matchesProductType && matchesTag && matchesSearch && matchesDate && matchesScore && matchesRisk;
        });
    }, [metricsCalls, selectedAgent, selectedCampaign, selectedProductType, selectedTag, searchQuery, dateRange, minScore, selectedRiskLevel, selectedRiskyAgents]);

    // Get greeting
    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Good morning";
        if (hour < 17) return "Good afternoon";
        return "Good evening";
    };

    const userName = settingsName?.split(' ')[0] || profile?.first_name || user?.displayName?.split(" ")[0] || "QA Specialist";

    // Render content based on current view
    const renderContent = () => {
        switch (currentView) {
            case 'dashboard':
                return (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
                        {/* Greeting & Header Controls */}
                        <div className="flex flex-col gap-6">
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

                                    {/* Time Range Selector */}
                                    <div className="flex items-center gap-1 mt-2 bg-black/40 border border-white/5 rounded-lg p-1 w-fit">
                                        {(['today', '7d', '14d', '30d', '90d', 'all'] as TimeRange[]).map((range) => (
                                            <button
                                                key={range}
                                                onClick={() => setTimeRange(range)}
                                                className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all duration-200
                                                    ${timeRange === range
                                                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50'
                                                        : 'text-white/40 hover:text-white hover:bg-white/5'
                                                    }`}
                                            >
                                                {range === 'today' ? 'Today' : range === 'all' ? 'All' : range.toUpperCase()}
                                            </button>
                                        ))}
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
                        </div>

                        {/* Metric Cards - Uses metricsCalls via stats */}
                        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6">
                            <DashboardMetricCard
                                title="Total Analyzed"
                                value={metricsCalls.length}
                                subLabel="Calls Processed"
                                color="#8b5cf6"
                                trend={{ label: "vs prev period", value: stats.trend }}
                            />
                            <DashboardMetricCard
                                title="Met Compliance"
                                value={stats.complianceCount}
                                subLabel="Score 85%+"
                                color="#10b981"
                            />
                            <DashboardMetricCard
                                title="Risk Detected"
                                value={stats.riskCount}
                                subLabel="High Risk Interactions"
                                color="#f43f5e"
                            />
                            <DashboardMetricCard
                                title="Review Queue"
                                value={reviewQueueCount}
                                subLabel="Pending QA Agent Review"
                                color="#ec4899"
                            />
                            <DashboardMetricCard
                                title="Your Validations"
                                value={validationStats.periodMyValidations}
                                subLabel="Calls You Reviewed"
                                color="#06b6d4"
                            />
                            <DashboardMetricCard
                                title="Team Validations"
                                value={validationStats.periodTeamValidations}
                                subLabel="Total Team Reviews"
                                color="#f59e0b"
                            />
                        </div>

                        {/* Gauge Cluster - Uses metricsCalls via stats */}
                        <GaugeCluster gauges={[
                            { label: "Avg. Quality", value: stats.avgScore, color: "#8b5cf6", description: "Mean score across all analyzed calls" },
                            { label: "Compliance Rate", value: stats.complianceRate, color: "#10b981", description: "% of calls achieving 85%+ (Compliant)" },
                            { label: "Risk Factor", value: metricsCalls.length > 0 ? Math.round((stats.riskCount / metricsCalls.length) * 100) : 0, color: "#f43f5e", description: "% of calls flagged as high risk" },
                            { label: "Manual Source", value: metricsCalls.length > 0 ? Math.round((metricsCalls.filter(c => c.uploadType === 'manual').length / metricsCalls.length) * 100) : 0, color: "#d946ef", description: "Manually uploaded recordings" },
                            { label: "Dialer Source", value: metricsCalls.length > 0 ? Math.round((metricsCalls.filter(c => c.uploadType === 'automated').length / metricsCalls.length) * 100) : 0, color: "#06b6d4", description: "Ingested via Dialer/API" }
                        ]} />

                        {/* Trend Chart - Uses metricsCalls */}
                        <ComplianceTrendChart calls={metricsCalls} />

                        {/* Recent Calls Table - Uses filteredCalls (View Independent) */}
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
                                selectedProductType={selectedProductType}
                                onProductTypeChange={setSelectedProductType}
                                availableProductTypes={uniqueProductTypes}
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
                        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0F0720]/80 backdrop-blur-xl shadow-2xl">
                            {/* Gradient glow effect */}
                            <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-purple-500/10 via-blue-500/5 to-transparent pointer-events-none" />
                            <div className="absolute -top-24 -right-24 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />

                            <div className="relative p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                                <div className="flex items-center gap-5">
                                    <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center border border-purple-500/30 shadow-lg shadow-purple-900/20">
                                        <Activity className="text-purple-400" size={28} />
                                    </div>
                                    <div>
                                        <h2 className="text-3xl font-black text-white tracking-tight">Live Operations Center</h2>
                                        <p className="text-white/50 text-sm mt-1 font-medium">Real-time call monitoring & quality analysis</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    {selectedRiskyAgents.length > 0 && (
                                        <div className="flex items-center gap-2 text-xs font-bold text-rose-400 bg-rose-950/40 border border-rose-500/30 px-4 py-2.5 rounded-xl">
                                            <AlertTriangle size={14} />
                                            Viewing {selectedRiskyAgents.length} Risky Agents
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 bg-emerald-950/30 border border-emerald-500/30 px-4 py-2.5 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                                        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_10px_#34d399]" />
                                        SYSTEM ONLINE
                                    </div>
                                </div>
                            </div>

                            {/* Stats bar */}
                            <div className="relative border-t border-white/5 bg-black/30 px-8 py-5 flex items-center gap-10">
                                <div className="flex flex-col">
                                    <span className="text-white/70 text-sm font-bold uppercase tracking-wider">Total Calls</span>
                                    <span className="text-white text-lg font-medium">{filteredCalls.length}</span>
                                </div>
                                <div className="w-px h-8 bg-white/10" />
                                <div className="flex flex-col">
                                    <span className="text-rose-300/90 text-sm font-bold uppercase tracking-wider">High Risk</span>
                                    <span className="text-rose-400 text-lg font-medium">{filteredCalls.filter(c => (c.riskLevel || '').toLowerCase() === 'high' || (c.riskLevel || '').toLowerCase() === 'critical').length}</span>
                                </div>
                                <div className="w-px h-8 bg-white/10" />
                                <div className="flex flex-col">
                                    <span className="text-purple-300/90 text-sm font-bold uppercase tracking-wider">Avg Score</span>
                                    <span className="text-purple-400 text-lg font-medium">{filteredCalls.length > 0 ? Math.round(filteredCalls.reduce((acc, c) => acc + c.complianceScore, 0) / filteredCalls.length) : 0}%</span>
                                </div>
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
                                selectedProductType={selectedProductType}
                                onProductTypeChange={setSelectedProductType}
                                availableProductTypes={uniqueProductTypes}
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
                    const isFinalized = c.qaStatus === 'approved' || c.qaStatus === 'rejected';

                    // Tab 1: PENDING (Queue)
                    if (reviewQueueTab === 'pending') {
                        // 1. Exclude finalized items
                        if (isFinalized) return false;

                        // 2. EXPLICIT EXCLUSION: High Compliance (90-100%) should NOT be in review queue
                        if (c.complianceScore >= 90) return false;

                        // 3. Include review-needed status
                        const statusLower = (c.status || '').toLowerCase();
                        const isReviewStatus = statusLower.includes('review') || statusLower.includes('requires');

                        // 4. Include medium risk score (70-89%)
                        const isMidRangeScore = c.complianceScore >= 70 && c.complianceScore < 90;

                        return isReviewStatus || isMidRangeScore;
                    }

                    // Tab 2: REVIEWED (History)
                    else {
                        return isFinalized;
                    }
                });
                // Calculate global stats for the view
                const totalReviewedCount = calls.filter(c => c.qaStatus === 'approved' || c.qaStatus === 'rejected').length;

                const totalPendingCount = calls.filter(c => {
                    if (c.qaStatus === 'approved' || c.qaStatus === 'rejected') return false;
                    if (c.complianceScore >= 90) return false;
                    const statusLower = (c.status || '').toLowerCase();
                    const isReviewStatus = statusLower.includes('review') || statusLower.includes('requires');
                    const isMidRangeScore = c.complianceScore >= 70 && c.complianceScore < 90;
                    return isReviewStatus || isMidRangeScore;
                }).length;

                return (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
                        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0F0720]/80 backdrop-blur-xl shadow-2xl">
                            {/* Gradient glow effect - rose/pink for modern review feel */}
                            <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-rose-500/10 via-pink-500/5 to-transparent pointer-events-none" />
                            <div className="absolute -top-24 -right-24 w-48 h-48 bg-rose-500/20 rounded-full blur-3xl pointer-events-none" />

                            <div className="relative p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                                <div className="flex items-center gap-5">
                                    <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-rose-500/20 to-pink-500/20 flex items-center justify-center border border-rose-500/30 shadow-lg shadow-rose-900/20">
                                        <ClipboardCheck className="text-rose-400" size={28} />
                                    </div>
                                    <div>
                                        <h2 className="text-3xl font-black text-white tracking-tight">Review Queue</h2>
                                        <p className="text-white/60 text-sm mt-1 font-medium">Manual QA validation required</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    {/* Queue Toggle Switch */}
                                    <div className="flex bg-black/40 p-1 rounded-xl border border-white/10">
                                        <button
                                            onClick={() => setReviewQueueTab('pending')}
                                            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-300 ${reviewQueueTab === 'pending'
                                                ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25'
                                                : 'text-white/70 hover:text-white hover:bg-white/10'
                                                }`}
                                        >
                                            Pending
                                        </button>
                                        <button
                                            onClick={() => setReviewQueueTab('reviewed')}
                                            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-300 ${reviewQueueTab === 'reviewed'
                                                ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25'
                                                : 'text-white/70 hover:text-white hover:bg-white/10'
                                                }`}
                                        >
                                            Reviewed
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Stats bar */}
                            <div className="relative border-t border-white/5 bg-black/20 px-8 py-5 flex items-center gap-10 text-sm">
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-white/70 font-bold uppercase tracking-widest text-[10px]">Pending Reviews</span>
                                    <span className="self-start px-3 py-0.5 rounded-md bg-rose-500/10 text-rose-400 font-extrabold text-lg border border-rose-500/10 shadow-[0_0_10px_rgba(244,63,94,0.1)]">
                                        {totalPendingCount}
                                    </span>
                                </div>
                                <div className="w-px h-10 bg-white/5" />
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-white/70 font-bold uppercase tracking-widest text-[10px]">Reviewed</span>
                                    <span className="self-start px-3 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 font-extrabold text-lg border border-emerald-500/10 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                                        {totalReviewedCount}
                                    </span>
                                </div>
                                <div className="w-px h-10 bg-white/5" />
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-white/70 font-bold uppercase tracking-widest text-[10px]">Critical (Below 50%)</span>
                                    <span className="self-start px-3 py-0.5 rounded-md bg-rose-500/10 text-rose-400 font-extrabold text-lg border border-rose-500/10">
                                        {calls.filter(c => c.complianceScore < 50).length}
                                    </span>
                                </div>
                                <div className="w-px h-10 bg-white/5" />
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-white/70 font-bold uppercase tracking-widest text-[10px]">Avg Score</span>
                                    <span className="self-start px-3 py-0.5 rounded-md bg-purple-500/10 text-purple-300 font-extrabold text-lg border border-purple-500/10">
                                        {calls.length > 0 ? Math.round(calls.reduce((acc, c) => acc + c.complianceScore, 0) / calls.length) : 0}%
                                    </span>
                                </div>
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
                                selectedProductType={selectedProductType}
                                onProductTypeChange={setSelectedProductType}
                                availableProductTypes={uniqueProductTypes}
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
                                showQAColumn={true}
                            />
                        </div>
                    </div>
                );
            case 'agents':
                return <AgentScoreboard calls={calls} onReviewAgent={handleAgentReview} />;
            case 'reports':
                return <ReportsView calls={filteredCalls} />;
            case 'messages':
                return <MessagesView />;
            case 'settings':
                return <SettingsView />;
            case 'aura':
                return <AuraChat />;
            default:
                return null;
        }
    };

    return (
        <DashboardLayout>
            <div className="flex flex-col h-full">
                {/* Main content */}
                <div className={`flex-1 ${currentView === 'aura' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
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
                    // Immediate refresh
                    fetchCalls(true);
                    // Follow-up refreshes to catch any database propagation delays
                    setTimeout(() => fetchCalls(true), 2000);
                    setTimeout(() => fetchCalls(true), 5000);
                    setTimeout(() => fetchCalls(true), 10000);
                }}
            />

            {selectedCall && (
                <TranscriptDrawer
                    call={selectedCall}
                    onClose={() => setSelectedCall(null)}
                    onScoreUpdate={handleScoreUpdate}
                    onQASubmit={handleQASubmit}
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
