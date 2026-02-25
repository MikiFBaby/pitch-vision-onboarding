"use client";

import { useState, useEffect, useMemo } from "react";
import { ArrowUpDown, ShieldAlert, ShieldCheck } from "lucide-react";
import type { AgentQAStats } from "@/types/dialedin-types";

type SortField = "avg_score" | "total_calls" | "auto_fail_rate" | "pass_rate";

export default function QACompliancePanel() {
  const [stats, setStats] = useState<Record<string, AgentQAStats>>({});
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>("avg_score");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/dialedin/qa-stats?days=30");
        const json = await res.json();
        setStats(json.data || {});
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const agents = useMemo(() => {
    const list = Object.values(stats);
    return [...list].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      return sortAsc ? aVal - bVal : bVal - aVal;
    });
  }, [stats, sortField, sortAsc]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  const totalCalls = agents.reduce((s, a) => s + a.total_calls, 0);
  const totalAFs = agents.reduce((s, a) => s + a.auto_fail_count, 0);
  const avgScore = agents.length > 0
    ? Math.round(agents.reduce((s, a) => s + a.avg_score, 0) / agents.length)
    : 0;

  const SortHeader = ({ label, field }: { label: string; field: SortField }) => (
    <th
      className="py-1 px-1 cursor-pointer select-none hover:text-white/40 text-right"
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-0.5 justify-end">
        {label}
        <ArrowUpDown size={8} className={sortField === field ? "text-amber-400" : "text-white/15"} />
      </span>
    </th>
  );

  if (loading) {
    return (
      <div className="h-full bg-[#0c1018] border border-[#1a2332] flex items-center justify-center">
        <div className="h-full w-full animate-pulse bg-white/[0.02]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0c1018] border border-[#1a2332]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1a2332] shrink-0">
        <div className="flex items-center gap-2">
          <ShieldAlert size={12} className="text-amber-400" />
          <span className="text-[9px] uppercase tracking-wider text-amber-400 font-mono font-bold">
            QA Compliance
          </span>
        </div>
        <div className="flex items-center gap-3 text-[9px] font-mono text-white/30">
          <span>{totalCalls} calls</span>
          <span className={totalAFs > 0 ? "text-red-400" : "text-emerald-400"}>
            {totalAFs} AF
          </span>
          <span>Avg {avgScore}</span>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-[#0c1018] z-10">
            <tr className="text-[9px] uppercase tracking-wider text-white/25 font-mono border-b border-[#1a2332]">
              <th className="text-left py-1 px-2">Agent</th>
              <SortHeader label="Score" field="avg_score" />
              <SortHeader label="Calls" field="total_calls" />
              <SortHeader label="AF%" field="auto_fail_rate" />
              <SortHeader label="Pass%" field="pass_rate" />
              <th className="py-1 px-1 text-center">Risk</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr
                key={a.agent_name}
                className="border-b border-[#1a2332]/30 hover:bg-white/[0.03] h-7"
              >
                <td className="py-0.5 px-2 text-white/90 font-mono font-medium truncate max-w-[140px]">
                  {a.agent_name}
                </td>
                <td className={`py-0.5 px-1 text-right font-mono font-bold ${
                  a.avg_score >= 70 ? "text-emerald-400" : a.avg_score >= 40 ? "text-amber-400" : "text-red-400"
                }`}>
                  {a.avg_score}
                </td>
                <td className="py-0.5 px-1 text-right font-mono text-white/50">
                  {a.total_calls}
                </td>
                <td className={`py-0.5 px-1 text-right font-mono ${
                  a.auto_fail_rate > 30 ? "text-red-400" : a.auto_fail_rate > 10 ? "text-amber-400" : "text-white/50"
                }`}>
                  {a.auto_fail_rate}%
                </td>
                <td className={`py-0.5 px-1 text-right font-mono ${
                  a.pass_rate >= 80 ? "text-emerald-400" : a.pass_rate >= 50 ? "text-amber-400" : "text-red-400"
                }`}>
                  {a.pass_rate}%
                </td>
                <td className="py-0.5 px-1 text-center">
                  <div className="inline-flex items-center gap-0.5">
                    {a.risk_breakdown.high > 0 && (
                      <span className="text-[8px] font-mono bg-red-500/20 text-red-400 px-1 rounded">
                        {a.risk_breakdown.high}H
                      </span>
                    )}
                    {a.risk_breakdown.medium > 0 && (
                      <span className="text-[8px] font-mono bg-amber-500/20 text-amber-400 px-1 rounded">
                        {a.risk_breakdown.medium}M
                      </span>
                    )}
                    {a.risk_breakdown.high === 0 && a.risk_breakdown.medium === 0 && (
                      <ShieldCheck size={10} className="text-emerald-400/50" />
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-white/15 font-mono text-[10px]">
                  No QA data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
