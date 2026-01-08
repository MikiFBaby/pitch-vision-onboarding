"use client";

import React from 'react';
import { Card } from './ui/Card';
import { LucideIcon } from 'lucide-react';

interface StatMetricProps {
  label: string;
  value: string;
  trend?: string;
  trendUp?: boolean;
  icon: LucideIcon;
  color: 'emerald' | 'rose' | 'indigo' | 'amber' | 'slate' | 'purple';
}

export const StatMetric: React.FC<StatMetricProps> = ({ label, value, trend, trendUp, icon: Icon, color }) => {
  
  const getColorClasses = (c: string) => {
    switch (c) {
      case 'emerald': return 'bg-emerald-50 text-emerald-600';
      case 'rose': return 'bg-rose-50 text-rose-600';
      case 'indigo': return 'bg-indigo-50 text-indigo-600';
      case 'amber': return 'bg-amber-50 text-amber-600';
      case 'purple': return 'bg-purple-50 text-purple-600';
      default: return 'bg-slate-50 text-slate-600';
    }
  };

  const colorClass = getColorClasses(color);

  return (
    <Card className="flex flex-col justify-between hover:shadow-lg transition-shadow duration-300 border-l-4 border-l-transparent hover:border-l-purple-500">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-semibold text-slate-500 mb-1 uppercase tracking-wider text-[10px]">{label}</p>
          <h4 className="text-4xl font-bold text-slate-900 tracking-tight">{value}</h4>
        </div>
        <div className={`p-3 rounded-xl ${colorClass}`}>
          <Icon size={28} strokeWidth={1.5} />
        </div>
      </div>
      
      {trend && (
        <div className="mt-4 flex items-center">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${trendUp ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
            {trend}
          </span>
          <span className="text-xs text-slate-400 ml-2 font-medium">vs. last week</span>
        </div>
      )}
    </Card>
  );
};