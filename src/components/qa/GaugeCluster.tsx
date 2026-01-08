"use client";

import React from 'react';

interface MiniGaugeProps {
    label: string;
    value: number;
    color: string;
    description?: string;
}

export const MiniGauge: React.FC<MiniGaugeProps> = ({ label, value, color, description }) => {
    // SVG arc calculations for a semi-circular gauge - LARGER SIZE
    const radius = 50;
    const strokeWidth = 10;
    const normalizedValue = Math.min(100, Math.max(0, value));
    const circumference = Math.PI * radius;
    const offset = circumference - (normalizedValue / 100) * circumference;

    return (
        <div className="flex flex-col items-center gap-3 px-4">
            {/* Gauge SVG - Bigger */}
            <div className="relative w-28 h-16">
                <svg
                    width="112"
                    height="64"
                    viewBox="0 0 112 64"
                    className="transform"
                >
                    {/* Background arc */}
                    <path
                        d="M 6 56 A 50 50 0 0 1 106 56"
                        fill="none"
                        stroke="rgba(255,255,255,0.1)"
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                    />
                    {/* Value arc */}
                    <path
                        d="M 6 56 A 50 50 0 0 1 106 56"
                        fill="none"
                        stroke={color}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        style={{
                            transition: 'stroke-dashoffset 0.8s ease-out'
                        }}
                    />
                </svg>
                {/* Center value - Bigger */}
                <div className="absolute inset-0 flex items-end justify-center pb-0">
                    <span
                        className="text-2xl font-black tracking-tight"
                        style={{ color }}
                    >
                        {value}%
                    </span>
                </div>
            </div>
            {/* Label - More prominent */}
            <span className="text-xs font-bold text-white/70 uppercase tracking-widest text-center">
                {label}
            </span>
            {/* Description - High contrast */}
            {description && (
                <span className="text-[10px] text-indigo-100/90 font-medium text-center whitespace-nowrap -mt-2">
                    {description}
                </span>
            )}
        </div>
    );
};

interface GaugeClusterProps {
    gauges: MiniGaugeProps[];
}

export const GaugeCluster: React.FC<GaugeClusterProps> = ({ gauges }) => {
    return (
        <div className="glass-card rounded-2xl p-6 border border-white/10 flex justify-around items-start gap-6">
            {gauges.map((gauge, index) => (
                <React.Fragment key={gauge.label}>
                    <MiniGauge {...gauge} />
                    {index < gauges.length - 1 && (
                        <div className="h-20 w-px bg-white/10 self-center" />
                    )}
                </React.Fragment>
            ))}
        </div>
    );
};

export default GaugeCluster;
