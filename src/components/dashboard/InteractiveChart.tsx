"use client";
import React, { useState } from "react";
import { motion } from "framer-motion";

interface DataPoint {
    label: string;
    value: number;
}

interface InteractiveChartProps {
    data: DataPoint[];
    color?: string;
    height?: number;
    className?: string;
}

export default function InteractiveChart({
    data,
    color = "#6366f1",
    height = 200,
    className
}: InteractiveChartProps) {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    const maxValue = Math.max(...data.map(d => d.value));
    const padding = 20;
    const chartWidth = 400;
    const chartHeight = height;

    const points = data.map((d, i) => {
        const x = (i / (data.length - 1)) * chartWidth;
        const y = chartHeight - (d.value / maxValue) * (chartHeight - padding * 2) - padding;
        return { x, y };
    });

    const pathData = points.reduce((acc, point, i, arr) => {
        if (i === 0) return `M ${point.x} ${point.y}`;
        const prev = arr[i - 1];
        const cx = (prev.x + point.x) / 2;
        return `${acc} C ${cx} ${prev.y}, ${cx} ${point.y}, ${point.x} ${point.y}`;
    }, "");

    const areaData = `${pathData} L ${points[points.length - 1].x} ${chartHeight} L ${points[0].x} ${chartHeight} Z`;

    return (
        <div className={`relative ${className}`}>
            <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="w-full h-full overflow-visible"
                preserveAspectRatio="none"
            >
                {/* Area Background Gradient */}
                <defs>
                    <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.2" />
                        <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>
                </defs>

                {/* Animated Area */}
                <motion.path
                    d={areaData}
                    fill="url(#chartGradient)"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 1, delay: 0.5 }}
                />

                {/* Animated Line */}
                <motion.path
                    d={pathData}
                    fill="none"
                    stroke={color}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 1.5, ease: "easeInOut" }}
                />

                {/* Data Points */}
                {points.map((point, i) => (
                    <g key={i} onMouseEnter={() => setHoveredIndex(i)} onMouseLeave={() => setHoveredIndex(null)}>
                        <motion.circle
                            cx={point.x}
                            cy={point.y}
                            r="4"
                            fill="#000"
                            stroke={color}
                            strokeWidth="2"
                            initial={{ scale: 0 }}
                            animate={{ scale: hoveredIndex === i ? 1.5 : 1 }}
                            transition={{ type: "spring", stiffness: 300 }}
                            className="cursor-pointer"
                        />
                        {hoveredIndex === i && (
                            <motion.text
                                x={point.x}
                                y={point.y - 12}
                                textAnchor="middle"
                                className="text-[10px] font-bold fill-white shadow-xl"
                                initial={{ opacity: 0, y: 0 }}
                                animate={{ opacity: 1, y: -5 }}
                            >
                                {data[i].value}%
                            </motion.text>
                        )}
                    </g>
                ))}
            </svg>

            {/* X-Axis Labels */}
            <div className="flex justify-between mt-4">
                {data.map((d, i) => (
                    <span key={i} className="text-[10px] font-bold text-white/20 uppercase tracking-tighter">
                        {d.label}
                    </span>
                ))}
            </div>
        </div>
    );
}
