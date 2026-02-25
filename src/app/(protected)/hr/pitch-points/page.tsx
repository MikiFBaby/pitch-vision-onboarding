"use client";

import React, { useState, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/context/AuthContext";
import {
  Coins,
  ShoppingBag,
  ClipboardCheck,
  Settings2,
  BarChart3,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  RefreshCw,
  Package,
  ChevronDown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  StoreItem,
  Redemption,
  EarningRule,
  StoreCategory,
} from "@/types/pitch-points-types";

type Tab = "catalog" | "redemptions" | "admin" | "rules" | "analytics";

export default function HRPitchPointsPage() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("catalog");

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "catalog", label: "Store Catalog", icon: <ShoppingBag size={16} /> },
    { key: "redemptions", label: "Redemption Queue", icon: <ClipboardCheck size={16} /> },
    { key: "admin", label: "Points Admin", icon: <Coins size={16} /> },
    { key: "rules", label: "Rules Config", icon: <Settings2 size={16} /> },
    { key: "analytics", label: "Analytics", icon: <BarChart3 size={16} /> },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Pitch Points Management
            <span className="inline-block ml-2 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          </h2>
          <p className="text-white/50 text-sm font-medium">
            Manage the reward store, approve redemptions, and configure earning rules.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.key
                  ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                  : "bg-white/5 text-white/50 border border-white/10 hover:text-white/80 hover:bg-white/10"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "catalog" && <StoreCatalogTab />}
            {activeTab === "redemptions" && <RedemptionQueueTab reviewerId={profile?.id} />}
            {activeTab === "admin" && <PointsAdminTab adminId={profile?.id} />}
            {activeTab === "rules" && <RulesConfigTab />}
            {activeTab === "analytics" && <AnalyticsTab />}
          </motion.div>
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
}

// ── Store Catalog Tab ───────────────────────────────────────────────

function StoreCatalogTab() {
  const [items, setItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<StoreItem | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/pitch-points/admin/store");
    const data = await res.json();
    if (data.success) setItems(data.items);
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleDelete = async (id: string) => {
    if (!confirm("Deactivate this store item?")) return;
    await fetch(`/api/pitch-points/admin/store?id=${id}`, { method: "DELETE" });
    fetchItems();
  };

  const categoryColors: Record<string, string> = {
    digital_perk: "text-cyan-400 bg-cyan-500/10",
    physical_good: "text-amber-400 bg-amber-500/10",
    recognition: "text-emerald-400 bg-emerald-500/10",
    experience: "text-purple-400 bg-purple-500/10",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white uppercase tracking-widest">Store Catalog</h3>
        <button
          onClick={() => { setEditingItem(null); setShowAddModal(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/30 transition-all text-sm font-medium"
        >
          <Plus size={16} /> Add Item
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="glass-card rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10 text-left">
                <th className="px-4 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">Item</th>
                <th className="px-4 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">Category</th>
                <th className="px-4 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">Cost</th>
                <th className="px-4 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">Stock</th>
                <th className="px-4 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                        <Package size={14} className="text-white/50" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{item.name}</p>
                        <p className="text-xs text-white/40 truncate max-w-[200px]">{item.description}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${categoryColors[item.category] || "text-white/50"}`}>
                      {item.category.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-bold text-amber-400">{item.point_cost}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-white/60">
                    {item.stock_quantity === null ? "Unlimited" : item.stock_quantity}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${item.is_active ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10"}`}>
                      {item.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setEditingItem(item); setShowAddModal(true); }}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/40 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && (
            <div className="py-12 text-center text-white/40 text-sm">No store items yet. Click &quot;Add Item&quot; to create one.</div>
          )}
        </div>
      )}

      {showAddModal && (
        <AddStoreItemModal
          item={editingItem}
          onClose={() => { setShowAddModal(false); setEditingItem(null); }}
          onSave={fetchItems}
        />
      )}
    </div>
  );
}

// ── Add/Edit Store Item Modal ───────────────────────────────────────

function AddStoreItemModal({ item, onClose, onSave }: { item: StoreItem | null; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({
    name: item?.name || "",
    description: item?.description || "",
    category: item?.category || "digital_perk" as StoreCategory,
    point_cost: item?.point_cost || 100,
    stock_quantity: item?.stock_quantity ?? "",
    is_featured: item?.is_featured || false,
    fulfillment_instructions: item?.fulfillment_instructions || "",
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const payload = {
      ...form,
      stock_quantity: form.stock_quantity === "" ? null : Number(form.stock_quantity),
    };

    const url = item ? `/api/pitch-points/admin/store?id=${item.id}` : "/api/pitch-points/admin/store";
    const method = item ? "PATCH" : "POST";

    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSaving(false);
    onSave();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card rounded-2xl border border-white/10 p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <h3 className="text-lg font-bold text-white mb-4">
          {item ? "Edit Store Item" : "Add Store Item"}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-white/40 uppercase tracking-wider">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-indigo-500/50"
              required
            />
          </div>
          <div>
            <label className="text-xs font-bold text-white/40 uppercase tracking-wider">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-indigo-500/50 min-h-[80px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-white/40 uppercase tracking-wider">Category</label>
              <div className="relative mt-1">
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as StoreCategory })}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-indigo-500/50 appearance-none"
                >
                  <option value="digital_perk">Digital Perk</option>
                  <option value="physical_good">Physical Good</option>
                  <option value="recognition">Recognition</option>
                  <option value="experience">Experience</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-white/40 uppercase tracking-wider">Point Cost</label>
              <input
                type="number"
                value={form.point_cost}
                onChange={(e) => setForm({ ...form, point_cost: parseInt(e.target.value) || 0 })}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-indigo-500/50"
                min={1}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-white/40 uppercase tracking-wider">Stock (blank = unlimited)</label>
              <input
                type="number"
                value={form.stock_quantity}
                onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-indigo-500/50"
                min={0}
                placeholder="Unlimited"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_featured}
                  onChange={(e) => setForm({ ...form, is_featured: e.target.checked })}
                  className="w-4 h-4 rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500/50"
                />
                <span className="text-sm text-white/60">Featured</span>
              </label>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-white/40 uppercase tracking-wider">Fulfillment Instructions (Internal)</label>
            <textarea
              value={form.fulfillment_instructions}
              onChange={(e) => setForm({ ...form, fulfillment_instructions: e.target.value })}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-indigo-500/50 min-h-[60px]"
              placeholder="Notes for HR on how to fulfill this item..."
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-white/50 hover:text-white transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/30 text-sm font-medium transition-all disabled:opacity-50"
            >
              {saving ? "Saving..." : item ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Redemption Queue Tab ────────────────────────────────────────────

function RedemptionQueueTab({ reviewerId }: { reviewerId?: string }) {
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");

  const fetchRedemptions = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/pitch-points/admin/redemptions?status=${filter}`);
    const data = await res.json();
    if (data.success) setRedemptions(data.redemptions);
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchRedemptions(); }, [fetchRedemptions]);

  const handleAction = async (redemptionId: string, action: string, rejectionReason?: string) => {
    await fetch("/api/pitch-points/admin/redemptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redemptionId, action, reviewerId, rejectionReason }),
    });
    fetchRedemptions();
  };

  const statusColors: Record<string, string> = {
    pending: "text-yellow-400 bg-yellow-500/10",
    approved: "text-blue-400 bg-blue-500/10",
    fulfilled: "text-emerald-400 bg-emerald-500/10",
    rejected: "text-red-400 bg-red-500/10",
    cancelled: "text-white/40 bg-white/5",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white uppercase tracking-widest">Redemption Queue</h3>
        <div className="flex gap-2">
          {["pending", "approved", "fulfilled", "rejected"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                filter === s ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30" : "bg-white/5 text-white/40 border border-white/10 hover:text-white/60"
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : redemptions.length === 0 ? (
        <div className="glass-card rounded-xl border border-white/10 py-12 text-center text-white/40 text-sm">
          No {filter} redemptions.
        </div>
      ) : (
        <div className="space-y-3">
          {redemptions.map((r) => {
            const storeItem = r.store_item as unknown as { name: string; category: string } | undefined;
            const user = r.user as unknown as { first_name: string; last_name: string; email: string } | undefined;
            return (
              <div key={r.id} className="glass-card rounded-xl border border-white/10 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-sm font-medium text-white">
                        {user?.first_name} {user?.last_name}
                      </p>
                      <p className="text-xs text-white/40">{user?.email}</p>
                    </div>
                    <div className="text-sm text-white/60">
                      requested <span className="text-white font-medium">{storeItem?.name || "Unknown Item"}</span>
                    </div>
                    <span className="text-sm font-bold text-amber-400">{r.point_cost} pts</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${statusColors[r.status]}`}>
                      {r.status}
                    </span>
                  </div>
                  {r.status === "pending" && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleAction(r.id, "approve")}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 text-xs font-medium transition-all"
                      >
                        <Check size={12} /> Approve
                      </button>
                      <button
                        onClick={() => {
                          const reason = prompt("Rejection reason:");
                          if (reason) handleAction(r.id, "reject", reason);
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 text-xs font-medium transition-all"
                      >
                        <X size={12} /> Reject
                      </button>
                    </div>
                  )}
                  {r.status === "approved" && (
                    <button
                      onClick={() => handleAction(r.id, "fulfill")}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 text-xs font-medium transition-all"
                    >
                      <Package size={12} /> Mark Fulfilled
                    </button>
                  )}
                </div>
                {r.agent_notes && (
                  <p className="mt-2 text-xs text-white/40 italic">Agent note: {r.agent_notes}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Points Admin Tab ────────────────────────────────────────────────

function PointsAdminTab({ adminId }: { adminId?: string }) {
  const [agents, setAgents] = useState<{ id: string; first_name: string; last_name: string }[]>([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/pitch-points/manager/team?managerId=" + adminId)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setAgents(data.team.map((a: { id: string; first_name: string; last_name: string }) => ({ id: a.id, first_name: a.first_name, last_name: a.last_name })));
      });
  }, [adminId]);

  const handleIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgent || !amount || !reason) return;
    setIssuing(true);
    setMessage("");

    const res = await fetch("/api/pitch-points/manager/issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ managerId: adminId, agentUserId: selectedAgent, amount: parseInt(amount), reason }),
    });
    const data = await res.json();

    if (data.success) {
      setMessage(`Awarded ${amount} points to ${data.agent}`);
      setSelectedAgent("");
      setAmount("");
      setReason("");
    } else {
      setMessage(data.error || "Failed to issue points");
    }
    setIssuing(false);
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-white uppercase tracking-widest">Issue Points</h3>
      <div className="glass-card rounded-xl border border-white/10 p-6 max-w-lg">
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
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-white/40 uppercase tracking-wider">Amount</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-indigo-500/50"
              min={1}
              required
              placeholder="Points to award"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-white/40 uppercase tracking-wider">Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-indigo-500/50 min-h-[80px]"
              required
              placeholder="Why is this agent being awarded points?"
            />
          </div>
          <button
            type="submit"
            disabled={issuing}
            className="w-full py-2 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/30 text-sm font-medium transition-all disabled:opacity-50"
          >
            {issuing ? "Awarding..." : "Award Points"}
          </button>
          {message && (
            <p className={`text-sm text-center ${message.includes("Failed") ? "text-red-400" : "text-emerald-400"}`}>
              {message}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

// ── Rules Config Tab ────────────────────────────────────────────────

function RulesConfigTab() {
  const [rules, setRules] = useState<EarningRule[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/pitch-points/admin/rules");
    const data = await res.json();
    if (data.success) setRules(data.rules);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const toggleRule = async (rule: EarningRule) => {
    await fetch(`/api/pitch-points/admin/rules?id=${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !rule.is_active }),
    });
    fetchRules();
  };

  const categoryColors: Record<string, string> = {
    qa_performance: "text-blue-400 bg-blue-500/10",
    compliance_streak: "text-orange-400 bg-orange-500/10",
    sla_performance: "text-cyan-400 bg-cyan-500/10",
    attendance: "text-emerald-400 bg-emerald-500/10",
    milestone: "text-purple-400 bg-purple-500/10",
    manual: "text-amber-400 bg-amber-500/10",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white uppercase tracking-widest">Earning Rules</h3>
        <button
          onClick={fetchRules}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 text-white/40 border border-white/10 hover:text-white/60 text-xs font-medium transition-all"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="glass-card rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10 text-left">
                <th className="px-4 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">Rule</th>
                <th className="px-4 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">Category</th>
                <th className="px-4 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">Points</th>
                <th className="px-4 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">Threshold</th>
                <th className="px-4 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">Active</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-white">{rule.label}</p>
                    <p className="text-xs text-white/40">{rule.description}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${categoryColors[rule.category] || "text-white/50"}`}>
                      {rule.category.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-amber-400">{rule.points_amount}</td>
                  <td className="px-4 py-3 text-xs text-white/40">
                    {rule.threshold_min !== null && rule.threshold_max !== null
                      ? `${rule.threshold_min} - ${rule.threshold_max}`
                      : rule.streak_count
                      ? `${rule.streak_count} streak`
                      : rule.period_days
                      ? `${rule.period_days} days`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleRule(rule)}
                      className={`w-10 h-5 rounded-full transition-all relative ${
                        rule.is_active ? "bg-emerald-500/30" : "bg-white/10"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                          rule.is_active ? "left-5 bg-emerald-400" : "left-0.5 bg-white/30"
                        }`}
                      />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Analytics Tab ───────────────────────────────────────────────────

function AnalyticsTab() {
  const [analytics, setAnalytics] = useState<{
    total_points_issued: number;
    total_points_redeemed: number;
    total_points_expired: number;
    active_participants: number;
    pending_redemptions: number;
    category_breakdown: { category: string; points: number }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/pitch-points/admin/analytics?period=30d")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setAnalytics(data.analytics);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-xl bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!analytics) return <div className="text-white/40 text-center py-12">Failed to load analytics</div>;

  const kpis = [
    { label: "Points Issued (30d)", value: analytics.total_points_issued.toLocaleString(), color: "text-emerald-400" },
    { label: "Points Redeemed (30d)", value: analytics.total_points_redeemed.toLocaleString(), color: "text-blue-400" },
    { label: "Points Expired (30d)", value: analytics.total_points_expired.toLocaleString(), color: "text-white/40" },
    { label: "Active Participants", value: analytics.active_participants.toString(), color: "text-amber-400" },
    { label: "Pending Redemptions", value: analytics.pending_redemptions.toString(), color: "text-yellow-400" },
  ];

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-white uppercase tracking-widest">System Analytics (Last 30 Days)</h3>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="glass-card rounded-xl border border-white/10 p-4">
            <p className="text-xs font-bold text-white/40 uppercase tracking-wider">{kpi.label}</p>
            <p className={`text-2xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {analytics.category_breakdown.length > 0 && (
        <div className="glass-card rounded-xl border border-white/10 p-6">
          <h4 className="text-sm font-bold text-white/60 uppercase tracking-wider mb-4">Points by Source</h4>
          <div className="space-y-3">
            {analytics.category_breakdown.map((cat) => {
              const maxPoints = Math.max(...analytics.category_breakdown.map((c) => c.points));
              const width = maxPoints > 0 ? (cat.points / maxPoints) * 100 : 0;
              return (
                <div key={cat.category} className="flex items-center gap-4">
                  <span className="text-xs text-white/40 w-24 truncate">{cat.category.replace(/_/g, " ")}</span>
                  <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-amber-400 w-16 text-right">{cat.points.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
