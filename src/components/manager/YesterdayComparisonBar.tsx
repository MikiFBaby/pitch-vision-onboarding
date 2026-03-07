interface YesterdayComparisonBarProps {
    todaySla: number;
    yesterdaySameTimeSla: number | null;
    yesterdayFinalSla: number;
    loading: boolean;
}

export default function YesterdayComparisonBar({
    todaySla,
    yesterdaySameTimeSla,
    yesterdayFinalSla,
    loading,
}: YesterdayComparisonBarProps) {
    if (loading || yesterdayFinalSla === 0) return null;

    const pctOfFinal = Math.min((todaySla / yesterdayFinalSla) * 100, 100);
    const delta = yesterdaySameTimeSla !== null ? todaySla - yesterdaySameTimeSla : null;
    const ahead = delta !== null && delta >= 0;

    return (
        <div className="glass-card p-4 rounded-2xl border-white/5">
            <div className="flex items-center justify-between mb-2">
                <h4 className="text-[10px] font-bold text-white/50 uppercase tracking-widest">vs Yesterday</h4>
                {delta !== null && (
                    <span className={`text-xs font-mono font-bold tabular-nums ${ahead ? "text-emerald-400" : "text-red-400"}`}>
                        {ahead ? "+" : ""}{delta} SLAs {ahead ? "ahead" : "behind"}
                    </span>
                )}
            </div>
            <div className="relative h-6 bg-white/5 rounded-full overflow-hidden">
                {/* Yesterday final (full bar reference) */}
                <div className="absolute inset-0 flex items-center justify-end pr-2">
                    <span className="text-[9px] text-white/30 font-mono">Yesterday: {yesterdayFinalSla}</span>
                </div>
                {/* Today's progress */}
                <div
                    className={`h-full rounded-full transition-all duration-700 ${ahead ? "bg-emerald-500/40" : "bg-amber-500/40"}`}
                    style={{ width: `${pctOfFinal}%` }}
                >
                    <div className="flex items-center h-full pl-2">
                        <span className="text-[9px] text-white/90 font-mono font-bold">
                            {todaySla} ({pctOfFinal.toFixed(0)}%)
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
