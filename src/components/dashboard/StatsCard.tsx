import { Card, CardContent } from "@/components/ui/card";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

interface StatsCardProps {
    title: string;
    value: string | number;
    icon?: React.ReactNode;
    trend?: "up" | "down" | "neutral";
    trendValue?: string;
    className?: string;
    index?: number;
}

export default function StatsCard({
    title,
    value,
    icon,
    trend,
    trendValue,
    className,
    index = 0
}: StatsCardProps) {
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const mouseXSpring = useSpring(x);
    const mouseYSpring = useSpring(y);

    const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["10deg", "-10deg"]);
    const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-10deg", "10deg"]);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const xPct = mouseX / width - 0.5;
        const yPct = mouseY / height - 0.5;
        x.set(xPct);
        y.set(yPct);
    };

    const handleMouseLeave = () => {
        x.set(0);
        y.set(0);
    };

    const accentColor = trend === "up" ? "emerald" : trend === "down" ? "rose" : "indigo";
    const accentMap: Record<string, { border: string; glow: string; icon: string }> = {
        emerald: { border: "border-emerald-500/20", glow: "via-emerald-500/30", icon: "text-emerald-400 bg-emerald-500/15" },
        rose: { border: "border-rose-500/20", glow: "via-rose-500/30", icon: "text-rose-400 bg-rose-500/15" },
        indigo: { border: "border-white/[0.06]", glow: "via-indigo-500/20", icon: "text-indigo-400 bg-white/[0.08]" },
    };
    const accent = accentMap[accentColor];

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            style={{
                rotateX,
                rotateY,
                transformStyle: "preserve-3d",
            }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className={cn("perspective-1000", className)}
        >
            <Card className={cn(
                "glass-card relative overflow-hidden group transition-all duration-300 hover:border-indigo-500/30",
                accent.border,
            )}>
                {/* Top accent gradient bar */}
                <div className={cn(
                    "absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent to-transparent transition-opacity",
                    accent.glow,
                    trend ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                )} />

                <CardContent className="p-6 relative z-10" style={{ transform: "translateZ(50px)" }}>
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[11px] font-bold text-white/60 uppercase tracking-[0.2em]">{title}</span>
                        <div className={cn(
                            "p-2 rounded-lg group-hover:scale-110 transition-transform shadow-sm",
                            accent.icon,
                        )}>
                            {icon}
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <div className="text-3xl font-bold tracking-tight text-white">{value}</div>

                        {(trend || trendValue) && (
                            <div className="flex items-center gap-2 mt-0.5 pt-2.5 border-t border-white/[0.06]">
                                {trend && (
                                    <div className={cn(
                                        "flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10px] font-bold",
                                        trend === "up" ? "bg-emerald-500/15 text-emerald-400" :
                                            trend === "down" ? "bg-rose-500/15 text-rose-400" : "bg-white/[0.06] text-white/50"
                                    )}>
                                        {trend === "up" && <ArrowUp size={10} />}
                                        {trend === "down" && <ArrowDown size={10} />}
                                        {trend === "neutral" && <Minus size={10} />}
                                        {trendValue}
                                    </div>
                                )}
                                {!trend && trendValue && (
                                    <span className="text-[10px] text-white/45 font-medium">{trendValue}</span>
                                )}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}
