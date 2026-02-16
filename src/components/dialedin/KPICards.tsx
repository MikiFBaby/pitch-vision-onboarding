"use client";

import StatsCard from "@/components/dashboard/StatsCard";
import { Phone, Zap, TrendingUp, Target, Users, Link2, Building2, Clock } from "lucide-react";
import type { DailyKPIs } from "@/types/dialedin-types";

interface KPICardsProps {
  kpis: DailyKPIs | null;
  loading?: boolean;
  rawData?: Record<string, unknown>;
}

export default function KPICards({ kpis, loading, rawData }: KPICardsProps) {
  if (loading || !kpis) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="h-[130px] rounded-2xl bg-white/[0.03] border border-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  const campaignAgg = rawData?.campaign_aggregate as { total_campaigns?: number; total_system_connects?: number } | undefined;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Row 1 — Agent Performance */}
      <StatsCard
        index={0}
        title="Total Dials"
        value={kpis.total_dials.toLocaleString()}
        trend={kpis.delta_transfers !== null ? (kpis.delta_transfers > 0 ? "up" : kpis.delta_transfers < 0 ? "down" : "neutral") : undefined}
        trendValue={kpis.delta_transfers !== null ? `${Math.abs(kpis.delta_transfers).toLocaleString()} xfers` : undefined}
        icon={<Phone size={18} />}
      />
      <StatsCard
        index={1}
        title="Connect Rate"
        value={`${kpis.connect_rate}%`}
        icon={<Zap size={18} />}
      />
      <StatsCard
        index={2}
        title="Transfers / Hr"
        value={kpis.transfers_per_hour.toFixed(2)}
        trend={kpis.delta_tph !== null ? (kpis.delta_tph > 0 ? "up" : kpis.delta_tph < 0 ? "down" : "neutral") : undefined}
        trendValue={kpis.delta_tph !== null ? `${kpis.delta_tph > 0 ? "+" : ""}${kpis.delta_tph.toFixed(2)}` : undefined}
        icon={<TrendingUp size={18} />}
      />
      <StatsCard
        index={3}
        title="Conversion Rate"
        value={`${kpis.conversion_rate}%`}
        icon={<Target size={18} />}
      />

      {/* Row 2 — Volume & System Overview */}
      <StatsCard
        index={4}
        title="Agents"
        value={kpis.total_agents.toLocaleString()}
        trendValue={kpis.agents_with_transfers > 0 ? `${kpis.agents_with_transfers} w/ transfers` : undefined}
        icon={<Users size={18} />}
      />
      <StatsCard
        index={5}
        title="Total Connects"
        value={kpis.total_connects.toLocaleString()}
        icon={<Link2 size={18} />}
      />
      <StatsCard
        index={6}
        title="Campaigns"
        value={(campaignAgg?.total_campaigns || 0).toLocaleString()}
        trendValue={campaignAgg?.total_system_connects ? `${campaignAgg.total_system_connects.toLocaleString()} sys connects` : undefined}
        icon={<Building2 size={18} />}
      />
      <StatsCard
        index={7}
        title="Man Hours"
        value={kpis.total_man_hours.toFixed(1)}
        icon={<Clock size={18} />}
      />
    </div>
  );
}
