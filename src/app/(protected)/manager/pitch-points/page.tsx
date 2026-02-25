"use client";

import React, { useState, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/context/AuthContext";
import { Coins, Gift, Users, ChevronDown, Flame } from "lucide-react";
import { motion } from "framer-motion";

interface TeamMember {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url: string | null;
  balance: {
    current_balance: number;
    lifetime_earned: number;
    current_streak_calls: number;
    last_earned_at: string | null;
  };
}

export default function ManagerPitchPointsPage() {
  const { profile } = useAuth();
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Issue form
  const [selectedAgent, setSelectedAgent] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [message, setMessage] = useState("");

  const fetchTeam = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const res = await fetch(`/api/pitch-points/manager/team?managerId=${profile.id}`);
    const data = await res.json();
    if (data.success) setTeam(data.team);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => { fetchTeam(); }, [fetchTeam]);

  const handleIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgent || !amount || !reason || !profile?.id) return;
    setIssuing(true);
    setMessage("");

    const res = await fetch("/api/pitch-points/manager/issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        managerId: profile.id,
        agentUserId: selectedAgent,
        amount: parseInt(amount),
        reason,
      }),
    });
    const data = await res.json();

    if (data.success) {
      setMessage(`Awarded ${amount} Pitch Points to ${data.agent}`);
      setSelectedAgent("");
      setAmount("");
      setReason("");
      fetchTeam();
    } else {
      setMessage(data.error || "Failed to issue points");
    }
    setIssuing(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Pitch Points
            <span className="inline-block ml-2 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          </h2>
          <p className="text-white/50 text-sm font-medium">
            Award bonus points to your team and track their rewards progress.
          </p>
        </div>

        {/* Issue Bonus Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl border border-white/10 p-6 max-w-lg"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Gift size={20} className="text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-widest">Award Bonus Points</h3>
              <p className="text-xs text-white/40">Reward exceptional performance</p>
            </div>
          </div>

          <form onSubmit={handleIssue} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-white/40 uppercase tracking-wider">Agent</label>
              <div className="relative mt-1">
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-indigo-500/50 appearance-none"
                  required
                >
                  <option value="">Select an agent...</option>
                  {team.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.first_name} {a.last_name} ({a.balance.current_balance} pts)
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-white/40 uppercase tracking-wider">Points Amount</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-indigo-500/50"
                min={1}
                max={100}
                required
                placeholder="1-100"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-white/40 uppercase tracking-wider">Reason</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-indigo-500/50 min-h-[80px]"
                required
                placeholder="What did this agent do to earn bonus points?"
              />
            </div>
            <button
              type="submit"
              disabled={issuing}
              className="w-full py-2.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 text-sm font-bold transition-all disabled:opacity-50"
            >
              {issuing ? "Awarding..." : "Award Pitch Points"}
            </button>
            {message && (
              <p className={`text-sm text-center ${message.includes("Failed") || message.includes("limit") ? "text-red-400" : "text-emerald-400"}`}>
                {message}
              </p>
            )}
          </form>
        </motion.div>

        {/* Team Balances */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Users size={18} className="text-white/40" />
            <h3 className="text-lg font-bold text-white uppercase tracking-widest">Team Balances</h3>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="glass-card rounded-xl border border-white/10 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10 text-left">
                    <th className="px-4 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">Agent</th>
                    <th className="px-4 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">Balance</th>
                    <th className="px-4 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">Lifetime Earned</th>
                    <th className="px-4 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">Streak</th>
                    <th className="px-4 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">Last Earned</th>
                  </tr>
                </thead>
                <tbody>
                  {team.map((member, i) => (
                    <motion.tr
                      key={member.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                            {member.first_name?.[0]}{member.last_name?.[0]}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">{member.first_name} {member.last_name}</p>
                            <p className="text-xs text-white/30">{member.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Coins size={14} className="text-amber-400" />
                          <span className="text-sm font-bold text-amber-400">{member.balance.current_balance.toLocaleString()}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-white/60">{member.balance.lifetime_earned.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        {member.balance.current_streak_calls > 0 ? (
                          <div className="flex items-center gap-1">
                            <Flame size={14} className="text-orange-400" />
                            <span className="text-sm text-orange-400 font-medium">{member.balance.current_streak_calls}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-white/30">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-white/40">
                        {member.balance.last_earned_at
                          ? new Date(member.balance.last_earned_at).toLocaleDateString()
                          : "Never"}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
              {team.length === 0 && (
                <div className="py-12 text-center text-white/40 text-sm">No agents found.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
