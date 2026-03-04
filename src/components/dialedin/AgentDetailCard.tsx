"use client";

import { useEffect, useRef } from "react";
import { X, Trophy, Medal, DollarSign, ShieldAlert, ShieldCheck } from "lucide-react";
import { heatmapClass } from "@/utils/dialedin-heatmap";
import { getRevenuePerTransfer, getCampaignType, getBreakEvenTPH } from "@/utils/dialedin-revenue";
import type { AgentPerformance, AgentQAStats } from "@/types/dialedin-types";

interface AgentDetailCardProps {
  agent: AgentPerformance | null;
  onClose: () => void;
  wages?: Record<string, number>;
  qaStats?: Record<string, AgentQAStats>;
}

export default function AgentDetailCard({ agent, onClose, wages, qaStats }: AgentDetailCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    if (agent) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [agent, onClose]);

  if (!agent) return null;

  const util =
    agent.logged_in_time_min > 0
      ? ((agent.talk_time_min + agent.wait_time_min + agent.wrap_time_min) /
          agent.logged_in_time_min) *
        100
      : 0;

  const idle = Math.max(0, 100 - util);
  const talkPct = agent.logged_in_time_min > 0 ? (agent.talk_time_min / agent.logged_in_time_min) * 100 : 0;
  const waitPct = agent.logged_in_time_min > 0 ? (agent.wait_time_min / agent.logged_in_time_min) * 100 : 0;
  const wrapPct = agent.logged_in_time_min > 0 ? (agent.wrap_time_min / agent.logged_in_time_min) * 100 : 0;

  const rankBadge = (rank: number | null) => {
    if (rank === 1) return <Trophy size={14} className="text-amber-400" />;
    if (rank === 2) return <Medal size={14} className="text-gray-300" />;
    if (rank === 3) return <Medal size={14} className="text-amber-600" />;
    return rank ? <span className="text-white/30 text-xs font-mono">#{rank}</span> : null;
  };

  const Metric = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div className="flex justify-between py-0.5">
      <span className="text-[9px] uppercase tracking-wider text-white/30 font-mono">{label}</span>
      <span className={`text-[11px] font-mono font-bold ${color || "text-white/80"}`}>{value}</span>
    </div>
  );

  return (
    <div
      ref={ref}
      className="absolute right-0 top-0 bottom-0 w-[340px] bg-[#0c1018] border-l border-[#1a2332] z-20 flex flex-col overflow-y-auto shadow-2xl shadow-black/50"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1a2332] shrink-0">
        <div className="flex items-center gap-2">
          {rankBadge(agent.tph_rank)}
          <div>
            <div className="text-white/90 text-sm font-mono font-bold">{agent.agent_name}</div>
            <div className="text-white/30 text-[10px] font-mono">{agent.team || "No team"}</div>
          </div>
        </div>
        <button onClick={onClose} className="p-1 text-white/30 hover:text-white/50">
          <X size={14} />
        </button>
      </div>

      {/* Utilization Bar */}
      <div className="px-3 py-2 border-b border-[#1a2332] shrink-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] uppercase tracking-wider text-white/25 font-mono">Time Utilization</span>
          <span className={`text-[10px] font-mono font-bold ${heatmapClass(util, "utilization")}`}>
            {util.toFixed(0)}%
          </span>
        </div>
        <div className="flex h-3 w-full overflow-hidden bg-[#050a12]">
          <div style={{ width: `${talkPct}%` }} className="bg-emerald-500/70" title={`Talk ${talkPct.toFixed(0)}%`} />
          <div style={{ width: `${waitPct}%` }} className="bg-amber-500/70" title={`Wait ${waitPct.toFixed(0)}%`} />
          <div style={{ width: `${wrapPct}%` }} className="bg-blue-500/70" title={`Wrap ${wrapPct.toFixed(0)}%`} />
          <div style={{ width: `${idle}%` }} className="bg-white/5" title={`Idle ${idle.toFixed(0)}%`} />
        </div>
        <div className="flex gap-3 mt-1">
          <span className="flex items-center gap-1 text-[8px] text-white/30 font-mono">
            <span className="w-2 h-2 bg-emerald-500/70" /> Talk {talkPct.toFixed(0)}%
          </span>
          <span className="flex items-center gap-1 text-[8px] text-white/30 font-mono">
            <span className="w-2 h-2 bg-amber-500/70" /> Wait {waitPct.toFixed(0)}%
          </span>
          <span className="flex items-center gap-1 text-[8px] text-white/30 font-mono">
            <span className="w-2 h-2 bg-blue-500/70" /> Wrap {wrapPct.toFixed(0)}%
          </span>
          <span className="flex items-center gap-1 text-[8px] text-white/30 font-mono">
            <span className="w-2 h-2 bg-white/10" /> Idle {idle.toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="px-3 py-2 flex-1">
        <Metric label="SLA/hr (adj)" value={(agent.adjusted_tph ?? agent.tph).toFixed(2)} color={(() => {
          const threshold = getBreakEvenTPH(agent.team || null);
          const tph = agent.adjusted_tph ?? agent.tph;
          if (tph >= threshold * 1.2) return "text-emerald-400";
          if (tph >= threshold) return "text-white/80";
          if (tph >= threshold * 0.8) return "text-amber-400";
          return "text-red-400";
        })()} />
        <Metric label="SLA" value={agent.transfers.toLocaleString()} />
        <Metric label="Conversion" value={`${agent.conversion_rate.toFixed(1)}%`} color={heatmapClass(agent.conversion_rate, "conversion")} />
        <Metric label="Connect Rate" value={`${agent.connect_rate.toFixed(1)}%`} color={heatmapClass(agent.connect_rate, "connect")} />
        <div className="border-t border-[#1a2332] my-1.5" />
        <Metric label="Dials" value={agent.dials.toLocaleString()} />
        <Metric label="Connects" value={agent.connects.toLocaleString()} />
        <Metric label="Contacts" value={agent.contacts.toLocaleString()} />
        <Metric label="Conn/Hr" value={agent.connects_per_hour.toFixed(2)} />
        <div className="border-t border-[#1a2332] my-1.5" />
        <Metric label="Gross Hours" value={agent.hours_worked.toFixed(2)} />
        <Metric label="Paid Hours" value={(agent.paid_time_hours ?? agent.hours_worked).toFixed(2)} />
        <Metric label="Logged In" value={`${agent.logged_in_time_min.toFixed(0)}m`} />
        <Metric label="Talk Time" value={`${agent.talk_time_min.toFixed(0)}m`} />
        <Metric label="Wait Time" value={`${agent.wait_time_min.toFixed(0)}m`} />
        <Metric label="Wrap Time" value={`${agent.wrap_time_min.toFixed(0)}m`} />
        <Metric label="Pause Time" value={`${(agent.pause_time_min ?? 0).toFixed(0)}m`} />
        {agent.dead_air_ratio > 0 && (
          <Metric label="Dead Air %" value={`${agent.dead_air_ratio.toFixed(1)}%`} color="text-red-400" />
        )}
        {agent.skill && (
          <>
            <div className="border-t border-[#1a2332] my-1.5" />
            <Metric label="Skill" value={agent.skill} />
          </>
        )}

        {/* Revenue / Cost Section */}
        <div className="border-t border-[#1a2332] my-1.5" />
        <div className="flex items-center gap-1 mb-1">
          <DollarSign size={10} className="text-emerald-400/60" />
          <span className="text-[9px] uppercase tracking-wider text-white/30 font-mono">Revenue & Cost</span>
        </div>
        {(() => {
          const ratePerTransfer = getRevenuePerTransfer(agent.team || null, agent.skill);
          const campaign = getCampaignType(agent.team || null);
          const revenue = agent.transfers * ratePerTransfer;
          const wage = wages?.[agent.agent_name];
          const laborCost = wage != null ? agent.hours_worked * wage : null;
          const pnl = laborCost != null ? revenue - laborCost : null;
          const revPerHr = agent.hours_worked > 0 ? revenue / agent.hours_worked : 0;

          return (
            <>
              <Metric
                label={`Rate (${campaign?.toUpperCase() || "DEFAULT"})`}
                value={`$${ratePerTransfer.toFixed(2)}/SLA`}
              />
              <Metric
                label="Revenue"
                value={`$${revenue.toFixed(2)}`}
                color={revenue > 0 ? "text-emerald-400" : "text-white/40"}
              />
              <Metric
                label="Labor Cost"
                value={wage != null ? `$${laborCost!.toFixed(2)}` : "No wage data"}
                color={wage != null ? "text-white/70" : "text-white/25"}
              />
              <Metric
                label="P&L"
                value={pnl != null ? `$${pnl.toFixed(2)}` : "—"}
                color={pnl == null ? "text-white/25" : pnl >= 0 ? "text-emerald-400" : "text-red-400"}
              />
              <Metric
                label="Rev/hr"
                value={`$${revPerHr.toFixed(2)}/hr`}
                color={revPerHr >= 15 ? "text-emerald-400" : "text-white/60"}
              />
              {wage != null && (
                <Metric
                  label="Wage"
                  value={`$${wage.toFixed(2)}/hr`}
                  color="text-white/50"
                />
              )}
            </>
          );
        })()}

        {/* Break-Even Analysis */}
        {(() => {
          const threshold = getBreakEvenTPH(agent.team || null);
          const adjTph = agent.adjusted_tph ?? agent.tph;
          const delta = adjTph - threshold;
          const campaign = getCampaignType(agent.team || null);
          return (
            <>
              <div className="border-t border-[#1a2332] my-1.5" />
              <div className="flex items-center gap-1 mb-1">
                <span className="text-[9px] uppercase tracking-wider text-white/30 font-mono">Break-Even</span>
              </div>
              <Metric
                label={`Threshold (${(campaign || "aca").toUpperCase()})`}
                value={`${threshold.toFixed(1)} SLA/hr`}
              />
              <Metric
                label="vs Break-Even"
                value={`${delta >= 0 ? "+" : ""}${delta.toFixed(2)} SLA/hr`}
                color={delta >= 0 ? "text-emerald-400" : "text-red-400"}
              />
            </>
          );
        })()}

        {/* QA Compliance Section */}
        {(() => {
          const qa = qaStats?.[agent.agent_name] || qaStats?.[agent.agent_name.trim()] || qaStats?.[agent.agent_name.trim().toLowerCase()];
          if (!qa) return null;
          return (
            <>
              <div className="border-t border-[#1a2332] my-1.5" />
              <div className="flex items-center gap-1 mb-1">
                {qa.auto_fail_count > 0 ? (
                  <ShieldAlert size={10} className="text-red-400/60" />
                ) : (
                  <ShieldCheck size={10} className="text-emerald-400/60" />
                )}
                <span className="text-[9px] uppercase tracking-wider text-white/30 font-mono">QA Compliance</span>
                <span className={`text-[9px] font-mono ml-auto ${
                  qa.avg_score >= 70 ? "text-emerald-400" : qa.avg_score >= 40 ? "text-amber-400" : "text-red-400"
                }`}>
                  {qa.total_calls} calls
                </span>
              </div>
              <Metric
                label="Avg Score"
                value={`${qa.avg_score}`}
                color={qa.avg_score >= 70 ? "text-emerald-400" : qa.avg_score >= 40 ? "text-amber-400" : "text-red-400"}
              />
              <Metric
                label="Pass Rate"
                value={`${qa.pass_rate}%`}
                color={qa.pass_rate >= 80 ? "text-emerald-400" : qa.pass_rate >= 50 ? "text-amber-400" : "text-red-400"}
              />
              <Metric
                label="Auto-Fails"
                value={`${qa.auto_fail_count} (${qa.auto_fail_rate}%)`}
                color={qa.auto_fail_count > 0 ? "text-red-400" : "text-emerald-400"}
              />
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[9px] uppercase tracking-wider text-white/30 font-mono">Risk</span>
                <div className="flex gap-1 ml-auto">
                  {qa.risk_breakdown.high > 0 && (
                    <span className="text-[8px] font-mono bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">
                      {qa.risk_breakdown.high} HIGH
                    </span>
                  )}
                  {qa.risk_breakdown.medium > 0 && (
                    <span className="text-[8px] font-mono bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">
                      {qa.risk_breakdown.medium} MED
                    </span>
                  )}
                  {qa.risk_breakdown.low > 0 && (
                    <span className="text-[8px] font-mono bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">
                      {qa.risk_breakdown.low} LOW
                    </span>
                  )}
                </div>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
