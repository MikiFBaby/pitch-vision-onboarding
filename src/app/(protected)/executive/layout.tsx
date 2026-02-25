"use client";

import React, { Suspense, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/layout/Sidebar";
import { ExecutiveFilterProvider, useExecutiveFilters } from "@/context/ExecutiveFilterContext";
import {
  LayoutDashboard,
  Activity,
  DollarSign,
  TrendingUp,
  Wallet,
  BarChart3,
  Calendar,
  Trophy,
} from "lucide-react";
import type { DateRangePreset } from "@/types/dialedin-types";

const EXEC_TABS = [
  { href: "/executive", label: "COMMAND CENTER", icon: LayoutDashboard },
  { href: "/executive/operations", label: "OPERATIONS", icon: Activity },
  { href: "/executive/revenue", label: "REVENUE", icon: DollarSign },
  { href: "/executive/pnl", label: "P&L", icon: TrendingUp },
  { href: "/executive/expenses", label: "EXPENSES", icon: Wallet },
  { href: "/executive/roster", label: "GM ROSTER", icon: Trophy },
  { href: "/executive/analytics", label: "ANALYTICS", icon: BarChart3 },
];

const DATE_PRESETS: { label: string; value: DateRangePreset }[] = [
  { label: "7D", value: "7d" },
  { label: "14D", value: "14d" },
  { label: "30D", value: "30d" },
  { label: "MTD", value: "mtd" },
  { label: "YTD", value: "ytd" },
];

/** Format date string "2026-02-20" → "Feb 20, 2026" */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Format date range as "Feb 1 – Feb 20, 2026" or "Feb 1 – 20, 2026" if same month/year */
function formatDateRange(start: string, end: string): string {
  const s = new Date(start + "T12:00:00");
  const e = new Date(end + "T12:00:00");
  const sMonth = s.toLocaleDateString("en-US", { month: "short" });
  const eMonth = e.toLocaleDateString("en-US", { month: "short" });
  const sYear = s.getFullYear();
  const eYear = e.getFullYear();

  if (sYear === eYear && sMonth === eMonth) {
    return `${sMonth} ${s.getDate()} – ${e.getDate()}, ${eYear}`;
  }
  if (sYear === eYear) {
    return `${sMonth} ${s.getDate()} – ${eMonth} ${e.getDate()}, ${eYear}`;
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function CommandBar() {
  const {
    dateRange, setDateRange, setCustomDates,
    startDate, endDate,
    campaign, setCampaign,
    agent, setAgent,
    resetFilters,
  } = useExecutiveFilters();

  const [showCustom, setShowCustom] = useState(false);
  const [customStart, setCustomStart] = useState(startDate);
  const [customEnd, setCustomEnd] = useState(endDate);

  const handlePreset = (preset: DateRangePreset) => {
    setShowCustom(false);
    setDateRange(preset);
  };

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      setCustomDates(customStart, customEnd);
      setShowCustom(false);
    }
  };

  return (
    <div className="border-b border-[#243044] bg-[#0a1220] font-mono">
      <div className="h-11 flex items-center gap-3 px-4 text-[11px] tracking-wider">
        {/* Date Presets */}
        <div className="flex items-center gap-1">
          <span className="text-white/60 mr-1">PERIOD</span>
          {DATE_PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => handlePreset(p.value)}
              className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
                dateRange === p.value && !showCustom
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  : "text-white/70 hover:text-white/90 hover:bg-white/8"
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setShowCustom(!showCustom)}
            className={`px-2.5 py-1 rounded text-[11px] transition-colors flex items-center gap-1 ${
              dateRange === "custom" || showCustom
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                : "text-white/70 hover:text-white/90 hover:bg-white/8"
            }`}
          >
            <Calendar size={11} />
            CUSTOM
          </button>
        </div>

        {/* Date Range Display */}
        <div className="flex items-center gap-1.5">
          <div className="w-px h-5 bg-[#1e2d42]" />
          <span className="text-white/85 text-[11px]">{formatDateRange(startDate, endDate)}</span>
        </div>

        <div className="w-px h-5 bg-[#1e2d42]" />

        {/* Campaign Filter */}
        <div className="flex items-center gap-1">
          <span className="text-white/60">CAMPAIGN</span>
          {campaign ? (
            <button
              onClick={() => setCampaign(null)}
              className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-[11px]"
            >
              {campaign} &times;
            </button>
          ) : (
            <span className="text-white/50 px-1">ALL</span>
          )}
        </div>

        <div className="w-px h-5 bg-[#1e2d42]" />

        {/* Agent Filter */}
        <div className="flex items-center gap-1">
          <span className="text-white/60">AGENT</span>
          {agent ? (
            <button
              onClick={() => setAgent(null)}
              className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-[11px]"
            >
              {agent} &times;
            </button>
          ) : (
            <span className="text-white/50 px-1">ALL</span>
          )}
        </div>

        <div className="flex-1" />

        {/* Reset */}
        {(campaign || agent || dateRange !== "mtd") && (
          <button
            onClick={() => { resetFilters(); setShowCustom(false); }}
            className="text-white/60 hover:text-white/85 text-[11px] transition-colors"
          >
            RESET
          </button>
        )}

        {/* Live Clock */}
        <LiveClock />
      </div>

      {/* Custom Date Picker Row */}
      {showCustom && (
        <div className="h-10 flex items-center gap-2 px-4 border-t border-[#243044] bg-[#081020]">
          <span className="text-[11px] text-white/60 tracking-wider">FROM</span>
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="bg-[#0f1923] border border-[#243044] rounded px-2 py-1 text-[11px] text-white/90 font-mono [color-scheme:dark]"
          />
          <span className="text-[11px] text-white/60 tracking-wider">TO</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="bg-[#0f1923] border border-[#243044] rounded px-2 py-1 text-[11px] text-white/90 font-mono [color-scheme:dark]"
          />
          <button
            onClick={handleCustomApply}
            className="px-3 py-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[11px] hover:bg-amber-500/30 transition-colors"
          >
            APPLY
          </button>
          <button
            onClick={() => setShowCustom(false)}
            className="text-white/60 hover:text-white/85 text-[11px] transition-colors"
          >
            CANCEL
          </button>
        </div>
      )}
    </div>
  );
}

function LiveClock() {
  const [time, setTime] = React.useState("");

  React.useEffect(() => {
    const update = () => {
      setTime(
        new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
      );
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-1.5">
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      <span className="text-emerald-400 font-mono text-[11px] tabular-nums">{time}</span>
    </div>
  );
}

function WorkspaceNav() {
  const pathname = usePathname();

  return (
    <div className="h-9 flex items-center gap-0 border-b border-[#243044] bg-[#0d1525] overflow-x-auto">
      {EXEC_TABS.map((tab) => {
        const isActive =
          tab.href === "/executive"
            ? pathname === "/executive"
            : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex items-center gap-1.5 px-4 h-full text-[11px] font-mono tracking-wider border-r border-[#243044] transition-colors whitespace-nowrap ${
              isActive
                ? "bg-[#0f1a2d] text-amber-400 border-b-2 border-b-amber-500"
                : "text-white/60 hover:text-white/85 hover:bg-white/[0.04]"
            }`}
          >
            <Icon size={12} />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

/** Reusable period label shown at the top of each page. Import from layout. */
export function PeriodLabel({ title }: { title: string }) {
  const { dateRange, startDate, endDate, campaign, agent } = useExecutiveFilters();
  const presetLabel = dateRange === "custom" ? "Custom" : dateRange.toUpperCase();

  return (
    <div className="flex items-center gap-2 px-4 py-2 font-mono text-[11px] tracking-wider border-b border-[#243044]/50 bg-[#081020]/50">
      <span className="text-amber-400 font-semibold">{title}</span>
      <span className="text-white/35">·</span>
      <span className="text-white/75">{formatDateRange(startDate, endDate)}</span>
      <span className="text-white/35">·</span>
      <span className="text-white/50">{presetLabel}</span>
      {campaign && (
        <>
          <span className="text-white/35">·</span>
          <span className="text-cyan-400/80">Campaign: {campaign}</span>
        </>
      )}
      {agent && (
        <>
          <span className="text-white/35">·</span>
          <span className="text-cyan-400/80">Agent: {agent}</span>
        </>
      )}
    </div>
  );
}

function ExecutiveLayoutInner({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#060c16] text-white flex overflow-hidden">
      <Sidebar />
      <main className="flex-1 ml-72 flex flex-col h-screen overflow-hidden">
        {/* Command Bar — global filters */}
        <CommandBar />

        {/* Workspace Navigation */}
        <WorkspaceNav />

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

export default function ExecutiveLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#060c16] text-white flex items-center justify-center font-mono text-sm text-white/60">
          LOADING...
        </div>
      }
    >
      <ExecutiveFilterProvider>
        <ExecutiveLayoutInner>{children}</ExecutiveLayoutInner>
      </ExecutiveFilterProvider>
    </Suspense>
  );
}
