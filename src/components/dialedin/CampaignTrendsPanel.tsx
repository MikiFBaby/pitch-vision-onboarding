"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import type { SkillTrendPoint } from "@/types/dialedin-types";

const COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#8b5cf6", "#ec4899"];

export default function CampaignTrendsPanel() {
  const [skills, setSkills] = useState<string[]>([]);
  const [trends, setTrends] = useState<Record<string, SkillTrendPoint[]>>({});
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/dialedin/skill-trends?days=30")
      .then((r) => r.json())
      .then((json) => {
        setSkills(json.skills || []);
        setTrends(json.trends || {});
        setVisible(new Set(json.skills || []));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const chartData = useMemo(() => {
    const dateMap = new Map<string, Record<string, number>>();
    for (const [skill, points] of Object.entries(trends)) {
      for (const p of points) {
        const existing = dateMap.get(p.date) || {};
        existing[skill] = p.avg_tph;
        dateMap.set(p.date, existing);
      }
    }
    return Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({ date: date.slice(5), ...values }));
  }, [trends]);

  const toggleSkill = (skill: string) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(skill)) next.delete(skill);
      else next.add(skill);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-[#0c1018] border border-[#1a2332]">
        <div className="px-3 py-1.5 border-b border-[#1a2332]">
          <span className="text-[9px] uppercase tracking-wider text-amber-400 font-mono font-bold">Campaign Trends</span>
        </div>
        <div className="flex-1 animate-pulse bg-white/[0.02]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0c1018] border border-[#1a2332]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1a2332]">
        <span className="text-[9px] uppercase tracking-wider text-amber-400 font-mono font-bold">Campaign SLA/hr Trends</span>
        <div className="flex items-center gap-2">
          {skills.map((skill, i) => (
            <button
              key={skill}
              onClick={() => toggleSkill(skill)}
              className={`flex items-center gap-1 text-[8px] font-mono transition-opacity ${
                visible.has(skill) ? "opacity-100" : "opacity-30"
              }`}
            >
              <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="text-white/50">{skill}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 px-1 py-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="date"
              tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 9, fontFamily: "monospace" }}
              axisLine={{ stroke: "#1a2332" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9, fontFamily: "monospace" }}
              axisLine={false}
              tickLine={false}
              width={30}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0c1018",
                border: "1px solid #1a2332",
                color: "white",
                fontSize: 11,
                fontFamily: "monospace",
              }}
            />
            {skills.filter((s) => visible.has(s)).map((skill, i) => (
              <Line
                key={skill}
                type="monotone"
                dataKey={skill}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={false}
                name={skill}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
