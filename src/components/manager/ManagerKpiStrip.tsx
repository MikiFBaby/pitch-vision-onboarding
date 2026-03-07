import StatsCard from "@/components/dashboard/StatsCard";
import { Users, Target, Zap, TrendingUp, Activity, ArrowLeftRight } from "lucide-react";
import type { IntradayTotals } from "@/types/dialedin-types";

interface ManagerKpiStripProps {
    loading: boolean;
    totals: IntradayTotals | undefined;
    primaryBE: number;
    attentionCount: number;
    campaignLabel: string;
    velocity?: number | null;
    yesterdayDelta?: number | null;
    yesterdaySameTimeSla?: number | null;
    aboveBECount?: number;
    totalAgentCount?: number;
}

export default function ManagerKpiStrip({
    loading, totals, primaryBE, attentionCount, campaignLabel,
    velocity, yesterdayDelta, yesterdaySameTimeSla,
    aboveBECount, totalAgentCount,
}: ManagerKpiStripProps) {
    const avgSla = totals?.avg_sla_hr ?? 0;
    const delta = avgSla - primaryBE;

    const velocityTrend = velocity != null ? (velocity > 0.5 ? "up" : velocity < -0.5 ? "down" : "neutral") : "neutral";
    const yesterdayTrend = yesterdayDelta != null ? (yesterdayDelta >= 0 ? "up" : "down") : "neutral";

    return (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatsCard
                index={0}
                title="Team SLA Today"
                value={loading ? "—" : String(totals?.sla_total ?? 0)}
                trend="neutral"
                trendValue={totals ? `${totals.production_hours.toFixed(1)}h` : ""}
                icon={<Zap size={18} />}
            />
            <StatsCard
                index={1}
                title="Active Agents"
                value={loading ? "—" : String(totals?.active_agents ?? 0)}
                trend={aboveBECount != null && totalAgentCount ? (aboveBECount > totalAgentCount / 2 ? "up" : "down") : "neutral"}
                trendValue={aboveBECount != null && totalAgentCount ? `${aboveBECount}/${totalAgentCount} above B/E` : attentionCount > 0 ? `${attentionCount} need attention` : "all ok"}
                icon={<Users size={18} />}
            />
            <StatsCard
                index={2}
                title="Team Avg SLA/hr"
                value={loading ? "—" : (totals?.avg_sla_hr?.toFixed(2) ?? "—")}
                trend={totals ? (avgSla >= primaryBE ? "up" : "down") : "neutral"}
                trendValue={`B/E: ${primaryBE}`}
                icon={<Target size={18} />}
            />
            <StatsCard
                index={3}
                title="vs Break-Even"
                value={loading ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`}
                trend={totals ? (delta >= 0 ? "up" : "down") : "neutral"}
                trendValue={campaignLabel}
                icon={<TrendingUp size={18} />}
            />
            <StatsCard
                index={4}
                title="SLA Velocity"
                value={velocity != null ? `${velocity >= 0 ? "+" : ""}${velocity.toFixed(1)}` : "—"}
                trend={velocityTrend}
                trendValue={velocity != null ? (velocity > 0.5 ? "Accelerating" : velocity < -0.5 ? "Decelerating" : "Steady") : ""}
                icon={<Activity size={18} />}
            />
            <StatsCard
                index={5}
                title="vs Yesterday"
                value={yesterdayDelta != null ? `${yesterdayDelta >= 0 ? "+" : ""}${yesterdayDelta}` : "—"}
                trend={yesterdayTrend}
                trendValue={yesterdaySameTimeSla != null ? `Same time: ${yesterdaySameTimeSla}` : ""}
                icon={<ArrowLeftRight size={18} />}
            />
        </div>
    );
}
