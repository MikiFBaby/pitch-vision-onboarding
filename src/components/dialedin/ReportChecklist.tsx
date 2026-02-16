"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Circle, Loader2, Sparkles } from "lucide-react";

interface ChecklistReport {
  type: string;
  received: boolean;
  rows?: number;
  receivedAt?: string;
}

interface ReportChecklistProps {
  date: string;
  received: number;
  total: number;
  complete: boolean;
  computed: boolean;
  computedAt?: string | null;
  reports: ChecklistReport[];
  loading?: boolean;
}

const REPORT_LABELS: Record<string, string> = {
  AgentSummary: "Agent Summary",
  AgentSummaryCampaign: "Agent Summary (Campaign)",
  AgentSummarySubcampaign: "Agent Summary (Subcampaign)",
  AgentAnalysis: "Agent Analysis",
  AgentPauseTime: "Agent Pause Time",
  CallsPerHour: "Calls Per Hour",
  CampaignCallLog: "Campaign Call Log",
  CampaignSummary: "Campaign Summary",
  ProductionReport: "Production Report",
  ProductionReportSubcampaign: "Production (Subcampaign)",
  ShiftReport: "Shift Report",
  SubcampaignSummary: "Subcampaign Summary",
};

export default function ReportChecklist({
  date,
  received,
  total,
  complete,
  computed,
  reports,
  loading,
}: ReportChecklistProps) {
  if (loading) {
    return (
      <Card className="bg-white/[0.03] border-white/10">
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 size={20} className="text-white/30 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  const pct = total > 0 ? (received / total) * 100 : 0;

  return (
    <Card className="bg-white/[0.03] border-white/10">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white text-lg">Report Checklist</CardTitle>
          <div className="flex items-center gap-2">
            {complete ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                <Sparkles size={12} />
                {computed ? "Analysis Complete" : "Ready to Analyze"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20">
                Awaiting {total - received} more
              </span>
            )}
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-2 space-y-1">
          <div className="flex items-center justify-between text-xs text-white/40">
            <span>{received}/{total} Reports Received</span>
            <span>{date}</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                complete ? "bg-emerald-500/60" : "bg-indigo-500/60"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {reports.map((r) => (
            <div
              key={r.type}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                r.received
                  ? "bg-emerald-500/[0.06] border border-emerald-500/10"
                  : "bg-white/[0.02] border border-white/[0.04]"
              }`}
            >
              {r.received ? (
                <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
              ) : (
                <Circle size={14} className="text-white/15 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <span className={`truncate block ${r.received ? "text-white/70" : "text-white/25"}`}>
                  {REPORT_LABELS[r.type] || r.type}
                </span>
                {r.received && r.rows !== undefined && (
                  <span className="text-white/30 text-xs">{r.rows} rows</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
