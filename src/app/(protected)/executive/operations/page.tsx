"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useExecutiveFilters } from "@/context/ExecutiveFilterContext";
import { PeriodLabel } from "../layout";
import { useLiveData } from "@/hooks/useLiveData";
import LivePresencePanel from "@/components/dialedin/LivePresencePanel";
import TeamComparisonPanel from "@/components/dialedin/TeamComparisonPanel";
import TPHDistributionPanel from "@/components/dialedin/TPHDistributionPanel";
import TrendLineChart from "@/components/dialedin/TrendLineChart";
import AgentRankingTable from "@/components/dialedin/AgentRankingTable";
import AgentDetailCard from "@/components/dialedin/AgentDetailCard";
import type { DailyKPIs, AgentPerformance, AgentTrend, AgentQAStats, LiveAgentStatus } from "@/types/dialedin-types";

export default function OperationsPage() {
  const { dateRange, startDate } = useExecutiveFilters();
  const { liveMetrics, agentStatuses, recentEvents, hasLiveData } = useLiveData({ interval: 30000 });

  const [loading, setLoading] = useState(true);
  const [trendData, setTrendData] = useState<DailyKPIs[]>([]);
  const [agents, setAgents] = useState<AgentPerformance[]>([]);
  const [wages, setWages] = useState<Record<string, number>>({});
  const [agentTrends, setAgentTrends] = useState<Record<string, AgentTrend>>({});
  const [qaStats, setQaStats] = useState<Record<string, AgentQAStats>>({});
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentPerformance | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const [kpiRes, agentRes, trendsRes, qaRes] = await Promise.all([
        fetch(`/api/dialedin/kpis?range=${dateRange}`),
        fetch(`/api/dialedin/agents?date=${today}&sort=tph&limit=600&include_wage=true`),
        fetch(`/api/dialedin/agent-trends?date=${today}&days=30&limit=50`),
        fetch(`/api/dialedin/qa-stats?days=30`),
      ]);

      if (kpiRes.ok) {
        const d = await kpiRes.json();
        setTrendData(d.data?.trend || d.trend || []);
      }
      if (agentRes.ok) {
        const d = await agentRes.json();
        setAgents(d.data?.agents || d.agents || []);
        setWages(d.data?.wages || d.wages || {});
      }
      if (trendsRes.ok) {
        const d = await trendsRes.json();
        setAgentTrends(d.data?.trends || d.trends || {});
      }
      if (qaRes.ok) {
        const d = await qaRes.json();
        setQaStats(d.data?.stats || d.stats || {});
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const liveStatusMap = useMemo(() => {
    const map: Record<string, LiveAgentStatus> = {};
    for (const s of agentStatuses) {
      map[s.agent_name.toLowerCase()] = s;
    }
    return map;
  }, [agentStatuses]);

  return (
    <div className="flex flex-col h-full font-mono">
      <PeriodLabel title="OPERATIONS" />
      {/* Top Row: Live Presence + TPH Distribution */}
      <div className="grid grid-cols-2 gap-3 p-4 pb-0 shrink-0" style={{ height: 220 }}>
        <div className="overflow-hidden rounded-lg border border-[#1a2332] bg-[#0c1018]">
          {hasLiveData ? (
            <LivePresencePanel agentStatuses={agentStatuses} hasLiveData={hasLiveData} lastUpdated={null} />
          ) : (
            <TeamComparisonPanel
              agents={agents}
              onSelectTeam={setSelectedTeam}
              selectedTeam={selectedTeam}
            />
          )}
        </div>
        <div className="overflow-hidden rounded-lg border border-[#1a2332] bg-[#0c1018]">
          <TPHDistributionPanel agents={agents} distribution={null} />
        </div>
      </div>

      {/* Trend Chart */}
      <div className="px-4 pt-3 shrink-0" style={{ height: 170 }}>
        <div className="h-full rounded-lg border border-[#1a2332] bg-[#0c1018] overflow-hidden">
          <TrendLineChart data={trendData} />
        </div>
      </div>

      {/* Agent Ranking Table */}
      <div className="flex-1 min-h-0 px-4 pt-3 pb-4 relative">
        <AgentRankingTable
          agents={agents}
          wages={wages}
          sparklines={agentTrends}
          qaStats={qaStats}
          liveStatuses={liveStatusMap}
          selectedTeam={selectedTeam}
          onSelectAgent={setSelectedAgent}
        />

        {/* Agent Detail Card */}
        {selectedAgent && (
          <AgentDetailCard
            agent={selectedAgent}
            wages={wages}
            qaStats={qaStats}
            onClose={() => setSelectedAgent(null)}
          />
        )}
      </div>

      {/* TLD Placeholder */}
      {!hasLiveData && (
        <div className="mx-4 mb-4 p-3 rounded-lg border border-dashed border-white/10 text-center">
          <span className="text-[10px] text-white/20 tracking-widest">
            REAL-TIME OPERATIONS DATA WILL APPEAR WHEN DIALERS CONNECT
          </span>
        </div>
      )}
    </div>
  );
}
