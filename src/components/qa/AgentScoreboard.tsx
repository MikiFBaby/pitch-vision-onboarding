"use client";


import React, { useMemo, useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { CallData } from '@/types/qa-types';
import { supabase } from '@/lib/supabase-client';
import { Users, Search, TrendingUp, TrendingDown, AlertTriangle, ShieldCheck, Star, PhoneCall, ChevronRight, Activity, BarChart3, Trophy, Zap, Calendar } from 'lucide-react';

// Employee directory record for avatar lookup
interface EmployeeRecord {
  id: string;
  first_name: string;
  last_name: string;
  user_image: string | null;
}

// Time range options
type TimeRange = 'today' | '7d' | '14d' | '30d' | '60d' | '90d' | 'all';

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string; days: number | null }[] = [
  { value: 'today', label: 'Today', days: 0 },
  { value: '7d', label: '7 Days', days: 7 },
  { value: '14d', label: '14 Days', days: 14 },
  { value: '30d', label: '30 Days', days: 30 },
  { value: '60d', label: '60 Days', days: 60 },
  { value: '90d', label: '90 Days', days: 90 },
  { value: 'all', label: 'All Time', days: null },
];

interface AgentScoreboardProps {
  calls: CallData[];
  onReviewAgent: (agentName: string, riskyAgentNames?: string[]) => void;
}

interface AgentStats {
  name: string;
  avgScore: number;
  totalCalls: number;
  lastScore: number;
  trend: 'up' | 'down' | 'stable';
  riskLevel: 'Safe' | 'Warning' | 'Risk';
  phoneNumbers: string[];
  campaigns: string[];
}

export const AgentScoreboard: React.FC<AgentScoreboardProps> = ({ calls, onReviewAgent }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRange>('all');
  const [employeeDirectory, setEmployeeDirectory] = useState<EmployeeRecord[]>([]);

  // Fetch employee directory for avatar lookup
  useEffect(() => {
    const fetchEmployees = async () => {
      const { data, error } = await supabase
        .from('employee_directory')
        .select('id, first_name, last_name, user_image');

      if (!error && data) {
        setEmployeeDirectory(data);
      }
    };
    fetchEmployees();
  }, []);

  // Helper to find employee image by agent name
  const getAgentImage = (agentName: string): string | null => {
    if (!agentName || employeeDirectory.length === 0) return null;

    const agentNameLower = agentName.toLowerCase().trim();
    const nameParts = agentNameLower.split(' ').filter(p => p.length > 0);

    const match = employeeDirectory.find(emp => {
      const firstName = (emp.first_name || '').toLowerCase().trim();
      const lastName = (emp.last_name || '').toLowerCase().trim();
      const fullName = `${firstName} ${lastName}`;

      // Try multiple matching strategies:
      // 1. Exact full name match
      if (agentNameLower === fullName) return true;
      // 2. First part matches first name (handles "John" matching "John Smith")
      if (nameParts[0] === firstName) return true;
      // 3. Agent name contains employee full name or vice versa
      if (agentNameLower.includes(fullName) || fullName.includes(agentNameLower)) return true;
      // 4. First name + last name initial match (handles "John S" matching "John Smith")
      if (nameParts.length >= 2 && nameParts[0] === firstName && lastName.startsWith(nameParts[1])) return true;

      return false;
    });

    return match?.user_image || null;
  };

  // Filter calls by selected time range
  const filteredByTimeCalls = useMemo(() => {
    const option = TIME_RANGE_OPTIONS.find(o => o.value === selectedTimeRange);
    if (!option || option.days === null) return calls; // 'all' returns everything

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (option.days === 0) {
      // Today only
      return calls.filter(c => {
        const callDate = new Date(c.timestamp);
        return callDate >= startOfToday;
      });
    }

    // X days ago
    const cutoffDate = new Date(startOfToday);
    cutoffDate.setDate(cutoffDate.getDate() - option.days);

    return calls.filter(c => {
      const callDate = new Date(c.timestamp);
      return callDate >= cutoffDate;
    });
  }, [calls, selectedTimeRange]);

  const agentData = useMemo(() => {
    const map = new Map<string, { displayName: string; calls: CallData[] }>();

    // Aggressive normalization helper to catch all edge cases
    const normalizeForKey = (name: string): string => {
      return name
        .trim()
        .replace(/\s+/g, ' ')                    // Collapse whitespace
        .replace(/[\u200B-\u200D\uFEFF]/g, '')   // Remove zero-width chars
        .normalize('NFKC')                       // Normalize unicode
        .toLowerCase();
    };

    filteredByTimeCalls.forEach(c => {
      const rawName = c.agentName || 'Unknown';
      const trimmedName = rawName.trim().replace(/\s+/g, ' '); // Display name
      const normalizedKey = normalizeForKey(rawName);

      if (!map.has(normalizedKey)) {
        map.set(normalizedKey, { displayName: trimmedName, calls: [] });
      }
      map.get(normalizedKey)?.calls.push(c);
    });

    const stats: AgentStats[] = Array.from(map.entries()).map(([, { displayName, calls: agentCalls }]) => {
      const sorted = [...agentCalls].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const avg = Math.round(agentCalls.reduce((acc, c) => acc + c.complianceScore, 0) / agentCalls.length);
      const last = sorted[0]?.complianceScore || 0;
      const prevAvg = sorted.length > 1 ? Math.round(sorted.slice(1).reduce((acc, c) => acc + c.complianceScore, 0) / (sorted.length - 1)) : avg;
      const phones = Array.from(new Set(agentCalls.map(c => c.phoneNumber).filter(Boolean)));
      const campaigns = Array.from(new Set(agentCalls.map(c => c.campaignType).filter(Boolean)));

      return {
        name: displayName,
        avgScore: avg,
        totalCalls: agentCalls.length,
        lastScore: last,
        trend: avg > prevAvg ? 'up' : avg < prevAvg ? 'down' : 'stable',
        riskLevel: avg < 50 ? 'Risk' : avg < 85 ? 'Warning' : 'Safe',
        phoneNumbers: phones,
        campaigns: campaigns.length > 0 ? campaigns : ['General Agent']
      };
    });

    return stats.sort((a, b) => b.avgScore - a.avgScore);
  }, [filteredByTimeCalls]);

  const filteredAgents = useMemo(() => {
    const term = searchTerm.toLowerCase();
    if (!term) return agentData;

    return agentData.filter(a => {
      const matchesName = a.name.toLowerCase().includes(term);
      const matchesPhone = a.phoneNumbers.some(p => p.includes(term));
      return matchesName || matchesPhone;
    });
  }, [agentData, searchTerm]);

  const riskyAgents = agentData.filter(a => a.riskLevel === 'Risk');
  const highRiskCount = riskyAgents.length;
  const riskyAgentNames = riskyAgents.map(a => a.name);

  const topPerformer = agentData.length > 0 ? agentData[0] : null;
  // Get worst performer (lowest score with at least 2 calls for meaningful data)
  const eligibleForWorst = agentData.filter(a => a.totalCalls >= 2);
  const worstPerformer = eligibleForWorst.length > 0 ? eligibleForWorst[eligibleForWorst.length - 1] : null;

  // Campaign compliance stats
  const campaignStats = useMemo(() => {
    const campaignMap = new Map<string, { totalScore: number; count: number }>();

    filteredByTimeCalls.forEach(c => {
      const campaign = c.campaignType || 'General';
      if (!campaignMap.has(campaign)) {
        campaignMap.set(campaign, { totalScore: 0, count: 0 });
      }
      const stats = campaignMap.get(campaign)!;
      stats.totalScore += c.complianceScore || 0;
      stats.count += 1;
    });

    const campaignList = Array.from(campaignMap.entries())
      .filter(([_, stats]) => stats.count >= 2) // At least 2 calls for meaningful data
      .map(([name, stats]) => ({
        name,
        avgScore: Math.round(stats.totalScore / stats.count),
        callCount: stats.count
      }))
      .sort((a, b) => b.avgScore - a.avgScore);

    return {
      best: campaignList[0] || null,
      worst: campaignList.length > 0 ? campaignList[campaignList.length - 1] : null
    };
  }, [filteredByTimeCalls]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <style>{`
        .search-input-container:focus-within {
          border-color: #a855f7;
          box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.4);
          background-color: rgba(255, 255, 255, 0.05);
        }
      `}</style>

      {/* Header Section */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h2 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
              <Users className="text-purple-400" size={32} /> Performance Data
            </h2>
            <p className="text-slate-400 mt-2 text-sm font-medium">Real-time compliance tracking and risk analysis across your team.</p>
          </div>

          <div className="search-input-container relative w-full md:w-96 flex items-center bg-[#0a0514] border border-white/10 rounded-2xl px-5 py-3 shadow-lg transition-all">
            <Search className="text-slate-400 mr-3" size={20} />
            <input
              type="text"
              placeholder="Search agent name or phone..."
              className="w-full bg-transparent text-sm font-medium text-white outline-none placeholder:text-slate-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Time Range Filter Pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {TIME_RANGE_OPTIONS.map(option => (
            <button
              key={option.value}
              onClick={() => setSelectedTimeRange(option.value)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${selectedTimeRange === option.value
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/25'
                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/10'
                }`}
            >
              {option.label}
            </button>
          ))}
          {selectedTimeRange !== 'all' && (
            <span className="ml-4 text-xs text-slate-500">
              Showing {filteredByTimeCalls.length} of {calls.length} calls
            </span>
          )}
        </div>
      </div>

      {/* Metrics Cards - Unified Dark Aesthetic */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Top Performer */}
        <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-[#0F0720]/80 backdrop-blur-xl shadow-2xl group hover:border-purple-500/30 transition-colors">
          {/* Subtle Gradient Glow at top */}
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-purple-500/10 to-transparent pointer-events-none" />

          <div className="relative p-6 h-full flex flex-col justify-between">
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="text-purple-400" size={16} />
                  <span className="text-purple-200 text-[11px] font-bold uppercase tracking-widest">Top Performing Agent</span>
                </div>
                <h4 className="text-xl font-bold text-white tracking-tight break-words">{topPerformer?.name || '--'}</h4>
              </div>
              <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.1)] shrink-0">
                <Star className="text-purple-400 fill-purple-400" size={20} />
              </div>
            </div>

            <div className="mt-6">
              <div className="flex items-baseline gap-1">
                <span className="text-5xl font-black text-white tracking-tighter">{topPerformer?.avgScore || 0}</span>
                <span className="text-2xl font-bold text-purple-400">%</span>
              </div>
              <p className="text-slate-400 text-xs font-medium mt-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Based on {topPerformer?.totalCalls || 0} calls analyzed
              </p>
            </div>
          </div>
        </div>

        {/* Worst Performer */}
        <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-[#0F0720]/80 backdrop-blur-xl shadow-2xl group hover:border-amber-500/30 transition-colors">
          {/* Subtle Gradient Glow at top */}
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-amber-500/10 to-transparent pointer-events-none" />

          <div className="relative p-6 h-full flex flex-col justify-between">
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="text-amber-400" size={16} />
                  <span className="text-amber-200 text-[11px] font-bold uppercase tracking-widest">Agent to Improve</span>
                </div>
                <h4 className="text-xl font-bold text-white tracking-tight break-words">{worstPerformer?.name || '--'}</h4>
              </div>
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)] shrink-0">
                <AlertTriangle className="text-amber-400" size={20} />
              </div>
            </div>

            <div className="mt-6">
              <div className="flex items-baseline gap-1">
                <span className={`text-5xl font-black tracking-tighter ${(worstPerformer?.avgScore || 0) < 75 ? 'text-rose-400' : 'text-amber-400'}`}>{worstPerformer?.avgScore || 0}</span>
                <span className="text-2xl font-bold text-amber-400">%</span>
              </div>
              <p className="text-slate-400 text-xs font-medium mt-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Based on {worstPerformer?.totalCalls || 0} calls analyzed
              </p>
            </div>
          </div>
        </div>

        {/* Risky Agent Watch List */}
        <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-[#0F0720]/80 backdrop-blur-xl shadow-2xl group hover:border-rose-500/30 transition-colors">
          {/* Subtle Gradient Glow at top */}
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-rose-500/10 to-transparent pointer-events-none" />

          <div className="relative p-6 h-full flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="text-rose-500" size={16} />
                  <span className="text-rose-200 text-[11px] font-bold uppercase tracking-widest">Risky Agent Watch List</span>
                </div>
                <h4 className="text-2xl font-bold text-white tracking-tight">{highRiskCount} Agent{highRiskCount !== 1 ? 's' : ''}</h4>
              </div>
              <div className="h-10 w-10 rounded-xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.1)]">
                <Activity className="text-rose-400" size={20} />
              </div>
            </div>

            <div className="mt-4">
              {highRiskCount > 0 ? (
                <button
                  onClick={() => {
                    // Pass risky agent names to filter their calls
                    onReviewAgent('', riskyAgentNames);
                  }}
                  className="w-full py-2.5 px-4 rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-200 text-xs font-bold uppercase tracking-wider hover:bg-rose-500/30 hover:border-rose-500/50 transition-all flex items-center justify-center gap-2"
                >
                  <AlertTriangle size={14} />
                  Review Risky Agent Calls
                </button>
              ) : (
                <div className="bg-emerald-500/10 rounded-lg p-3 border border-emerald-500/20">
                  <p className="text-emerald-200/80 text-xs leading-relaxed font-medium text-center">
                    ✓ All agents within safe parameters
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Most Compliant Campaign */}
        <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-[#0F0720]/80 backdrop-blur-xl shadow-2xl group hover:border-green-500/30 transition-colors">
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-green-500/10 to-transparent pointer-events-none" />

          <div className="relative p-6 h-full flex flex-col justify-between">
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="text-green-400" size={16} />
                  <span className="text-green-200 text-[11px] font-bold uppercase tracking-widest">Most Compliant Campaign</span>
                </div>
                <h4 className="text-xl font-bold text-white tracking-tight break-words">{campaignStats.best?.name || '--'}</h4>
              </div>
              <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center border border-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.1)] shrink-0">
                <Trophy className="text-green-400" size={20} />
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-baseline gap-1">
                <span className="text-5xl font-black text-green-400 tracking-tighter">{campaignStats.best?.avgScore || 0}</span>
                <span className="text-2xl font-bold text-green-400/60">%</span>
              </div>
              <p className="text-slate-400 text-xs font-medium mt-1">
                {campaignStats.best?.callCount || 0} calls analyzed
              </p>
            </div>
          </div>
        </div>

        {/* Campaign to Focus */}
        <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-[#0F0720]/80 backdrop-blur-xl shadow-2xl group hover:border-red-500/30 transition-colors">
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-red-500/10 to-transparent pointer-events-none" />

          <div className="relative p-6 h-full flex flex-col justify-between">
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="text-red-400" size={16} />
                  <span className="text-red-200 text-[11px] font-bold uppercase tracking-widest">Campaign to Focus</span>
                </div>
                <h4 className="text-xl font-bold text-white tracking-tight break-words">{campaignStats.worst?.name || '--'}</h4>
              </div>
              <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)] shrink-0">
                <AlertTriangle className="text-red-400" size={20} />
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-baseline gap-1">
                <span className={`text-5xl font-black tracking-tighter ${(campaignStats.worst?.avgScore || 0) < 50 ? 'text-red-400' : 'text-amber-400'}`}>{campaignStats.worst?.avgScore || 0}</span>
                <span className="text-2xl font-bold text-red-400/60">%</span>
              </div>
              <p className="text-slate-400 text-xs font-medium mt-1">
                {campaignStats.worst?.callCount || 0} calls analyzed
              </p>
            </div>
          </div>
        </div>

        {/* Team Volume - All the way to the right */}
        <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-[#0F0720]/80 backdrop-blur-xl shadow-2xl group hover:border-blue-500/30 transition-colors">
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-blue-500/10 to-transparent pointer-events-none" />

          <div className="relative p-6 h-full flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="text-blue-400" size={16} />
                  <span className="text-blue-200 text-[11px] font-bold uppercase tracking-widest">Team Volume</span>
                </div>
                <h4 className="text-2xl font-bold text-white tracking-tight">{calls.length} Calls Analyzed</h4>
              </div>
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                <PhoneCall className="text-blue-400" size={20} />
              </div>
            </div>

            <div className="mt-6 flex items-center gap-4">
              <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 w-[75%]" />
              </div>
              <span className="text-xs text-blue-300 font-bold">Today</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Table - High Contrast Dark Mode */}
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0a0514]/90 backdrop-blur-xl shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-white/[0.02] border-b border-white/5">
              <tr>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Agent Identity</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-center">Avg Compliance</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-center">Trend</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-center">Calls</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Risk Status</th>
                <th className="px-8 py-5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredAgents.map((agent) => (
                <tr key={agent.name} className="group hover:bg-white/[0.03] transition-colors">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      {/* Avatar - Show image if available, fallback to letter */}
                      {(() => {
                        const agentImage = getAgentImage(agent.name);
                        return agentImage ? (
                          <div className="h-11 w-11 rounded-xl overflow-hidden shadow-lg border border-white/10">
                            <img
                              src={agentImage}
                              alt={agent.name}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className={`h-11 w-11 rounded-xl flex items-center justify-center font-bold text-sm shadow-lg border border-white/5 transition-colors ${agent.riskLevel === 'Risk'
                            ? 'bg-rose-500/10 text-rose-400 group-hover:bg-rose-500/20'
                            : 'bg-white/5 text-slate-300 group-hover:bg-purple-500/20 group-hover:text-purple-300'
                            }`}>
                            {agent.name.charAt(0)}
                          </div>
                        );
                      })()}

                      <div>
                        <div className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors">{agent.name}</div>
                        {/* Dynamic Campaign Label */}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-white/5 text-slate-400 border border-white/5 group-hover:border-white/10 transition-colors">
                            {agent.campaigns.slice(0, 1).join(', ') || 'General'}
                            {agent.campaigns.length > 1 && ` +${agent.campaigns.length - 1}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-5 text-center">
                    <div className="flex flex-col items-center">
                      <span className={`text-xl font-black tracking-tight ${agent.avgScore >= 85 ? 'text-green-400' :
                        agent.avgScore >= 50 ? 'text-amber-400' : 'text-red-400'
                        }`}>
                        {agent.avgScore}%
                      </span>
                    </div>
                  </td>

                  <td className="px-6 py-5 text-center">
                    <div className="flex justify-center items-center h-full">
                      {agent.trend === 'up' ? (
                        <div className="flex items-center gap-1 text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full border border-emerald-400/10">
                          <TrendingUp size={14} />
                          <span className="text-[10px] font-bold">Up</span>
                        </div>
                      ) : agent.trend === 'down' ? (
                        <div className="flex items-center gap-1 text-rose-400 bg-rose-400/10 px-2 py-1 rounded-full border border-rose-400/10">
                          <TrendingDown size={14} />
                          <span className="text-[10px] font-bold">Down</span>
                        </div>
                      ) : (
                        <div className="w-6 h-1 bg-white/10 rounded-full"></div>
                      )}
                    </div>
                  </td>

                  <td className="px-6 py-5 text-center">
                    <span className="text-sm font-bold text-white bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">{agent.totalCalls}</span>
                  </td>

                  <td className="px-6 py-5">
                    {agent.riskLevel === 'Risk' ? (
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-red-500/15 text-red-400 border border-red-400/30 shadow-[0_0_10px_rgba(239,68,68,0.1)]">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> High Risk
                      </span>
                    ) : agent.riskLevel === 'Warning' ? (
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-amber-500/15 text-amber-400 border border-amber-400/30">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Review
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-green-500/15 text-green-400 border border-green-400/30">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500" /> Safe
                      </span>
                    )}
                  </td>

                  <td className="px-8 py-5 text-right">
                    <button
                      onClick={() => onReviewAgent(agent.name)}
                      className="group/btn relative overflow-hidden bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold py-2.5 px-5 rounded-xl transition-all shadow-lg shadow-purple-900/30 flex items-center gap-2 ml-auto"
                    >
                      <span>Review Calls</span>
                      <ChevronRight size={14} className="transition-transform group-hover/btn:translate-x-1" />
                    </button>
                  </td>
                </tr>
              ))}

              {filteredAgents.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-8 py-16 text-center">
                    <div className="flex flex-col items-center justify-center opacity-40">
                      <Search size={32} className="mb-2 text-slate-300" />
                      <p className="text-slate-300 italic text-sm">No agents found matching your search.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
