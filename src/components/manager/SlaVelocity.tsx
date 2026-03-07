import { TrendingUp, TrendingDown, Minus, Clock } from "lucide-react";

interface HourlyDelta {
    hour: number;
    sla_delta: number;
    sla_total: number;
    agent_count: number;
}

interface SlaVelocityProps {
    deltas: HourlyDelta[];
}

/**
 * Computes SLA velocity from the last 2-3 hours of hourly trend data.
 * Velocity = change in hourly SLA production rate.
 * Positive = team is accelerating, negative = decelerating.
 */
export default function SlaVelocity({ deltas }: SlaVelocityProps) {
    if (deltas.length === 0) {
        return (
            <div className="flex items-center gap-1.5 text-white/40 text-xs">
                <Clock size={12} />
                <span>Awaiting first hour</span>
            </div>
        );
    }

    if (deltas.length === 1) {
        return (
            <div className="flex items-center gap-1.5 text-white/50 text-xs">
                <Minus size={12} />
                <span className="font-mono tabular-nums">{deltas[0].sla_delta.toFixed(1)} SLAs</span>
                <span className="text-[10px] text-white/30">Hour 1</span>
            </div>
        );
    }

    if (deltas.length === 2) {
        const diff = deltas[1].sla_delta - deltas[0].sla_delta;
        const isUp = diff > 0.5;
        const isDown = diff < -0.5;
        return (
            <div className="flex items-center gap-1.5 text-xs">
                {isUp ? (
                    <TrendingUp size={12} className="text-emerald-400" />
                ) : isDown ? (
                    <TrendingDown size={12} className="text-red-400" />
                ) : (
                    <Minus size={12} className="text-white/40" />
                )}
                <span className={`font-mono font-bold tabular-nums ${
                    isUp ? "text-emerald-400" : isDown ? "text-red-400" : "text-white/50"
                }`}>
                    {diff >= 0 ? "+" : ""}{diff.toFixed(1)}
                </span>
                <span className="text-[10px] text-white/30">Velocity in ~1h</span>
            </div>
        );
    }

    // Compare average SLA/hr of last 2 hours vs prior 2 hours
    const recent = deltas.slice(-2);
    const prior = deltas.slice(-4, -2);

    const recentAvg = recent.reduce((s, d) => s + d.sla_delta, 0) / recent.length;
    const priorAvg = prior.length > 0
        ? prior.reduce((s, d) => s + d.sla_delta, 0) / prior.length
        : recentAvg;

    const velocity = recentAvg - priorAvg;
    const isAccelerating = velocity > 0.5;
    const isDecelerating = velocity < -0.5;

    return (
        <div className="flex items-center gap-1.5">
            {isAccelerating ? (
                <TrendingUp size={14} className="text-emerald-400" />
            ) : isDecelerating ? (
                <TrendingDown size={14} className="text-red-400" />
            ) : (
                <Minus size={14} className="text-white/40" />
            )}
            <span className={`text-xs font-mono font-bold tabular-nums ${
                isAccelerating ? "text-emerald-400" : isDecelerating ? "text-red-400" : "text-white/50"
            }`}>
                {velocity >= 0 ? "+" : ""}{velocity.toFixed(1)} SLA/hr
            </span>
            <span className="text-[10px] text-white/30">
                {isAccelerating ? "Accelerating" : isDecelerating ? "Decelerating" : "Steady"}
            </span>
        </div>
    );
}
