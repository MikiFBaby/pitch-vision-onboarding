"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Gift, ChevronDown, AlertCircle } from "lucide-react";

interface Agent {
  id: string;
  first_name: string;
  last_name: string;
}

interface IssueBonusFormProps {
  agents: Agent[];
  onSubmit: (data: { agentId: string; amount: number; reason: string }) => void | Promise<void>;
  maxPerDay: number;
}

export default function IssueBonusForm({
  agents,
  onSubmit,
  maxPerDay,
}: IssueBonusFormProps) {
  const [agentId, setAgentId] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isValid =
    agentId !== "" &&
    typeof amount === "number" &&
    amount > 0 &&
    amount <= maxPerDay &&
    reason.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || typeof amount !== "number") return;

    setSubmitting(true);
    try {
      await onSubmit({ agentId, amount, reason: reason.trim() });
      // Reset form on success
      setAgentId("");
      setAmount("");
      setReason("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onSubmit={handleSubmit}
      className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-5 space-y-4"
    >
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b border-white/5">
        <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center">
          <Gift className="w-4 h-4 text-purple-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Award Bonus Points</h3>
          <p className="text-[11px] text-white/40">Max {maxPerDay.toLocaleString()} pts per day</p>
        </div>
      </div>

      {/* Agent Select */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-white/60" htmlFor="bonus-agent">
          Agent
        </label>
        <div className="relative">
          <select
            id="bonus-agent"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="w-full appearance-none bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/30 transition-colors pr-8"
          >
            <option value="" className="bg-[#0a0a1a] text-white/50">
              Select an agent...
            </option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id} className="bg-[#0a0a1a] text-white">
                {agent.first_name} {agent.last_name}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
        </div>
      </div>

      {/* Amount */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-white/60" htmlFor="bonus-amount">
          Points Amount
        </label>
        <input
          id="bonus-amount"
          type="number"
          min={1}
          max={maxPerDay}
          value={amount}
          onChange={(e) => {
            const val = e.target.value;
            setAmount(val === "" ? "" : Number(val));
          }}
          placeholder={`1 - ${maxPerDay.toLocaleString()}`}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/30 transition-colors tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        {typeof amount === "number" && amount > maxPerDay && (
          <div className="flex items-center gap-1.5 text-rose-400 text-xs mt-1">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Exceeds daily limit of {maxPerDay.toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Reason */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-white/60" htmlFor="bonus-reason">
          Reason
        </label>
        <textarea
          id="bonus-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why are you awarding these points?"
          rows={3}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/30 transition-colors resize-none"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={!isValid || submitting}
        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
          isValid && !submitting
            ? "bg-indigo-500/80 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 cursor-pointer"
            : "bg-white/5 text-white/30 cursor-not-allowed"
        }`}
      >
        <Gift className="w-4 h-4" />
        {submitting ? "Awarding..." : "Award Points"}
      </button>
    </motion.form>
  );
}
