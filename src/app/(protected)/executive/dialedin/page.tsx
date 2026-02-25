"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import BloombergHeader from "@/components/dialedin/BloombergHeader";
import KPITicker from "@/components/dialedin/KPITicker";
import TeamComparisonPanel from "@/components/dialedin/TeamComparisonPanel";
import TPHDistributionPanel from "@/components/dialedin/TPHDistributionPanel";
import TrendLineChart from "@/components/dialedin/TrendLineChart";
import AgentRankingTable from "@/components/dialedin/AgentRankingTable";
import AgentDetailCard from "@/components/dialedin/AgentDetailCard";
import InsightsPanel from "@/components/dialedin/InsightsPanel";
import AlertTicker from "@/components/dialedin/AlertTicker";
import LivePresencePanel from "@/components/dialedin/LivePresencePanel";
import AnalyticsWorkspace from "@/components/dialedin/AnalyticsWorkspace";
import CoachingWorkspace from "@/components/dialedin/CoachingWorkspace";
import RevenueWorkspace from "@/components/dialedin/RevenueWorkspace";
import { useLiveData } from "@/hooks/useLiveData";
import { Upload, Loader2, CheckCircle2, XCircle, FileSpreadsheet, X } from "lucide-react";
import type { DailyKPIs, AgentPerformance, Anomaly, Alert, Workspace, AgentTrend, WoWComparison, AgentQAStats, LiveAgentStatus } from "@/types/dialedin-types";

interface UploadResult {
  filename: string;
  reportType: string;
  rowCount: number;
  success: boolean;
  error?: string;
}

export default function DialedinDashboard() {
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [dateRange, setDateRange] = useState("7d");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace>("live");

  // Upload state
  const [showUpload, setShowUpload] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data states
  const [kpis, setKpis] = useState<DailyKPIs | null>(null);
  const [trendData, setTrendData] = useState<DailyKPIs[]>([]);
  const [agents, setAgents] = useState<AgentPerformance[]>([]);
  const [wages, setWages] = useState<Record<string, number>>({});
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [alerts, setAlerts] = useState<(Alert & { dialedin_alert_rules?: { name: string; description: string | null } })[]>([]);

  // Analytics data
  const [agentTrends, setAgentTrends] = useState<Record<string, AgentTrend>>({});
  const [wow, setWow] = useState<WoWComparison | null>(null);
  const [qaStats, setQaStats] = useState<Record<string, AgentQAStats>>({});

  // Interactive state
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentPerformance | null>(null);
  const [showInsights, setShowInsights] = useState(false);

  // Live webhook data (polls every 30s)
  const { liveMetrics, agentStatuses, recentEvents, hasLiveData, lastUpdated } = useLiveData({ interval: 30000 });

  // Build lookup map for live agent statuses keyed by lowercase name
  const liveStatusMap = useMemo(() => {
    const map: Record<string, LiveAgentStatus> = {};
    for (const s of agentStatuses) {
      map[s.agent_name.toLowerCase()] = s;
    }
    return map;
  }, [agentStatuses]);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const trendRes = await fetch(`/api/dialedin/kpis?range=${dateRange}`);
      const trendJson = await trendRes.json();
      const trendItems: DailyKPIs[] = trendJson.data || [];
      setTrendData(trendItems);

      const latestDate = selectedDate || (trendItems.length > 0 ? trendItems[0].report_date : null);

      if (latestDate) {
        const latestKpis = trendItems.find((d) => d.report_date === latestDate) || null;
        setKpis(latestKpis);
        if (!selectedDate && latestDate) setSelectedDate(latestDate);

        const [agentsRes, anomaliesRes, alertsRes, trendsRes, wowRes, qaRes] = await Promise.all([
          fetch(`/api/dialedin/agents?date=${latestDate}&sort=tph&limit=600&include_wage=true`),
          fetch(`/api/dialedin/anomalies?date=${latestDate}`),
          fetch(`/api/dialedin/alerts?unacknowledged=true&limit=20`),
          fetch(`/api/dialedin/agent-trends?date=${latestDate}&days=30&limit=50`),
          fetch(`/api/dialedin/wow`),
          fetch(`/api/dialedin/qa-stats?days=30`),
        ]);

        const [agentsJson, anomaliesJson, alertsJson, trendsJson, wowJson, qaJson] = await Promise.all([
          agentsRes.json(),
          anomaliesRes.json(),
          alertsRes.json(),
          trendsRes.json(),
          wowRes.json(),
          qaRes.json(),
        ]);

        setAgents(agentsJson.data || []);
        setWages(agentsJson.wages || {});
        setAnomalies(anomaliesJson.data || []);
        setAlerts(alertsJson.data || []);
        setAgentTrends(trendsJson.data || {});
        setWow(wowJson.data || null);
        setQaStats(qaJson.data || {});
      } else {
        setKpis(null);
        setAgents([]);
        setAnomalies([]);
        setAgentTrends({});
        setWow(null);
        setQaStats({});
      }
    } catch (err) {
      console.error("Failed to fetch DialedIn data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate, dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleUploadFiles = async (files: File[]) => {
    setUploading(true);
    setUploadResults([]);
    const formData = new FormData();
    for (const f of files) formData.append("files", f);
    try {
      const res = await fetch("/api/dialedin/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (json.files) setUploadResults(json.files);
      else if (json.error) setUploadResults([{ filename: files[0]?.name || "unknown", reportType: "", rowCount: 0, success: false, error: json.error }]);
      if (json.files?.some((f: UploadResult) => f.success)) fetchData(true);
    } catch (err) {
      console.error("Upload error:", err);
      setUploadResults([{ filename: files[0]?.name || "Upload failed", reportType: "", rowCount: 0, success: false, error: String(err) }]);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(
      (f) => f.name.endsWith(".xls") || f.name.endsWith(".xlsx") || f.name.endsWith(".csv"),
    );
    if (files.length > 0) handleUploadFiles(files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) handleUploadFiles(files);
    e.target.value = "";
  };

  return (
    <DashboardLayout>
      {/* Cancel DashboardLayout padding, fill viewport below header */}
      <div className="-m-8 -mb-20 h-[calc(100vh-80px)] flex flex-col bg-[#050a12] overflow-hidden">
        {/* Bloomberg Header */}
        <BloombergHeader
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          dateRange={dateRange}
          onRangeChange={setDateRange}
          onUploadClick={() => { setShowUpload(!showUpload); setUploadResults([]); }}
          onInsightsClick={() => { setShowInsights(!showInsights); setSelectedAgent(null); }}
          onRefresh={() => fetchData(true)}
          refreshing={refreshing}
          showUpload={showUpload}
          showInsights={showInsights}
          workspace={workspace}
          onWorkspaceChange={setWorkspace}
        />

        {/* Upload Panel (conditional) */}
        {showUpload && (
          <div className="border-b border-[#1a2332] bg-[#0c1018] px-3 py-2 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] uppercase tracking-wider text-white/30 font-mono">Upload Reports</span>
              <button onClick={() => setShowUpload(false)} className="text-white/20 hover:text-white/40">
                <X size={12} />
              </button>
            </div>
            <div
              className={`border border-dashed p-4 text-center cursor-pointer transition-colors ${
                isDragging ? "border-amber-400/50 bg-amber-400/5" : "border-[#1a2332] hover:border-white/20"
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" multiple accept=".xls,.xlsx,.csv" onChange={handleFileSelect} className="hidden" />
              {uploading ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 size={14} className="text-amber-400 animate-spin" />
                  <span className="text-white/40 text-[10px] font-mono">PROCESSING...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <Upload size={14} className="text-white/20" />
                  <span className="text-white/30 text-[10px] font-mono">
                    Drop .xls / .xlsx / .csv or click to browse
                  </span>
                </div>
              )}
            </div>
            {uploadResults.length > 0 && (
              <div className="mt-2 space-y-1">
                {uploadResults.map((r, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[10px] font-mono">
                    {r.success ? <CheckCircle2 size={10} className="text-emerald-400" /> : <XCircle size={10} className="text-red-400" />}
                    <FileSpreadsheet size={10} className="text-white/20" />
                    <span className="text-white/50 truncate">{r.filename}</span>
                    {r.success && <span className="text-white/25 ml-auto">{r.reportType} — {r.rowCount} rows</span>}
                    {r.error && <span className="text-red-400/60 ml-auto">{r.error}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* KPI Ticker — persists across all workspaces */}
        <KPITicker kpis={kpis} loading={loading} wow={wow} liveMetrics={liveMetrics} />

        {/* Alert Ticker — persists across all workspaces */}
        <div className="shrink-0">
          <AlertTicker anomalies={anomalies} alerts={alerts} liveEvents={recentEvents} />
        </div>

        {/* Workspace Content */}
        {workspace === "live" && (
          <>
            {/* Middle Row: Live Presence or Team Comparison + TPH Distribution */}
            <div className="grid grid-cols-2 h-[200px] shrink-0">
              {hasLiveData ? (
                <LivePresencePanel
                  agentStatuses={agentStatuses}
                  hasLiveData={hasLiveData}
                  lastUpdated={lastUpdated}
                />
              ) : (
                <TeamComparisonPanel
                  agents={agents}
                  selectedTeam={selectedTeam}
                  onSelectTeam={setSelectedTeam}
                />
              )}
              <TPHDistributionPanel
                agents={agents}
                distribution={kpis?.distribution || null}
              />
            </div>

            {/* Trend Chart */}
            <div className="shrink-0">
              <TrendLineChart data={trendData} loading={loading} />
            </div>

            {/* Agent Table + Detail Card (relative container) */}
            <div className="flex-1 min-h-0 relative">
              <AgentRankingTable
                agents={agents}
                selectedTeam={selectedTeam}
                onSelectAgent={(agent) => { setSelectedAgent(agent); setShowInsights(false); }}
                loading={loading}
                wages={wages}
                sparklines={agentTrends}
                qaStats={qaStats}
                liveStatuses={liveStatusMap}
              />
              <AgentDetailCard
                agent={selectedAgent}
                onClose={() => setSelectedAgent(null)}
                wages={wages}
                qaStats={qaStats}
              />
              {showInsights && (
                <InsightsPanel
                  kpis={kpis}
                  agents={agents}
                  date={selectedDate}
                  onClose={() => setShowInsights(false)}
                />
              )}
            </div>
          </>
        )}

        {workspace === "analytics" && (
          <AnalyticsWorkspace wow={wow} />
        )}

        {workspace === "coaching" && (
          <CoachingWorkspace trends={agentTrends} />
        )}

        {workspace === "revenue" && (
          <RevenueWorkspace />
        )}

        {/* Empty State */}
        {!loading && !kpis && workspace === "live" && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-[#050a12]/90">
            <div className="text-center">
              <div className="text-[9px] uppercase tracking-wider text-white/15 font-mono mb-2">NO DATA</div>
              <button
                onClick={() => setShowUpload(true)}
                className="text-[10px] font-mono text-amber-400/60 hover:text-amber-400 border border-amber-400/20 px-3 py-1 transition-colors"
              >
                UPLOAD REPORTS
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
