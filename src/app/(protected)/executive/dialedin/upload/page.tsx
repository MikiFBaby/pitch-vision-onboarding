"use client";

import { useState, useCallback, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

interface UploadResult {
  filename: string;
  reportType: string;
  rowCount: number;
  success: boolean;
  error?: string;
}

interface ReportRecord {
  id: string;
  filename: string;
  report_type: string;
  report_date: string;
  row_count: number | null;
  ingestion_source: string;
  ingestion_status: string;
  error_message: string | null;
  created_at: string;
}

export default function DialedinUploadPage() {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [summary, setSummary] = useState<{ agents: number; transfers: number; tph: number; anomalies: number } | null>(null);
  const [recentReports, setRecentReports] = useState<ReportRecord[]>([]);

  const fetchRecentReports = useCallback(async () => {
    try {
      const res = await fetch("/api/dialedin/reports?limit=20");
      const json = await res.json();
      if (json.data) setRecentReports(json.data);
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    fetchRecentReports();
  }, [fetchRecentReports]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files).filter(
      (f) => f.name.endsWith(".xls") || f.name.endsWith(".xlsx"),
    );
    if (files.length === 0) return;
    await uploadFiles(files);
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    await uploadFiles(files);
    e.target.value = "";
  }, []);

  async function uploadFiles(files: File[]) {
    setUploading(true);
    setResults([]);
    setSummary(null);

    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file);
    }

    try {
      const res = await fetch("/api/dialedin/upload", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();

      if (json.files) setResults(json.files);
      if (json.summary) setSummary(json.summary);
      fetchRecentReports();
    } catch (err) {
      setResults([{ filename: "Upload failed", reportType: "", rowCount: 0, success: false, error: String(err) }]);
    } finally {
      setUploading(false);
    }
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle2 size={14} className="text-emerald-400" />;
      case "failed": return <XCircle size={14} className="text-red-400" />;
      case "processing": return <Loader2 size={14} className="text-amber-400 animate-spin" />;
      default: return <Clock size={14} className="text-white/40" />;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Upload DialedIn Reports
            <span className="inline-block ml-2 w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          </h2>
          <p className="text-white/50 text-sm font-medium">
            Drag and drop XLS files from the Chase/DialedIn dialer system
          </p>
        </div>

        {/* Drop Zone */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div
            className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-200 cursor-pointer ${
              isDragging
                ? "border-indigo-400 bg-indigo-500/10"
                : "border-white/10 hover:border-white/20 bg-white/[0.02]"
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById("file-input")?.click()}
          >
            <input
              id="file-input"
              type="file"
              multiple
              accept=".xls,.xlsx"
              onChange={handleFileSelect}
              className="hidden"
            />
            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={48} className="text-indigo-400 animate-spin" />
                <p className="text-white/60">Processing reports...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload size={48} className={isDragging ? "text-indigo-400" : "text-white/30"} />
                <p className="text-white/60">
                  Drop <span className="text-white font-medium">.xls</span> or{" "}
                  <span className="text-white font-medium">.xlsx</span> files here, or click to browse
                </p>
                <p className="text-white/30 text-xs">
                  Supports: AgentSummaryCampaign, SubcampaignSummary, ProductionReport
                </p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Upload Results */}
        {results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="bg-white/[0.03] border-white/10">
              <CardHeader>
                <CardTitle className="text-white text-lg">Upload Results</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {results.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    {r.success ? (
                      <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle size={16} className="text-red-400 shrink-0" />
                    )}
                    <FileSpreadsheet size={16} className="text-white/40 shrink-0" />
                    <span className="text-white/80 truncate">{r.filename}</span>
                    {r.success && (
                      <span className="text-white/40 text-xs ml-auto">
                        {r.reportType} — {r.rowCount} rows
                      </span>
                    )}
                    {r.error && (
                      <span className="text-red-400/80 text-xs ml-auto">{r.error}</span>
                    )}
                  </div>
                ))}

                {summary && (
                  <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-4 gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-white">{summary.agents}</p>
                      <p className="text-white/40 text-xs">Agents</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-white">{summary.transfers.toLocaleString()}</p>
                      <p className="text-white/40 text-xs">Transfers</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-white">{summary.tph}</p>
                      <p className="text-white/40 text-xs">TPH</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-amber-400">{summary.anomalies}</p>
                      <p className="text-white/40 text-xs">Anomalies</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Recent Reports Log */}
        {recentReports.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="bg-white/[0.03] border-white/10">
              <CardHeader>
                <CardTitle className="text-white text-lg">Ingestion Log</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-white/40 text-xs border-b border-white/5">
                        <th className="text-left py-2 pr-4">Status</th>
                        <th className="text-left py-2 pr-4">Filename</th>
                        <th className="text-left py-2 pr-4">Type</th>
                        <th className="text-left py-2 pr-4">Date</th>
                        <th className="text-left py-2 pr-4">Rows</th>
                        <th className="text-left py-2 pr-4">Source</th>
                        <th className="text-left py-2">Ingested</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentReports.map((r) => (
                        <tr key={r.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                          <td className="py-2 pr-4">{statusIcon(r.ingestion_status)}</td>
                          <td className="py-2 pr-4 text-white/70 max-w-[200px] truncate">{r.filename}</td>
                          <td className="py-2 pr-4 text-white/50">{r.report_type}</td>
                          <td className="py-2 pr-4 text-white/50">{r.report_date}</td>
                          <td className="py-2 pr-4 text-white/50">{r.row_count ?? "—"}</td>
                          <td className="py-2 pr-4">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              r.ingestion_source === "email_apps_script"
                                ? "bg-blue-500/10 text-blue-400"
                                : "bg-white/5 text-white/40"
                            }`}>
                              {r.ingestion_source === "email_apps_script" ? "Email" : "Manual"}
                            </span>
                          </td>
                          <td className="py-2 text-white/40 text-xs">
                            {new Date(r.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </DashboardLayout>
  );
}
