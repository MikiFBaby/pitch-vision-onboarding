"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import KPICards from "@/components/dialedin/KPICards";
import AgentRankingTable from "@/components/dialedin/AgentRankingTable";
import TrendLineChart from "@/components/dialedin/TrendLineChart";
import DispositionChart from "@/components/dialedin/DispositionChart";
import SkillBreakdownChart from "@/components/dialedin/SkillBreakdownChart";
import CampaignBreakdown from "@/components/dialedin/CampaignBreakdown";
import AnomalyAlertsBanner from "@/components/dialedin/AnomalyAlertsBanner";
import AlertsPanel from "@/components/dialedin/AlertsPanel";
import ReportChecklist from "@/components/dialedin/ReportChecklist";
import { Calendar, RefreshCw, Upload, FileSpreadsheet, CheckCircle2, XCircle, Loader2, X, Info } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { DailyKPIs, AgentPerformance, SkillSummary, Anomaly, Alert } from "@/types/dialedin-types";

interface UploadResult {
  filename: string;
  reportType: string;
  rowCount: number;
  success: boolean;
  error?: string;
}

interface ChecklistReport {
  type: string;
  received: boolean;
  rows?: number;
  receivedAt?: string;
}

interface ChecklistData {
  date: string;
  received: number;
  total: number;
  complete: boolean;
  computed: boolean;
  computedAt?: string | null;
  reports: ChecklistReport[];
}

export default function DialedinDashboard() {
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [dateRange, setDateRange] = useState("7d");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Upload panel state
  const [showUpload, setShowUpload] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Checklist state
  const [checklist, setChecklist] = useState<ChecklistData | null>(null);

  // Data states
  const [kpis, setKpis] = useState<DailyKPIs | null>(null);
  const [trendData, setTrendData] = useState<DailyKPIs[]>([]);
  const [agents, setAgents] = useState<AgentPerformance[]>([]);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [alerts, setAlerts] = useState<(Alert & { dialedin_alert_rules?: { name: string; description: string | null } })[]>([]);
  const [rawData, setRawData] = useState<Record<string, unknown>>({});

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // Fetch KPI trend data for date range
      const trendRes = await fetch(`/api/dialedin/kpis?range=${dateRange}`);
      const trendJson = await trendRes.json();
      const trendItems: DailyKPIs[] = trendJson.data || [];
      setTrendData(trendItems);

      // Use most recent date or selected date
      const latestDate = selectedDate || (trendItems.length > 0 ? trendItems[0].report_date : null);

      if (latestDate) {
        // Set the latest KPIs + raw_data
        const latestRaw = (trendJson.data || []).find((d: Record<string, unknown>) => d.report_date === latestDate);
        const latestKpis = trendItems.find((d) => d.report_date === latestDate) || null;
        setKpis(latestKpis);
        setRawData((latestRaw?.raw_data as Record<string, unknown>) || {});
        if (!selectedDate && latestDate) {
          setSelectedDate(latestDate);
        }

        // Fetch checklist, agent performance, skills, anomalies, alerts in parallel
        const [checklistRes, agentsRes, skillsRes, anomaliesRes, alertsRes] = await Promise.all([
          fetch(`/api/dialedin/checklist?date=${latestDate}`),
          fetch(`/api/dialedin/agents?date=${latestDate}&sort=tph&limit=200`),
          fetch(`/api/dialedin/skills?date=${latestDate}`),
          fetch(`/api/dialedin/anomalies?date=${latestDate}`),
          fetch(`/api/dialedin/alerts?unacknowledged=true&limit=20`),
        ]);

        const [checklistJson, agentsJson, skillsJson, anomaliesJson, alertsJson] = await Promise.all([
          checklistRes.json(),
          agentsRes.json(),
          skillsRes.json(),
          anomaliesRes.json(),
          alertsRes.json(),
        ]);

        setChecklist(checklistJson);
        setAgents(agentsJson.data || []);
        setSkills(skillsJson.data || []);
        setAnomalies(anomaliesJson.data || []);
        setAlerts(alertsJson.data || []);
      } else {
        setChecklist(null);
        setKpis(null);
        setAgents([]);
        setSkills([]);
        setAnomalies([]);
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

  const handleAlertAck = (alertId: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  };

  const handleUploadFiles = async (files: File[]) => {
    setUploading(true);
    setUploadResults([]);
    const formData = new FormData();
    for (const f of files) formData.append("files", f);
    try {
      const res = await fetch("/api/dialedin/upload", { method: "POST", body: formData });
      const json = await res.json();
      console.log("Upload response:", json);
      if (json.files) {
        setUploadResults(json.files);
      } else if (json.error) {
        setUploadResults([{ filename: files[0]?.name || "unknown", reportType: "", rowCount: 0, success: false, error: json.error }]);
      }
      // Refresh dashboard data after successful upload
      if (json.files?.some((f: UploadResult) => f.success)) {
        fetchData(true);
      }
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
      <div className="space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start justify-between"
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-3xl font-bold tracking-tight text-white">
              DialedIn Analytics
              <span className="inline-block ml-2 w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            </h2>
            <p className="text-white/50 text-sm font-medium">
              Chase dialer performance — real-time KPIs, agent rankings, and anomaly detection
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Date selector */}
            <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5">
              <Calendar size={14} className="text-white/40" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-white/70 text-sm outline-none [color-scheme:dark]"
              />
            </div>

            {/* Range selector */}
            <div className="flex bg-white/[0.03] border border-white/10 rounded-lg overflow-hidden">
              {["7d", "14d", "30d"].map((range) => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  className={`px-3 py-1.5 text-xs transition-colors ${
                    dateRange === range
                      ? "bg-indigo-500/20 text-indigo-400"
                      : "text-white/40 hover:text-white/60"
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>

            {/* Upload button */}
            <button
              onClick={() => { setShowUpload(!showUpload); setUploadResults([]); }}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm border rounded-lg transition-colors ${
                showUpload
                  ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/30"
                  : "text-white/50 border-white/10 hover:text-white/70 hover:bg-white/[0.02]"
              }`}
            >
              <Upload size={14} />
              Upload
            </button>

            {/* Refresh button */}
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="p-2 text-white/40 hover:text-white/70 border border-white/10 rounded-lg hover:bg-white/[0.02] transition-colors"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            </button>
          </div>
        </motion.div>

        {/* Inline Upload Panel */}
        <AnimatePresence>
          {showUpload && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white/80 font-medium text-sm">Upload XLS Reports</h3>
                  <button onClick={() => setShowUpload(false)} className="text-white/30 hover:text-white/60">
                    <X size={16} />
                  </button>
                </div>
                <div
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                    isDragging
                      ? "border-indigo-400 bg-indigo-500/10"
                      : "border-white/10 hover:border-white/20"
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".xls,.xlsx,.csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  {uploading ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 size={32} className="text-indigo-400 animate-spin" />
                      <p className="text-white/50 text-sm">Processing reports...</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload size={32} className={isDragging ? "text-indigo-400" : "text-white/20"} />
                      <p className="text-white/50 text-sm">
                        Drop <span className="text-white/80">.xls</span> / <span className="text-white/80">.xlsx</span> / <span className="text-white/80">.csv</span> files here, or click to browse
                      </p>
                      <p className="text-white/25 text-xs">
                        All 12 DialedIn report types supported
                      </p>
                    </div>
                  )}
                </div>
                {/* Upload results */}
                {uploadResults.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {uploadResults.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        {r.success ? (
                          <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle size={14} className="text-red-400 shrink-0" />
                        )}
                        <FileSpreadsheet size={14} className="text-white/30 shrink-0" />
                        <span className="text-white/70 truncate">{r.filename}</span>
                        {r.success && (
                          <span className="text-white/40 text-xs ml-auto">{r.reportType} — {r.rowCount} rows</span>
                        )}
                        {r.error && (
                          <span className="text-red-400/70 text-xs ml-auto">{r.error}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Report Checklist */}
        {selectedDate && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
          >
            <ReportChecklist
              date={selectedDate}
              received={checklist?.received ?? 0}
              total={checklist?.total ?? 12}
              complete={checklist?.complete ?? false}
              computed={checklist?.computed ?? false}
              computedAt={checklist?.computedAt}
              reports={checklist?.reports ?? []}
              loading={loading}
            />
          </motion.div>
        )}

        {/* Partial Data Indicator */}
        {kpis?.is_partial && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <Info size={14} className="text-amber-400 shrink-0" />
            <span className="text-amber-300/80 text-sm">
              Partial data — Agent Summary only. Disposition metrics unavailable.
            </span>
          </div>
        )}

        {/* KPI Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <KPICards kpis={kpis} loading={loading} rawData={rawData} />
        </motion.div>

        {/* Anomaly Banner */}
        {anomalies.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <AnomalyAlertsBanner anomalies={anomalies} />
          </motion.div>
        )}

        {/* Charts Row: Trend + Dispositions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        >
          <div className="lg:col-span-2">
            <TrendLineChart data={trendData} loading={loading} />
          </div>
          <div>
            <DispositionChart
              dispositions={kpis?.dispositions || {}}
              loading={loading}
            />
          </div>
        </motion.div>

        {/* Agent Ranking Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <AgentRankingTable agents={agents} loading={loading} />
        </motion.div>

        {/* Campaign Breakdown */}
        {((rawData?.campaigns as unknown[]) || []).length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <CampaignBreakdown
              campaigns={(rawData.campaigns as Array<{
                campaign: string; campaign_type?: string; reps: number; man_hours: number;
                dialed?: number; connects: number; contacts: number; transfers: number;
                hangups?: number; connect_pct: number; conversion_rate_pct: number;
                drop_rate_pct: number; avg_wait_time_min: number;
              }>) || []}
              aggregate={rawData.campaign_aggregate as {
                total_campaigns: number; total_system_connects: number;
                total_system_dials: number; total_hangups: number;
                total_leads: number; total_transfers: number;
                total_man_hours: number; avg_drop_rate: number;
                avg_connect_rate: number; avg_noans_rate: number;
                avg_norb_rate: number;
              } | undefined}
              loading={loading}
            />
          </motion.div>
        )}

        {/* Skills + Alerts Row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        >
          <SkillBreakdownChart skills={skills} loading={loading} />
          <AlertsPanel alerts={alerts} loading={loading} onAcknowledge={handleAlertAck} />
        </motion.div>

        {/* Empty state when no data */}
        {!loading && !kpis && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <div className="text-white/20 text-6xl mb-4">📊</div>
            <h3 className="text-white/50 text-lg font-medium mb-2">No DialedIn data yet</h3>
            <p className="text-white/30 text-sm mb-4">
              Upload your first set of XLS reports to get started
            </p>
            <button
              onClick={() => setShowUpload(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500/20 text-indigo-400 rounded-lg hover:bg-indigo-500/30 transition-colors text-sm"
            >
              <Upload size={16} />
              Upload Reports
            </button>
          </motion.div>
        )}

        {/* Summary stats footer */}
        {kpis && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="space-y-4 pt-4 border-t border-white/5"
          >
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
              <MiniStat label="Total Contacts" value={kpis.total_contacts.toLocaleString()} />
              <MiniStat label="Total Transfers" value={kpis.total_transfers.toLocaleString()} />
              <MiniStat label="Contact Rate" value={`${kpis.contact_rate}%`} />
              <MiniStat label="Waste Rate" value={`${kpis.waste_rate}%`} warning={kpis.waste_rate > 50} />
              <MiniStat label="Dead Air" value={`${kpis.dead_air_ratio}%`} warning={kpis.dead_air_ratio > 30} />
              <MiniStat label="Hung Up" value={`${kpis.hung_up_ratio}%`} warning={kpis.hung_up_ratio > 10} />
              <MiniStat label="Transfer Success" value={`${kpis.transfer_success_rate}%`} />
              <MiniStat label="Dials/Hr" value={kpis.dials_per_hour.toFixed(0)} />
            </div>
            {/* Data Pipeline Summary */}
            {rawData.report_sources && (
              <div className="flex items-center justify-center gap-6 text-xs text-white/25 pt-2 border-t border-white/[0.03]">
                <span>ETL Pipeline: {(rawData.report_sources as Record<string, number>).total_source_rows || 0} source rows compressed</span>
                <span>|</span>
                <span>{Object.entries(rawData.report_sources as Record<string, number>).filter(([k, v]) => k !== "total_source_rows" && v > 0).length} report types ingested</span>
                <span>|</span>
                <span>{Object.keys(rawData).length} analytical sections</span>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </DashboardLayout>
  );
}

function MiniStat({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className="text-center">
      <p className={`text-lg font-bold ${warning ? "text-amber-400" : "text-white/80"}`}>{value}</p>
      <p className="text-white/30 text-xs">{label}</p>
    </div>
  );
}
