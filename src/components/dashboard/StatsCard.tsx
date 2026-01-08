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
                "glass-card border-white/5 relative overflow-hidden group hover:border-indigo-500/30 transition-all duration-300 shimmer-effect",
            )}>
                <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                <CardContent className="p-6 relative z-10" style={{ transform: "translateZ(50px)" }}>
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[11px] font-bold text-white/70 uppercase tracking-[0.2em]">{title}</span>
                        <div className="p-2 rounded-lg bg-white/10 text-indigo-400 group-hover:scale-110 transition-transform shadow-sm">
                            {icon}
                        </div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <div className="text-3xl font-bold tracking-tight text-white drop-shadow-sm">{value}</div>

                        {trend && (
                            <div className="flex items-center gap-2 mt-1">
                                <div className={cn(
                                    "flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border border-transparent",
                                    trend === "up" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/20" :
                                        trend === "down" ? "bg-rose-500/20 text-rose-400 border-rose-500/20" : "bg-white/10 text-white/60"
                                )}>
                                    {trend === "up" && <ArrowUp size={10} />}
                                    {trend === "down" && <ArrowDown size={10} />}
                                    {trend === "neutral" && <Minus size={10} />}
                                    {trendValue}
                                </div>
                                <span className="text-[11px] text-white/60 font-medium tracking-wide">vs last month</span>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}
