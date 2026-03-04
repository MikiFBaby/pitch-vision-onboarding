"use client";

import { useState } from "react";
import { Calendar, RefreshCw, Upload, Sparkles } from "lucide-react";
import type { Workspace } from "@/types/dialedin-types";

interface BloombergHeaderProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  dateRange: string;
  onRangeChange: (range: string) => void;
  onUploadClick: () => void;
  onInsightsClick: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  showUpload: boolean;
  showInsights: boolean;
  workspace: Workspace;
  onWorkspaceChange: (ws: Workspace) => void;
}

const WORKSPACES: { key: Workspace; label: string }[] = [
  { key: "live", label: "LIVE" },
  { key: "analytics", label: "ANALYTICS" },
  { key: "coaching", label: "COACHING" },
  { key: "revenue", label: "REVENUE" },
  { key: "intraday", label: "INTRADAY" },
];

export default function BloombergHeader({
  selectedDate,
  onDateChange,
  dateRange,
  onRangeChange,
  onUploadClick,
  onInsightsClick,
  onRefresh,
  refreshing,
  showUpload,
  showInsights,
  workspace,
  onWorkspaceChange,
}: BloombergHeaderProps) {
  const isCustomRange = dateRange.includes(",");
  const [showCustom, setShowCustom] = useState(isCustomRange);
  const [customStart, setCustomStart] = useState(() => {
    if (isCustomRange) return dateRange.split(",")[0];
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [customEnd, setCustomEnd] = useState(() => {
    if (isCustomRange) return dateRange.split(",")[1];
    return new Date().toISOString().split("T")[0];
  });

  const handlePresetRange = (range: string) => {
    setShowCustom(false);
    onRangeChange(range);
  };

  const handleCustomToggle = () => {
    if (showCustom) {
      setShowCustom(false);
      onRangeChange("7d");
    } else {
      setShowCustom(true);
      onRangeChange(`${customStart},${customEnd}`);
    }
  };

  const handleCustomDateChange = (type: "start" | "end", value: string) => {
    const newStart = type === "start" ? value : customStart;
    const newEnd = type === "end" ? value : customEnd;
    if (type === "start") setCustomStart(value);
    if (type === "end") setCustomEnd(value);
    if (newStart && newEnd) onRangeChange(`${newStart},${newEnd}`);
  };

  return (
    <div className="shrink-0">
      {/* Top bar */}
      <div className="flex items-center justify-between h-9 px-3 border-b border-[#1a2332] bg-[#0c1018]">
        {/* Left: Label */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-amber-400 text-xs font-bold tracking-wider">DIALEDIN</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>

        {/* Center: Date + Range */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 border border-[#1a2332] bg-[#050a12]">
            <Calendar size={11} className="text-white/30" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="bg-transparent text-white/60 text-[11px] font-mono outline-none [color-scheme:dark] w-[100px]"
            />
          </div>
          <div className="flex border border-[#1a2332] overflow-hidden">
            {["7d", "14d", "30d"].map((range) => (
              <button
                key={range}
                onClick={() => handlePresetRange(range)}
                className={`px-2 py-0.5 text-[10px] font-mono uppercase transition-colors ${
                  dateRange === range
                    ? "bg-amber-400/15 text-amber-400"
                    : "text-white/30 hover:text-white/50 bg-[#050a12]"
                }`}
              >
                {range}
              </button>
            ))}
            <button
              onClick={handleCustomToggle}
              className={`px-2 py-0.5 text-[10px] font-mono uppercase transition-colors border-l border-[#1a2332] ${
                isCustomRange
                  ? "bg-amber-400/15 text-amber-400"
                  : "text-white/30 hover:text-white/50 bg-[#050a12]"
              }`}
            >
              Custom
            </button>
          </div>
          {showCustom && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customStart}
                onChange={(e) => handleCustomDateChange("start", e.target.value)}
                className="bg-[#050a12] border border-[#1a2332] text-white/60 text-[10px] font-mono px-1.5 py-0.5 outline-none [color-scheme:dark] w-[105px]"
              />
              <span className="text-white/20 text-[10px] font-mono">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => handleCustomDateChange("end", e.target.value)}
                className="bg-[#050a12] border border-[#1a2332] text-white/60 text-[10px] font-mono px-1.5 py-0.5 outline-none [color-scheme:dark] w-[105px]"
              />
            </div>
          )}
        </div>

        {/* Right: Insights + Upload + Refresh */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onInsightsClick}
            className={`p-1 transition-colors ${
              showInsights ? "text-amber-400" : "text-white/30 hover:text-white/50"
            }`}
            title="AI Insights"
          >
            <Sparkles size={13} />
          </button>
          <button
            onClick={onUploadClick}
            className={`p-1 transition-colors ${
              showUpload ? "text-amber-400" : "text-white/30 hover:text-white/50"
            }`}
          >
            <Upload size={13} />
          </button>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="p-1 text-white/30 hover:text-white/50 transition-colors"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Workspace Tab Bar */}
      <div className="flex items-center h-6 px-3 border-b border-[#1a2332] bg-[#080e17]">
        <div className="flex items-center gap-0">
          {WORKSPACES.map((ws) => (
            <button
              key={ws.key}
              onClick={() => onWorkspaceChange(ws.key)}
              className={`px-3 py-0.5 text-[9px] uppercase tracking-wider font-mono font-bold transition-colors ${
                workspace === ws.key
                  ? "text-amber-400 border-b border-amber-400"
                  : "text-white/25 hover:text-white/40"
              }`}
            >
              {ws.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
