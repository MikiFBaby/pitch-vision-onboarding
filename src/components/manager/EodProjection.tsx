import { Target } from "lucide-react";

interface HistoricContext {
    avg_daily_transfers_14d: number;
    dow_avg_transfers: number;
    dow_sample_count: number;
    yesterday_final_transfers: number;
    yesterday_same_time_transfers: number | null;
    avg_daily_agents_14d: number;
    hourly_completion_curve: { hour: number; pct_of_daily: number }[];
}

interface EodProjectionProps {
    currentSla: number;
    hoursElapsed: number;
    hoursRemaining: number;
    totalBusinessHours: number;
    confidence: "high" | "medium" | "low";
    breakEvenTarget: number;
    activeAgents: number;
    historicContext?: HistoricContext;
}

interface ProjectionResult {
    projected: number;
    low: number;
    high: number;
    methods: { name: string; value: number; weight: number }[];
}

function computeProjection(
    currentSla: number,
    hoursElapsed: number,
    hoursRemaining: number,
    activeAgents: number,
    ctx?: HistoricContext,
): ProjectionResult {
    const methods: { name: string; value: number; weight: number }[] = [];

    // Time-of-day base weights: [Linear, Pace, DOW, Curve]
    let wLinear: number, wPace: number, wDow: number, wCurve: number;
    if (hoursElapsed < 2) {
        [wLinear, wPace, wDow, wCurve] = [10, 30, 30, 30];
    } else if (hoursElapsed <= 5) {
        [wLinear, wPace, wDow, wCurve] = [25, 30, 20, 25];
    } else {
        [wLinear, wPace, wDow, wCurve] = [35, 35, 10, 20];
    }

    // Method 1: Linear extrapolation
    const linearProjected = currentSla + (currentSla / hoursElapsed) * hoursRemaining;
    methods.push({ name: "Linear", value: linearProjected, weight: wLinear });

    // Method 2: Pace-adjusted (today vs yesterday same time → scale yesterday's final)
    if (ctx?.yesterday_final_transfers && ctx.yesterday_same_time_transfers && ctx.yesterday_same_time_transfers > 0) {
        const paceRatio = currentSla / ctx.yesterday_same_time_transfers;
        methods.push({ name: "Pace", value: ctx.yesterday_final_transfers * paceRatio, weight: wPace });
    }

    // Method 3: DOW average (staffing-adjusted)
    if (ctx?.dow_avg_transfers && ctx.dow_sample_count >= 2 && ctx.avg_daily_agents_14d > 0 && activeAgents > 0) {
        const staffingRatio = activeAgents / ctx.avg_daily_agents_14d;
        methods.push({ name: "DOW Avg", value: ctx.dow_avg_transfers * staffingRatio, weight: wDow });
    }

    // Method 4: Curve-based (what % of daily SLA was done by this hour yesterday?)
    if (ctx?.hourly_completion_curve && ctx.hourly_completion_curve.length > 0) {
        const currentHourET = 10 + Math.floor(hoursElapsed);
        let curveEntry = ctx.hourly_completion_curve.find(c => c.hour === currentHourET);
        if (!curveEntry) {
            curveEntry = ctx.hourly_completion_curve.reduce((best, c) =>
                Math.abs(c.hour - currentHourET) < Math.abs(best.hour - currentHourET) ? c : best,
            );
        }
        if (curveEntry && curveEntry.pct_of_daily > 0.05) {
            methods.push({ name: "Curve", value: currentSla / curveEntry.pct_of_daily, weight: wCurve });
        }
    }

    // Normalize weights (redistribute unavailable methods' weight proportionally)
    const totalWeight = methods.reduce((s, m) => s + m.weight, 0);
    for (const m of methods) m.weight = m.weight / totalWeight;

    // Weighted blend
    let projected = methods.reduce((s, m) => s + m.value * m.weight, 0);

    // Sanity clamp: [0.3×, 2.5×] of 14-day average
    if (ctx?.avg_daily_transfers_14d && ctx.avg_daily_transfers_14d > 0) {
        projected = Math.max(
            ctx.avg_daily_transfers_14d * 0.3,
            Math.min(ctx.avg_daily_transfers_14d * 2.5, projected),
        );
    }

    projected = Math.round(projected);

    const allValues = methods.map(m => m.value);
    return {
        projected,
        low: Math.round(Math.min(...allValues)),
        high: Math.round(Math.max(...allValues)),
        methods,
    };
}

export default function EodProjection({
    currentSla,
    hoursElapsed,
    hoursRemaining,
    totalBusinessHours,
    confidence,
    breakEvenTarget,
    activeAgents,
    historicContext,
}: EodProjectionProps) {
    if (hoursElapsed < 0.5 || activeAgents === 0) return null;

    const { projected, low, high, methods } = computeProjection(
        currentSla, hoursElapsed, hoursRemaining, activeAgents, historicContext,
    );

    const dailyTarget = Math.round(breakEvenTarget * activeAgents * totalBusinessHours);
    const onTarget = projected >= dailyTarget * 0.9;

    const confidenceLabel = {
        high: "High confidence",
        medium: "Medium confidence",
        low: "Early estimate",
    }[confidence];

    const confidenceColor = {
        high: "text-emerald-400/60",
        medium: "text-amber-400/60",
        low: "text-white/30",
    }[confidence];

    const showRange = methods.length > 1 && high - low > projected * 0.1;

    return (
        <div className="glass-card p-4 rounded-2xl border-white/5">
            <div className="flex items-center gap-2 mb-2">
                <Target size={12} className="text-indigo-400" />
                <h4 className="text-[10px] font-bold text-white/50 uppercase tracking-widest">EOD Projection</h4>
                <span className={`text-[9px] ${confidenceColor} ml-auto`}>{confidenceLabel}</span>
            </div>
            <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-bold font-mono tabular-nums ${onTarget ? "text-emerald-400" : "text-amber-400"}`}>
                    {projected.toLocaleString()}
                </span>
                <span className="text-xs text-white/40">projected SLA</span>
            </div>
            {showRange && (
                <div className="text-[10px] text-white/25 font-mono mt-0.5">
                    Range: {low.toLocaleString()} – {high.toLocaleString()}
                </div>
            )}
            <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="text-[10px] text-white/30 font-mono">
                    Rate: {(currentSla / hoursElapsed).toFixed(1)} SLA/hr
                </span>
                <span className="text-[10px] text-white/30">
                    {hoursRemaining.toFixed(1)}h remaining
                </span>
                {historicContext?.avg_daily_transfers_14d ? (
                    <span className="text-[10px] text-white/20">
                        14d avg: {historicContext.avg_daily_transfers_14d.toLocaleString()}
                    </span>
                ) : null}
            </div>
            {methods.length > 1 && (
                <div className="flex gap-2 mt-1.5 flex-wrap">
                    {methods.map((m) => (
                        <span key={m.name} className="text-[9px] text-white/20 font-mono">
                            {m.name}: {Math.round(m.value).toLocaleString()} ({Math.round(m.weight * 100)}%)
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
