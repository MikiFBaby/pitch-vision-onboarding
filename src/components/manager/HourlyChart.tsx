interface HourlyDelta {
    hour: number;
    sla_delta: number;
    sla_total: number;
    agent_count: number;
}

interface HourlyChartProps {
    deltas: HourlyDelta[];
    loading: boolean;
}

export default function HourlyChart({ deltas, loading }: HourlyChartProps) {
    if (loading || deltas.length <= 1) return null;

    const maxDelta = Math.max(...deltas.map((d) => d.sla_delta), 1);

    // Identify peak and trough hours (only when we have enough data)
    let peakHour = -1;
    let troughHour = -1;
    if (deltas.length >= 3) {
        let maxVal = -Infinity;
        let minVal = Infinity;
        for (const d of deltas) {
            if (d.sla_delta > maxVal) { maxVal = d.sla_delta; peakHour = d.hour; }
            if (d.sla_delta > 0 && d.sla_delta < minVal) { minVal = d.sla_delta; troughHour = d.hour; }
        }
        if (peakHour === troughHour) { peakHour = -1; troughHour = -1; }
    }

    return (
        <div className="glass-card p-6 rounded-2xl border-white/5">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-widest">Hourly SLA Production</h3>
                <span className="text-[10px] text-white/40 font-mono">{deltas.length} hours</span>
            </div>
            <div className="flex items-end gap-1 h-[120px]">
                {deltas.map((h) => {
                    const label = `${h.hour > 12 ? h.hour - 12 : h.hour}${h.hour >= 12 ? "PM" : "AM"}`;
                    const isPeak = h.hour === peakHour;
                    const isTrough = h.hour === troughHour;
                    const barColor = isPeak
                        ? "bg-emerald-500/60 hover:bg-emerald-400/80"
                        : isTrough
                        ? "bg-amber-500/50 hover:bg-amber-400/70"
                        : "bg-indigo-500/50 hover:bg-indigo-400/70";

                    return (
                        <div key={h.hour} className="flex-1 flex flex-col items-center justify-end h-full group">
                            {isPeak && (
                                <span className="text-[8px] font-bold text-emerald-400 mb-0.5">PEAK</span>
                            )}
                            {isTrough && (
                                <span className="text-[8px] font-bold text-amber-400 mb-0.5">LOW</span>
                            )}
                            <div className="text-[9px] text-white/0 group-hover:text-white/60 transition-colors mb-1 tabular-nums">
                                +{h.sla_delta}
                            </div>
                            <div
                                className={`w-full max-w-[28px] ${barColor} rounded-t transition-colors`}
                                style={{ height: `${Math.max((h.sla_delta / maxDelta) * 100, 5)}%` }}
                                title={`${label}: +${h.sla_delta} SLA (${h.sla_total} total, ${h.agent_count} agents)`}
                            />
                            <span className="text-[9px] text-white/30 mt-1">{label}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
