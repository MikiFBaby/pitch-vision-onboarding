"use client";

import { useState, useEffect, useCallback } from "react";
import { useExecutiveFilters } from "@/context/ExecutiveFilterContext";
import { PeriodLabel } from "../layout";
import { Plus, Trash2, Save } from "lucide-react";
import type { CostConfig } from "@/types/dialedin-types";

interface LaborData {
  active_agents: number;
  avg_hourly_wage: number;
  total_hours_period: number;
  total_labor_cost: number;
}

function fmt(n: number, d = 0): string {
  if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(d > 0 ? d : 1)}K`;
  return `$${n.toFixed(d)}`;
}

function num(n: number): string {
  return n.toLocaleString("en-US");
}

export default function ExpensesPage() {
  const { startDate, endDate, dateRange } = useExecutiveFilters();
  const [costConfigs, setCostConfigs] = useState<CostConfig[]>([]);
  const [labor, setLabor] = useState<LaborData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const period = dateRange === "custom" ? `${startDate},${endDate}` : dateRange;
      const [costsRes, pnlRes] = await Promise.all([
        fetch("/api/executive/costs"),
        fetch(`/api/executive/pnl?period=${period}`),
      ]);

      if (costsRes.ok) {
        const d = await costsRes.json();
        setCostConfigs(d.data || []);
      }

      if (pnlRes.ok) {
        const d = await pnlRes.json();
        setLabor({
          active_agents: d.summary?.agent_count ?? 0,
          avg_hourly_wage: d.summary?.avg_hourly_wage ?? 0,
          total_hours_period: d.summary?.hours_worked ?? 0,
          total_labor_cost: d.summary?.labor_cost ?? 0,
        });
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Compute projections from cost configs
  const salaryCosts = costConfigs.filter((c) => c.category === "salary");
  const dialerCosts = costConfigs.filter((c) => c.category === "dialer");
  const subCosts = costConfigs.filter((c) => c.category === "subscription");
  const otherCosts = costConfigs.filter((c) => c.category === "other");

  const computeMonthly = (configs: CostConfig[]) =>
    configs.reduce((sum, c) => {
      if (c.rate_type === "flat_monthly") return sum + c.rate_amount;
      if (c.rate_type === "flat_daily") return sum + c.rate_amount * 30;
      if (c.rate_type === "flat_biweekly") return sum + c.rate_amount * (26 / 12);
      if (c.rate_type === "per_seat") return sum + c.rate_amount * (labor?.active_agents ?? 0);
      return sum;
    }, 0);

  const salaryMonthly = computeMonthly(salaryCosts);
  const dialerMonthly = computeMonthly(dialerCosts);
  const subMonthly = computeMonthly(subCosts);
  const otherMonthly = computeMonthly(otherCosts);
  const laborMonthly = (labor?.avg_hourly_wage ?? 0) * (labor?.active_agents ?? 0) * 160; // 160 hrs/month
  const totalMonthly = salaryMonthly + dialerMonthly + subMonthly + otherMonthly + laborMonthly;

  const handleDelete = async (id: string) => {
    await fetch("/api/executive/costs", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchData();
  };

  return (
    <div className="font-mono">
      <PeriodLabel title="EXPENSES" />
      <div className="p-4 space-y-4">
      {/* Burn Rate Summary */}
      <div className="grid grid-cols-6 gap-3">
        <BurnCard
          label="LABOR (PROJECTED)"
          monthly={laborMonthly}
          subtitle={`${num(labor?.active_agents ?? 0)} agents @ ${fmt(labor?.avg_hourly_wage ?? 0, 2)}/hr avg`}
          accent="red"
          loading={loading}
        />
        <BurnCard
          label="PAYROLL (FIXED)"
          monthly={salaryMonthly}
          subtitle={`${salaryCosts.length} staff members`}
          accent="purple"
          loading={loading}
        />
        <BurnCard
          label="DIALER COSTS"
          monthly={dialerMonthly}
          subtitle={`${dialerCosts.length} active items`}
          accent="amber"
          loading={loading}
        />
        <BurnCard
          label="SUBSCRIPTIONS"
          monthly={subMonthly}
          subtitle={`${subCosts.length} active items`}
          accent="cyan"
          loading={loading}
        />
        <BurnCard
          label="OTHER"
          monthly={otherMonthly}
          subtitle={`${otherCosts.length} active items`}
          accent="white"
          loading={loading}
        />
        <BurnCard
          label="TOTAL BURN RATE"
          monthly={totalMonthly}
          subtitle="all categories combined"
          accent="emerald"
          loading={loading}
          highlight
        />
      </div>

      {/* Labor Detail */}
      <div className="bg-[#0c1018] border border-[#1a2332] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] text-white/40 tracking-widest">LABOR COST (AUTO-COMPUTED)</div>
          <div className="text-[10px] text-white/20">employee_directory hourly_wage x DialedIn hours_worked</div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div>
            <div className="text-[10px] text-white/30 mb-1">ACTIVE AGENTS</div>
            <div className="text-xl font-bold text-white tabular-nums">{loading ? "---" : num(labor?.active_agents ?? 0)}</div>
          </div>
          <div>
            <div className="text-[10px] text-white/30 mb-1">AVG HOURLY WAGE</div>
            <div className="text-xl font-bold text-white tabular-nums">{loading ? "---" : fmt(labor?.avg_hourly_wage ?? 0, 2)}</div>
          </div>
          <div>
            <div className="text-[10px] text-white/30 mb-1">HOURS THIS PERIOD</div>
            <div className="text-xl font-bold text-cyan-400 tabular-nums">{loading ? "---" : num(Math.round(labor?.total_hours_period ?? 0))}</div>
          </div>
          <div>
            <div className="text-[10px] text-white/30 mb-1">LABOR COST THIS PERIOD</div>
            <div className="text-xl font-bold text-red-400 tabular-nums">{loading ? "---" : fmt(labor?.total_labor_cost ?? 0)}</div>
          </div>
        </div>
      </div>

      {/* Fixed Payroll Detail */}
      {salaryCosts.length > 0 && (
        <div className="bg-[#0c1018] border border-[#1a2332] rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#1a2332]">
            <div className="text-[10px] text-white/40 tracking-widest">FIXED PAYROLL (QA / HR / C-SUITE)</div>
            <div className="text-[10px] text-white/20">bi-weekly &amp; monthly salaries</div>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1a2332] text-[10px] text-white/40 tracking-wider">
                <th className="px-4 py-2 text-left">NAME</th>
                <th className="px-3 py-2 text-left">DEPT</th>
                <th className="px-3 py-2 text-left">FREQUENCY</th>
                <th className="px-3 py-2 text-right">AMOUNT</th>
                <th className="px-3 py-2 text-right">MONTHLY EST</th>
                <th className="px-3 py-2 text-center">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {salaryCosts.map((c) => {
                const monthly = c.rate_type === "flat_biweekly"
                  ? c.rate_amount * (26 / 12)
                  : c.rate_amount;
                const deptColors: Record<string, string> = {
                  qa: "bg-cyan-500/20 text-cyan-400",
                  hr: "bg-amber-500/20 text-amber-400",
                  c_suite: "bg-purple-500/20 text-purple-400",
                  payroll: "bg-emerald-500/20 text-emerald-400",
                };
                return (
                  <tr key={c.id} className="border-b border-[#1a2332]/50 hover:bg-white/[0.02]">
                    <td className="px-4 py-2 text-white/70 font-medium">{c.description}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${deptColors[c.subcategory || ""] || "bg-white/10 text-white/50"}`}>
                        {(c.subcategory || "other").toUpperCase().replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-white/40">
                      {c.rate_type === "flat_biweekly" ? "Bi-weekly" : "Monthly"}
                    </td>
                    <td className="px-3 py-2 text-right text-white/60 tabular-nums">{fmt(c.rate_amount, 0)}</td>
                    <td className="px-3 py-2 text-right text-purple-400 tabular-nums font-medium">{fmt(monthly, 0)}</td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="text-red-400/50 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-[#1a2332] bg-[#0a1019]">
                <td className="px-4 py-2 text-white/50 font-bold" colSpan={4}>TOTAL MONTHLY PAYROLL</td>
                <td className="px-3 py-2 text-right text-purple-400 tabular-nums font-bold">{fmt(salaryMonthly, 0)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Cost Config Table */}
      <div className="bg-[#0c1018] border border-[#1a2332] rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#1a2332]">
          <div className="text-[10px] text-white/40 tracking-widest">COST CONFIGURATION</div>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 transition-colors"
          >
            <Plus size={12} />
            ADD ITEM
          </button>
        </div>

        {showAdd && <AddCostForm onSave={() => { setShowAdd(false); fetchData(); }} onCancel={() => setShowAdd(false)} />}

        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#1a2332] text-[10px] text-white/40 tracking-wider">
              <th className="px-4 py-2 text-left">CATEGORY</th>
              <th className="px-3 py-2 text-left">DESCRIPTION</th>
              <th className="px-3 py-2 text-left">TYPE</th>
              <th className="px-3 py-2 text-right">RATE</th>
              <th className="px-3 py-2 text-right">MONTHLY EST</th>
              <th className="px-3 py-2 text-left">CAMPAIGN</th>
              <th className="px-3 py-2 text-center">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {costConfigs.filter((c) => c.category !== "salary").map((c) => {
              let monthly = 0;
              if (c.rate_type === "flat_monthly") monthly = c.rate_amount;
              else if (c.rate_type === "flat_daily") monthly = c.rate_amount * 30;
              else if (c.rate_type === "flat_biweekly") monthly = c.rate_amount * (26 / 12);
              else if (c.rate_type === "per_seat") monthly = c.rate_amount * (labor?.active_agents ?? 0);

              const catColors: Record<string, string> = {
                dialer: "bg-amber-500/20 text-amber-400",
                subscription: "bg-cyan-500/20 text-cyan-400",
                salary: "bg-purple-500/20 text-purple-400",
              };

              return (
                <tr key={c.id} className="border-b border-[#1a2332]/50 hover:bg-white/[0.02]">
                  <td className="px-4 py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${catColors[c.category] || "bg-white/10 text-white/50"}`}>
                      {c.category.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-white/70">{c.description}</td>
                  <td className="px-3 py-2 text-white/40">{c.rate_type}</td>
                  <td className="px-3 py-2 text-right text-white/60 tabular-nums">{fmt(c.rate_amount, 2)}</td>
                  <td className="px-3 py-2 text-right text-amber-400 tabular-nums font-medium">{fmt(monthly)}</td>
                  <td className="px-3 py-2 text-white/40">{c.campaign || "—"}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="text-red-400/50 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!costConfigs.filter((c) => c.category !== "salary").length && (
          <div className="py-8 text-center text-white/20 text-xs">
            No cost items configured — add dialer seats, subscriptions, and fixed costs to project your burn rate.
          </div>
        )}
      </div>

      {/* Projection Table */}
      <div className="bg-[#0c1018] border border-[#1a2332] rounded-lg p-4">
        <div className="text-[10px] text-white/40 tracking-widest mb-3">COST PROJECTIONS</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#1a2332] text-[10px] text-white/40 tracking-wider">
              <th className="px-4 py-2 text-left">CATEGORY</th>
              <th className="px-3 py-2 text-right">HOURLY</th>
              <th className="px-3 py-2 text-right">DAILY</th>
              <th className="px-3 py-2 text-right">WEEKLY</th>
              <th className="px-3 py-2 text-right">MONTHLY</th>
              <th className="px-3 py-2 text-right">ANNUAL (EST)</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: "Labor", monthly: laborMonthly, accent: "text-red-400" },
              { label: "Payroll", monthly: salaryMonthly, accent: "text-purple-400" },
              { label: "Dialer", monthly: dialerMonthly, accent: "text-amber-400" },
              { label: "Subscriptions", monthly: subMonthly, accent: "text-cyan-400" },
              { label: "Other", monthly: otherMonthly, accent: "text-white/50" },
            ].map((row) => (
              <tr key={row.label} className="border-b border-[#1a2332]/50">
                <td className="px-4 py-2 text-white/70">{row.label}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${row.accent}`}>{fmt(row.monthly / 720, 2)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${row.accent}`}>{fmt(row.monthly / 30)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${row.accent}`}>{fmt(row.monthly / 4.33)}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-medium ${row.accent}`}>{fmt(row.monthly)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${row.accent}`}>{fmt(row.monthly * 12)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-[#1a2332] font-bold">
              <td className="px-4 py-2 text-white">TOTAL</td>
              <td className="px-3 py-2 text-right tabular-nums text-emerald-400">{fmt(totalMonthly / 720, 2)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-emerald-400">{fmt(totalMonthly / 30)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-emerald-400">{fmt(totalMonthly / 4.33)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-emerald-400">{fmt(totalMonthly)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-emerald-400">{fmt(totalMonthly * 12)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}

function BurnCard({
  label,
  monthly,
  subtitle,
  accent,
  loading,
  highlight,
}: {
  label: string;
  monthly: number;
  subtitle: string;
  accent: string;
  loading: boolean;
  highlight?: boolean;
}) {
  const colors: Record<string, { border: string; text: string }> = {
    red: { border: "border-red-500/20", text: "text-red-400" },
    purple: { border: "border-purple-500/20", text: "text-purple-400" },
    amber: { border: "border-amber-500/20", text: "text-amber-400" },
    cyan: { border: "border-cyan-500/20", text: "text-cyan-400" },
    white: { border: "border-white/10", text: "text-white/50" },
    emerald: { border: "border-emerald-500/20", text: "text-emerald-400" },
  };
  const c = colors[accent] || colors.white;

  return (
    <div className={`bg-[#0c1018] border ${c.border} rounded-lg p-3 ${highlight ? "ring-1 ring-emerald-500/20" : ""}`}>
      <div className="text-[9px] text-white/40 tracking-widest uppercase mb-1">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${c.text}`}>{loading ? "---" : fmt(monthly)}<span className="text-[10px] font-normal text-white/30">/mo</span></div>
      <div className="text-[10px] text-white/20 mt-0.5">{subtitle}</div>
    </div>
  );
}

function AddCostForm({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const [category, setCategory] = useState<string>("dialer");
  const [subcategory, setSubcategory] = useState<string>("");
  const [rateType, setRateType] = useState<string>("flat_monthly");
  const [rateAmount, setRateAmount] = useState("");
  const [description, setDescription] = useState("");
  const [campaign, setCampaign] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!description || !rateAmount) return;
    setSaving(true);
    const res = await fetch("/api/executive/costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category,
        subcategory: subcategory || null,
        rate_type: rateType,
        rate_amount: parseFloat(rateAmount),
        description,
        campaign: campaign || null,
      }),
    });
    setSaving(false);
    if (res.ok) onSave();
  };

  return (
    <div className="px-4 py-3 border-b border-[#1a2332] bg-[#0a1019]">
      <div className="grid grid-cols-6 gap-2 text-xs">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-[#050a12] border border-[#1a2332] rounded px-2 py-1.5 text-white/70"
        >
          <option value="dialer">Dialer</option>
          <option value="subscription">Subscription</option>
          <option value="salary">Salary</option>
          <option value="other">Other</option>
        </select>
        {category === "salary" ? (
          <select
            value={subcategory}
            onChange={(e) => setSubcategory(e.target.value)}
            className="bg-[#050a12] border border-[#1a2332] rounded px-2 py-1.5 text-white/70"
          >
            <option value="">Dept...</option>
            <option value="qa">QA</option>
            <option value="hr">HR</option>
            <option value="c_suite">C-Suite</option>
            <option value="payroll">Payroll</option>
          </select>
        ) : null}
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={category === "salary" ? "Name..." : "Description..."}
          className={`bg-[#050a12] border border-[#1a2332] rounded px-2 py-1.5 text-white/70 ${category === "salary" ? "" : "col-span-2"}`}
        />
        <select
          value={rateType}
          onChange={(e) => setRateType(e.target.value)}
          className="bg-[#050a12] border border-[#1a2332] rounded px-2 py-1.5 text-white/70"
        >
          <option value="flat_monthly">Flat/Month</option>
          <option value="flat_biweekly">Flat/Bi-weekly</option>
          <option value="flat_daily">Flat/Day</option>
          <option value="per_seat">Per Seat</option>
        </select>
        <input
          value={rateAmount}
          onChange={(e) => setRateAmount(e.target.value)}
          placeholder="$ Amount"
          type="number"
          step="0.01"
          className="bg-[#050a12] border border-[#1a2332] rounded px-2 py-1.5 text-white/70 tabular-nums"
        />
        <div className="flex gap-1">
          <button
            onClick={handleSave}
            disabled={saving || !description || !rateAmount}
            className="flex-1 flex items-center justify-center gap-1 bg-amber-500/20 text-amber-400 rounded px-2 py-1.5 hover:bg-amber-500/30 disabled:opacity-30 transition-colors"
          >
            <Save size={12} />
            {saving ? "..." : "SAVE"}
          </button>
          <button
            onClick={onCancel}
            className="px-2 py-1.5 text-white/40 hover:text-white/70 transition-colors"
          >
            &times;
          </button>
        </div>
      </div>
    </div>
  );
}
