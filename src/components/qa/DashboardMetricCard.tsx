"use client";

import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface TrendData {
    label: string;
    value: number; // positive = up, negative = down, 0 = neutral
}

interface MetricCardProps {
    title: string;
    value: number | string;
    subLabel: string;
    subValue?: string;
    color: string;
    trend?: TrendData;
    icon?: React.ReactNode;
}

export const DashboardMetricCard: React.FC<MetricCardProps> = ({
    title,
    value,
    subLabel,
    subValue,
    color,
    trend,
    icon
}) => {
    const getTrendIcon = () => {
        if (!trend) return null;
        if (trend.value > 0) return <TrendingUp size={14} className="text-emerald-400" />;
        if (trend.value < 0) return <TrendingDown size={14} className="text-rose-400" />;
        return <Minus size={14} className="text-white/40" />;
    };

    const getTrendColor = () => {
        if (!trend) return 'text-white/40';
        if (trend.value > 0) return 'text-emerald-400';
        if (trend.value < 0) return 'text-rose-400';
        return 'text-white/40';
    };

    return (
        <div className="glass-card rounded-2xl p-6 flex flex-col justify-between h-full min-h-[200px] transition-all duration-500 transform hover:-translate-y-1.5 hover:scale-[1.02] border border-white/10 shadow-lg hover:shadow-2xl overflow-hidden group relative"
            style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, transparent 50%)' }}
            onMouseEnter={(e) => e.currentTarget.style.background = `linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(${color === '#8b5cf6' ? '139,92,246' : color === '#10b981' ? '16,185,129' : '244,63,94'},0.08) 100%)`}
            onMouseLeave={(e) => e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, transparent 50%)'}
        >
            {/* Header */}
            <div className="flex justify-between items-start">
                <h3 className="text-xs font-black text-white/80 uppercase tracking-widest">{title}</h3>
                <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: color, boxShadow: `0 0 12px ${color}` }}
                />
            </div>

            {/* Main Value */}
            <div className="flex items-baseline gap-3 mt-4">
                <span className="text-5xl font-black text-white tracking-tighter">{value}</span>
                {icon && <span className="text-white/30">{icon}</span>}
            </div>

            {/* Sub-metrics */}
            <div className="mt-4 pt-4 border-t border-white/10">
                <div className="flex justify-between items-center">
                    <span className="text-sm text-white/70 font-medium">{subLabel}</span>
                    {subValue && (
                        <span className="text-lg font-bold" style={{ color }}>{subValue}</span>
                    )}
                </div>

                {/* Trend Indicator */}
                {trend && (
                    <div className={`flex items-center gap-1.5 mt-2 text-xs font-semibold ${getTrendColor()}`}>
                        {getTrendIcon()}
                        <span>{Math.abs(trend.value)}% {trend.label}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DashboardMetricCard;
