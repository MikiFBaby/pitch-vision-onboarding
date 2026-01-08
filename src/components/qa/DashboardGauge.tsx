"use client";

import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { GaugeData } from '@/types/qa-types';

interface DashboardGaugeProps {
    data: GaugeData;
}

export const DashboardGauge: React.FC<DashboardGaugeProps> = ({ data }) => {
    const chartData = [
        { name: 'Value', value: data.value },
        { name: 'Remaining', value: 100 - data.value },
    ];

    const COLORS = [data.color, 'rgba(255,255,255,0.1)'];

    return (
        <div className="glass-card rounded-2xl p-6 flex flex-col items-center justify-between h-full min-h-[260px] transition-all duration-500 transform hover:-translate-y-1.5 hover:scale-[1.02] hover:bg-white/[0.03] hover:border-white/30 border border-white/10 shadow-lg hover:shadow-2xl overflow-hidden group">
            <div className="w-full flex justify-between items-start mb-2">
                <h3 className="text-xs font-black text-white/60 uppercase tracking-widest">{data.label}</h3>
                <div
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: data.color, boxShadow: `0 0 10px ${data.color}` }}
                />
            </div>

            <div className="relative w-full h-[140px] flex justify-center items-end overflow-hidden mt-2">
                <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                        <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            startAngle={180}
                            endAngle={0}
                            innerRadius={85}
                            outerRadius={105}
                            paddingAngle={0}
                            dataKey="value"
                            stroke="none"
                            cornerRadius={8}
                        >
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>

                <div className="absolute bottom-0 w-full text-center pb-2">
                    <div className="text-5xl font-black text-white tracking-tighter">
                        {data.value}%
                    </div>
                </div>
            </div>

            <div className="w-full mt-6 pt-4 border-t border-white/10 text-center">
                <div className="flex justify-center items-baseline gap-2">
                    <span className="text-2xl font-bold text-white">{data.count}</span>
                    <span className="text-sm text-white/40 font-bold uppercase tracking-wide">Calls</span>
                </div>
                <p className="text-xs text-white/50 font-medium mt-1">{data.subLabel}</p>
            </div>
        </div>
    );
};

export default DashboardGauge;
