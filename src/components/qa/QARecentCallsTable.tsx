"use client";

import React, { useState, useMemo } from 'react';
import { Card } from './ui/Card';
import { CallData, QAStatus } from '@/types/qa-types';
import {
  Activity, Calendar, Phone, Users,
  Tag, Search, ChevronDown, ChevronUp,
  Award, CheckCircle2, XCircle, AlertCircle,
  ShieldAlert, ShieldCheck, Quote, Check, X,
  RotateCcw, Info, Download, FileSpreadsheet, Mail, Trash2, AlertTriangle, MoreHorizontal, Lightbulb,
  Target, Zap, ClipboardCopy, GraduationCap, Volume2, Bot, UploadCloud, ClipboardCheck, Clock
} from 'lucide-react';

interface RecentCallsTableProps {
  calls: CallData[];
  onViewTranscript: (call: CallData) => void;

  selectedAgent: string;
  onAgentChange: (agent: string) => void;
  availableAgents: string[];

  selectedCampaign: string;
  onCampaignChange: (campaign: string) => void;
  availableCampaigns: string[];

  // Product Type Filter
  selectedProductType?: string;
  onProductTypeChange?: (productType: string) => void;
  availableProductTypes?: string[];

  searchQuery: string;
  onSearchChange: (query: string) => void;

  startDate: string;
  onStartDateChange: (date: string) => void;
  endDate: string;
  onEndDateChange: (date: string) => void;

  // New Filters
  minScore: number;
  onMinScoreChange: (score: number) => void;
  selectedRiskLevel: string;
  onRiskLevelChange: (risk: string) => void;
  selectedStatus: string;
  onStatusFilterChange: (status: string) => void;

  onDelete?: (ids: string[]) => void;

  // QA Workflow - status change handler
  onStatusChange?: (id: string, status: QAStatus, notes?: string) => void;

  // Show QA Status column (for Review Queue)
  showQAColumn?: boolean;
}

export const RecentCallsTable: React.FC<RecentCallsTableProps> = ({
  calls,
  onViewTranscript,
  selectedAgent,
  onAgentChange,
  availableAgents,
  selectedCampaign,
  onCampaignChange,
  availableCampaigns,
  selectedProductType = '',
  onProductTypeChange,
  availableProductTypes = [],
  searchQuery,
  onSearchChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  minScore,
  onMinScoreChange,
  selectedRiskLevel,
  onRiskLevelChange,
  selectedStatus,
  onStatusFilterChange,
  onDelete,
  onStatusChange,
  showQAColumn = false
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  // Ensure we are operating on the calls that are currently visible/passed down
  const finalFilteredCalls = useMemo(() => {
    return calls;
  }, [calls]);

  const toggleSelectAll = () => {
    if (selectedIds.size === finalFilteredCalls.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(finalFilteredCalls.map(c => c.id)));
    }
  };

  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // Trigger the custom modal instead of window.confirm (Bulk)
  const handleBulkDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!onDelete) return;
    if (selectedIds.size === 0) return;

    setItemToDelete(null); // Ensure we are in bulk mode
    setShowDeleteConfirm(true);
  };

  // Trigger the custom modal (Single)
  const handleSingleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!onDelete) return;
    setItemToDelete(id);
    setShowDeleteConfirm(true);
  };

  // Actually execute the delete
  const confirmDelete = () => {
    if (!onDelete) return;

    let idsToDelete: string[] = [];
    if (itemToDelete) {
      idsToDelete = [itemToDelete];
    } else if (selectedIds.size > 0) {
      idsToDelete = Array.from(selectedIds);
    }

    if (idsToDelete.length > 0) {
      console.log('Confirming delete for IDs:', idsToDelete);
      onDelete(idsToDelete);

      // Only clear selection if we performed a bulk delete
      if (!itemToDelete) {
        setSelectedIds(new Set());
      }
    }

    setShowDeleteConfirm(false);
    setItemToDelete(null);
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setItemToDelete(null);
  };

  const handleBulkExport = () => {
    const selectedCalls = finalFilteredCalls.filter(c => selectedIds.has(c.id));
    if (selectedCalls.length === 0) return;

    // Create CSV Content
    const headers = ["ID", "Date", "Agent", "Campaign", "Score", "Source", "Status", "Risk Level", "Summary"];
    const rows = selectedCalls.map(c => [
      `"${c.callId}"`,
      `"${c.callDate}"`,
      `"${c.agentName}"`,
      `"${c.campaignType}"`,
      c.complianceScore,
      `"${c.uploadType}"`,
      `"${c.status}"`,
      `"${c.riskLevel}"`,
      `"${(c.summary || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pitch_vision_export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDateLabel = (dateStr: string) => {
    if (!dateStr) return 'yyyy - mm - dd';
    return dateStr;
  };

  const formatAnalyzedAt = (dateStr: string) => {
    if (!dateStr) return '--';
    const date = new Date(dateStr);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // --- Visual Helpers ---

  const getStatusConfig = (status: string, score?: number) => {
    const s = (status || '').toLowerCase();

    // Priority 1: Critical Failure Keywords (Override score)
    if (s.includes('no consent') ||
      s.includes('rejected') ||
      s.includes('auto_fail')) {
      let label = 'CRITICAL FAIL';
      if (s.includes('no consent')) label = 'NO CONSENT';
      else if (s.includes('auto_fail')) label = 'AUTO FAIL';

      return {
        bg: 'bg-rose-50',
        border: 'border-rose-200',
        text: 'text-rose-700',
        iconColor: 'text-rose-600',
        Icon: XCircle,
        label
      };
    }

    // Priority 2: Score-based logic (Primary determinant)
    if (score !== undefined) {
      // 85%+ = Auto-approved/Pass
      if (score >= 85) {
        return {
          bg: 'bg-green-50',
          border: 'border-green-300',
          text: 'text-green-700',
          iconColor: 'text-green-600',
          Icon: CheckCircle2,
          label: 'PASS'
        };
      }

      // 50-84% = Needs Review (QA manual review required)
      if (score >= 50) {
        return {
          bg: 'bg-amber-50',
          border: 'border-amber-300',
          text: 'text-amber-700',
          iconColor: 'text-amber-600',
          Icon: RotateCcw,
          label: 'REVIEW'
        };
      }

      // 0-49% = Compliance Fail (AI judgment - may need human override)
      return {
        bg: 'bg-red-50',
        border: 'border-red-300',
        text: 'text-red-700',
        iconColor: 'text-red-600',
        Icon: Bot,
        label: 'AI: FAIL'
      };
    }

    // Priority 3: Fallback for strings without score
    if (s.includes('compliant') || s.includes('consent') || s.includes('pass')) {
      return {
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        text: 'text-emerald-700',
        iconColor: 'text-emerald-600',
        Icon: CheckCircle2,
        label: 'PASS'
      };
    }

    if (s.includes('review') || s.includes('minor') || s.includes('unclear')) {
      return {
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        text: 'text-amber-800',
        iconColor: 'text-amber-600',
        Icon: RotateCcw,
        label: 'REVIEW'
      };
    }

    if (s.includes('fail') || s.includes('non-compliant')) {
      return {
        bg: 'bg-rose-50',
        border: 'border-rose-200',
        text: 'text-rose-700',
        iconColor: 'text-rose-600',
        Icon: XCircle,
        label: 'FAIL'
      };
    }

    // Default: Unknown status
    return {
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      text: 'text-slate-700',
      iconColor: 'text-slate-600',
      Icon: RotateCcw,
      label: 'PENDING'
    };
  };

  const getRiskConfig = (risk: string, status?: string, score?: number) => {
    // SCORE-BASED RISK: Use score as primary determinant
    // Thresholds: ≥95% = No Risk, 85-94% = Low, 50-84% = Medium, <50% = High
    if (score !== undefined) {
      // 95%+ = Virtually No Risk
      if (score >= 95) {
        return {
          bg: 'bg-green-50',
          border: 'border-green-300',
          text: 'text-green-700',
          iconColor: 'text-green-600',
          Icon: ShieldCheck,
          label: 'NO RISK'
        };
      }
      // 85-94% = Low Risk
      if (score >= 85) {
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          text: 'text-green-700',
          iconColor: 'text-green-600',
          Icon: ShieldCheck,
          label: 'LOW RISK'
        };
      }
      // 50-84% = Medium Risk (needs review)
      if (score >= 50) {
        return {
          bg: 'bg-amber-50',
          border: 'border-amber-300',
          text: 'text-amber-700',
          iconColor: 'text-amber-600',
          Icon: ShieldAlert,
          label: 'MEDIUM RISK'
        };
      }
      // <50% = High Risk
      return {
        bg: 'bg-red-50',
        border: 'border-red-300',
        text: 'text-red-700',
        iconColor: 'text-red-600',
        Icon: ShieldAlert,
        label: 'HIGH RISK'
      };
    }

    // Fallback: Use risk string if no score
    let effectiveRisk = (risk || '').toLowerCase();
    const statusLower = (status || '').toLowerCase();

    // Failed statuses = high risk
    if (statusLower.includes('no consent') ||
      statusLower.includes('fail') ||
      statusLower.includes('non-compliant') ||
      statusLower.includes('rejected')) {
      effectiveRisk = 'high';
    }

    if (effectiveRisk === 'high' || effectiveRisk === 'critical') {
      return {
        bg: 'bg-rose-50',
        border: 'border-rose-200',
        text: 'text-rose-700',
        iconColor: 'text-rose-600',
        Icon: ShieldAlert,
        label: 'HIGH RISK'
      };
    }
    if (effectiveRisk === 'medium' || effectiveRisk === 'warning') {
      return {
        bg: 'bg-yellow-50',
        border: 'border-yellow-400',
        text: 'text-yellow-800',
        iconColor: 'text-yellow-600',
        Icon: AlertCircle,
        label: 'MEDIUM RISK'
      };
    }
    // Low / Safe
    return {
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-700',
      iconColor: 'text-emerald-600',
      Icon: ShieldCheck,
      label: 'LOW RISK'
    };
  };

  const getScoreStyle = (score: number) => {
    // Match thresholds: ≥85% = emerald, 50-84% = amber, <50% = rose
    if (score >= 85) return 'text-emerald-600';
    if (score >= 50) return 'text-amber-600';
    return 'text-rose-600';
  };

  // Format phone number: 9102177366 → 910 217 7366
  const formatPhoneNumber = (phone: string | undefined): string => {
    if (!phone) return '--';
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');

    // Handle 10-digit US numbers
    if (digits.length === 10) {
      return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
    }
    // Handle 11-digit (with country code 1)
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
    }
    // Return original if doesn't match expected formats
    return phone;
  };

  // Get analyzed duration from speaker metrics (actual transcribed time)
  // Falls back to 5:00 if no speaker metrics available
  const getAnalyzedDuration = (call: CallData): string => {
    // Use speaker metrics total speaking time if available
    if (call.speakerMetrics?.total?.speakingTimeFormatted) {
      return call.speakerMetrics.total.speakingTimeFormatted;
    }
    // Fallback: calculate from agent + customer speaking time
    const agentTime = call.agentSpeakingTime || 0;
    const customerTime = call.customerSpeakingTime || 0;
    const totalSeconds = agentTime + customerTime;
    if (totalSeconds > 0) {
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    // Default fallback (5 min transfer window)
    return '5:00';
  };

  return (
    <>
      <Card noPadding className="overflow-hidden flex flex-col h-full border-white/20 shadow-2xl relative z-10">
        <style>{`
        .datepicker-overlay::-webkit-calendar-picker-indicator {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          width: 100%;
          height: 100%;
          opacity: 0;
          cursor: pointer;
          z-index: 10;
        }
        .search-input-container:focus-within {
          border-color: #a855f7;
          box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.2);
        }
        .table-row-hover:hover {
          background-color: #f8fafc;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 14px;
          width: 14px;
          border-radius: 999px;
          background: #9333ea;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          margin-top: -5px;
        }
        input[type=range]::-webkit-slider-runnable-track {
          width: 100%;
          height: 4px;
          cursor: pointer;
          background: #e2e8f0;
          border-radius: 2px;
        }
      `}</style>

        <div className="border-b border-slate-100 bg-white/50 backdrop-blur-md sticky top-0 z-20">
          <div className="px-8 py-6 flex flex-col gap-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Activity className="text-purple-600" size={20} /> Live Feed
              </h3>

              {selectedIds.size > 0 && (
                <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-2">
                  <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
                    {selectedIds.size} Selected
                  </span>

                  {onDelete && (
                    <button
                      type="button"
                      onClick={handleBulkDeleteClick}
                      className="flex items-center gap-2 bg-rose-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-rose-700 transition-colors shadow-md shadow-rose-200 active:scale-95 cursor-pointer ring-offset-1 ring-2 ring-transparent focus:ring-rose-500"
                    >
                      <Trash2 size={14} /> Delete Selected
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleBulkExport}
                    className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-800 transition-colors shadow-sm active:scale-95 cursor-pointer"
                  >
                    <Download size={14} className="pointer-events-none" /> Export CSV
                  </button>
                </div>
              )}
            </div>

            {/* Filter Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5 shadow-sm hover:border-slate-300 transition-colors">
                <Users size={16} className="text-slate-400" />
                <select
                  className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer w-28"
                  value={selectedAgent}
                  onChange={(e) => onAgentChange(e.target.value)}
                >
                  <option value="">All Agents</option>
                  {availableAgents.map(agent => (
                    <option key={agent} value={agent}>{agent}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5 shadow-sm hover:border-slate-300 transition-colors">
                <Tag size={16} className="text-slate-400" />
                <select
                  className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer w-32"
                  value={selectedCampaign}
                  onChange={(e) => onCampaignChange(e.target.value)}
                >
                  <option value="">All Campaigns</option>
                  {availableCampaigns.map(camp => (
                    <option key={camp} value={camp}>{camp}</option>
                  ))}
                </select>
              </div>

              {/* Product Type Filter */}
              {onProductTypeChange && (
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5 shadow-sm hover:border-slate-300 transition-colors">
                  <Target size={16} className="text-slate-400" />
                  <select
                    className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer w-28"
                    value={selectedProductType}
                    onChange={(e) => onProductTypeChange(e.target.value)}
                  >
                    <option value="">All Products</option>
                    <option value="ACA">ACA</option>
                    <option value="MEDICARE">Medicare</option>
                    <option value="WHATIF">WhatIF</option>
                  </select>
                </div>
              )}

              {/* Risk Filter */}
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5 shadow-sm hover:border-slate-300 transition-colors">
                <ShieldAlert size={16} className="text-slate-400" />
                <select
                  className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer w-28"
                  value={selectedRiskLevel}
                  onChange={(e) => onRiskLevelChange(e.target.value)}
                >
                  <option value="">All Risks</option>
                  <option value="Low">Low Risk</option>
                  <option value="Medium">Medium Risk</option>
                  <option value="High">High Risk</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5 shadow-sm hover:border-slate-300 transition-colors">
                <CheckCircle2 size={16} className="text-slate-400" />
                <select
                  className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer w-32"
                  value={selectedStatus}
                  onChange={(e) => onStatusFilterChange(e.target.value)}
                >
                  <option value="">All Statuses</option>
                  <option value="Compliant">Compliant</option>
                  <option value="Requires Review">Requires Review</option>
                  <option value="Non-Compliant">Non-Compliant</option>
                  <option value="auto_fail">Auto Fail</option>
                </select>
              </div>

              <div className="relative flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-2.5 min-w-[200px] hover:border-slate-300 transition-colors shadow-sm">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">FROM</span>
                <span className="text-xs font-bold text-slate-800 flex-1">{formatDateLabel(startDate)}</span>
                <Calendar size={14} className="text-slate-400 shrink-0" />
                <input
                  type="date"
                  className="datepicker-overlay absolute inset-0 opacity-0"
                  value={startDate}
                  onChange={(e) => onStartDateChange(e.target.value)}
                />
              </div>

              <div className="relative flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-2.5 min-w-[200px] hover:border-slate-300 transition-colors shadow-sm">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">TO</span>
                <span className="text-xs font-bold text-slate-800 flex-1">{formatDateLabel(endDate)}</span>
                <Calendar size={14} className="text-slate-400 shrink-0" />
                <input
                  type="date"
                  className="datepicker-overlay absolute inset-0 opacity-0"
                  value={endDate}
                  onChange={(e) => onEndDateChange(e.target.value)}
                />
              </div>

              {/* Min Score Filter */}
              <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm hover:border-slate-300 transition-colors min-w-[160px]">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Min Score</span>
                  <span className={`text-xs font-bold ${minScore > 0 ? 'text-purple-600' : 'text-slate-800'}`}>{minScore}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={minScore}
                  onChange={(e) => onMinScoreChange(Number(e.target.value))}
                  className="w-20 h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
              </div>

              <div className="search-input-container flex items-center gap-2 bg-white border border-slate-200 rounded-full px-5 py-2.5 shadow-sm transition-all flex-1 min-w-[250px]">
                <Search size={16} className="text-slate-400" />
                <input
                  type="text"
                  placeholder="Search name or phone..."
                  className="bg-transparent text-sm font-semibold text-slate-700 outline-none w-full placeholder:text-slate-400"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto bg-white/50">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/80 border-b border-slate-200 backdrop-blur-sm sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4 w-10 text-center cursor-pointer hover:bg-slate-100" onClick={toggleSelectAll}>
                  <input
                    type="checkbox"
                    checked={finalFilteredCalls.length > 0 && selectedIds.size === finalFilteredCalls.length}
                    onChange={() => { }}
                    className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer pointer-events-none h-4 w-4"
                  />
                </th>
                <th className="px-2 py-4 w-10"></th>
                <th className="px-6 py-4 w-10"></th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Call Date</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Analyzed At</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Source</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Agent</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Campaign</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Contact</th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Score</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Risk</th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Tag</th>
                {showQAColumn && (
                  <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">QA Review</th>
                )}
                {showQAColumn && (
                  <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Reviewed By</th>
                )}
                {showQAColumn && (
                  <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Review Date</th>
                )}
                {showQAColumn && (
                  <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Validation Notes</th>
                )}
                <th className="px-8 py-4 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {finalFilteredCalls.length === 0 ? (
                <tr>
                  <td colSpan={showQAColumn ? 18 : 14} className="px-6 py-12 text-center text-slate-400 text-sm font-medium">
                    No calls match the current active filters.
                  </td>
                </tr>
              ) : (
                finalFilteredCalls.map((call) => {
                  const statusConfig = getStatusConfig(call.status, call.complianceScore);
                  const riskConfig = getRiskConfig(call.riskLevel, call.status, call.complianceScore);
                  const scoreColor = getScoreStyle(call.complianceScore);
                  const isSelected = selectedIds.has(call.id);

                  return (
                    <React.Fragment key={call.id}>
                      <tr
                        className={`table-row-hover transition-colors cursor-pointer ${expandedId === call.id ? 'bg-purple-50/50' : ''} ${isSelected ? 'bg-purple-50/30' : ''}`}
                        onClick={() => setExpandedId(expandedId === call.id ? null : call.id)}
                      >
                        {/* Checkbox Cell */}
                        <td
                          className="px-6 py-5 text-center cursor-pointer hover:bg-purple-100/50 transition-colors"
                          onClick={(e) => { e.stopPropagation(); toggleSelectRow(call.id); }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => { }} // Handled by td click
                            className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer pointer-events-none h-4 w-4"
                          />
                        </td>
                        {/* NEW: Explicit Delete Icon Next to Checkbox */}
                        <td className="px-2 py-5 text-center w-10" onClick={(e) => e.stopPropagation()}>
                          {onDelete && (
                            <button
                              type="button"
                              onClick={(e) => handleSingleDeleteClick(e, call.id)}
                              className="p-2 rounded-full text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-all"
                              title="Delete Record"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                        <td className="px-6 py-5 text-center">
                          <div className="text-slate-400">
                            {expandedId === call.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                        </td>
                        <td className="px-4 py-5">
                          <div className="text-sm font-bold text-slate-800 leading-tight">
                            {call.callDate || '--'}
                          </div>
                          <div className="text-[11px] font-semibold text-slate-400 mt-0.5">
                            {call.callTime || '--'}
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="text-sm font-semibold text-slate-600 whitespace-nowrap">
                            {formatAnalyzedAt(call.analyzedAt)}
                          </div>
                        </td>
                        <td className="px-6 py-5 text-center">
                          {call.uploadType === 'automated' ? (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-50 border border-cyan-100 text-slate-600" title="Automated Processing">
                              <Bot size={12} className="text-cyan-500" />
                              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-700">Dialer</span>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-fuchsia-50 border border-fuchsia-100 text-slate-600" title="Manual Upload">
                              <UploadCloud size={12} className="text-fuchsia-500" />
                              <span className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-700">Manual</span>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-5">
                          <div className="text-sm font-bold text-slate-900">{call.agentName}</div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="text-sm font-semibold text-slate-600">{call.campaignType || 'General'}</div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="text-sm text-slate-600 font-semibold whitespace-nowrap">
                            {formatPhoneNumber(call.phoneNumber)}
                          </div>
                        </td>
                        {/* Score Column */}
                        <td className="px-4 py-5 text-center">
                          <div className={`flex items-center justify-center gap-1.5 text-sm font-black ${scoreColor}`}>
                            <Award size={16} strokeWidth={2.5} />
                            {call.complianceScore}%
                          </div>
                        </td>
                        {/* Status Column */}
                        <td className="px-6 py-5">
                          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${statusConfig.bg} ${statusConfig.border}`}>
                            <statusConfig.Icon size={14} strokeWidth={2.5} className={statusConfig.iconColor} />
                            <span className={`text-[10px] font-black uppercase tracking-widest ${statusConfig.text}`}>
                              {statusConfig.label}
                            </span>
                          </div>
                        </td>
                        {/* Risk Column */}
                        <td className="px-4 py-5 text-center">
                          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${riskConfig.bg} ${riskConfig.border}`}>
                            <riskConfig.Icon size={14} strokeWidth={2.5} className={riskConfig.iconColor} />
                            <span className={`text-[10px] font-black uppercase tracking-widest ${riskConfig.text}`}>
                              {riskConfig.label}
                            </span>
                          </div>
                        </td>
                        {/* Tag Column */}
                        <td className="px-4 py-5 text-center">
                          {(() => {
                            const isEscalated = call.tag === 'escalated';
                            const isTraining = call.tag === 'training' || call.tag === 'training_review';

                            if (!isEscalated && !isTraining) {
                              return <span className="text-slate-300 text-xs">—</span>;
                            }

                            return (
                              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${isEscalated
                                ? 'bg-red-50 border-red-300 text-red-700'
                                : 'bg-green-50 border-green-300 text-green-700'
                                }`}>
                                {isEscalated && <AlertTriangle size={12} />}
                                {isTraining && <GraduationCap size={12} />}
                                <span className="text-[9px] font-black uppercase tracking-wider">
                                  {isEscalated ? 'Escalated' : 'Training'}
                                </span>
                              </div>
                            );
                          })()}
                        </td>
                        {showQAColumn && (
                          <td className="px-4 py-5 text-center" onClick={(e) => e.stopPropagation()}>
                            {call.qaStatus === 'approved' ? (
                              <div className="group relative">
                                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-emerald-50 border-emerald-200 cursor-pointer">
                                  <ClipboardCheck size={14} strokeWidth={2.5} className="text-emerald-600" />
                                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
                                    Reviewed
                                  </span>
                                </div>
                                {/* Hover tooltip with reviewer info */}
                                <div className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 px-4 py-3 bg-slate-900 text-white text-xs rounded-xl opacity-0 group-hover:opacity-100 transition-opacity shadow-xl pointer-events-none min-w-[180px]">
                                  <div className="font-bold text-emerald-300">{call.qaReviewedBy || 'Unknown'}</div>
                                  {call.qaReviewedAt && (
                                    <div className="text-slate-400 text-[10px] flex items-center gap-1 mt-1">
                                      <Clock size={10} />
                                      {new Date(call.qaReviewedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                  )}
                                  {call.qaOverrides && Object.keys(call.qaOverrides).length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-white/10">
                                      <div className="text-[10px] text-amber-300 font-bold uppercase">Overrides: {Object.keys(call.qaOverrides).length}</div>
                                    </div>
                                  )}
                                  {call.qaNotes && (
                                    <div className="mt-2 pt-2 border-t border-white/10">
                                      <div className="text-[10px] text-slate-400 uppercase mb-1">Notes:</div>
                                      <div className="text-slate-200 italic text-[11px] line-clamp-2">"{call.qaNotes}"</div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : call.qaStatus === 'rejected' ? (
                              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-rose-50 border-rose-200">
                                <XCircle size={14} strokeWidth={2.5} className="text-rose-600" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-rose-700">
                                  Rejected
                                </span>
                              </div>
                            ) : onStatusChange ? (
                              /* Actionable Dropdown for pending items */
                              <div className="relative inline-block">
                                <select
                                  className="appearance-none bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 pr-7 rounded-full cursor-pointer hover:bg-amber-100 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-300"
                                  value=""
                                  onChange={(e) => {
                                    const action = e.target.value;
                                    if (action === 'approve') {
                                      onStatusChange(call.id, 'approved');
                                    } else if (action === 'reject') {
                                      onStatusChange(call.id, 'rejected');
                                    } else if (action === 'escalate') {
                                      onStatusChange(call.id, 'escalated');
                                    }
                                  }}
                                >
                                  <option value="" disabled>⏳ Review</option>
                                  <option value="approve">✓ Approve</option>
                                  <option value="reject">✕ Reject</option>
                                  <option value="escalate">⚠ Escalate</option>
                                </select>
                                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-500 pointer-events-none" />
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-amber-50 border-amber-200">
                                <Clock size={14} strokeWidth={2.5} className="text-amber-600" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-amber-700">
                                  Pending
                                </span>
                              </div>
                            )}
                          </td>
                        )}
                        {/* Reviewed By Column */}
                        {showQAColumn && (
                          <td className="px-4 py-5 text-center">
                            <span className="text-sm font-semibold text-slate-700">
                              {call.qaReviewedBy || '--'}
                            </span>
                          </td>
                        )}
                        {/* Review Date Column */}
                        {showQAColumn && (
                          <td className="px-4 py-5 text-center">
                            <span className="text-xs font-medium text-slate-500">
                              {call.qaReviewedAt
                                ? new Date(call.qaReviewedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                : '--'}
                            </span>
                          </td>
                        )}
                        {/* Validation Notes Column */}
                        {showQAColumn && (
                          <td className="px-4 py-5">
                            {call.qaNotes ? (
                              <div className="min-w-[180px] max-w-[300px]">
                                <p className="text-xs text-slate-600 font-medium italic leading-relaxed">
                                  "{call.qaNotes}"
                                </p>
                              </div>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>
                        )}
                        {/* Row Actions */}
                        <td className="px-4 py-5 text-right">
                          <div className="flex items-center justify-end gap-3 mr-2">
                            {/* Details Button - opens analysis/compliance view */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onViewTranscript(call);
                              }}
                              className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 transition-all hover:scale-105 active:scale-95 shadow-md hover:shadow-lg"
                            >
                              Details
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedId === call.id && (
                        <tr className="bg-slate-50/80 animate-in fade-in zoom-in-95">
                          <td colSpan={showQAColumn ? 18 : 14} className="px-12 py-10 border-t border-slate-200 shadow-inner">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                              {/* Summary Section */}
                              <div className="bg-white p-7 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase mb-5 flex items-center gap-2 tracking-widest">
                                  <Quote size={12} className="text-purple-500" /> Executive Summary
                                </h4>
                                <div className="flex-1 overflow-y-auto max-h-[200px] pr-2 custom-scrollbar">
                                  <p className="text-sm text-slate-600 leading-relaxed font-semibold">
                                    {call.summary || 'No summary available for this interaction.'}
                                  </p>
                                </div>
                                <div className="mt-6 pt-4 border-t border-slate-50 flex items-center gap-2">
                                  <div className="h-2 w-2 rounded-full bg-purple-500"></div>
                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">AI Audit Confirmed</span>
                                </div>
                              </div>

                              {/* Risks & Violations */}
                              <div className="bg-white p-7 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase mb-5 flex items-center gap-2 tracking-widest">
                                  <ShieldAlert size={12} className="text-rose-500" /> Violations & Risks
                                </h4>
                                <div className="space-y-3 flex-1 overflow-y-auto max-h-[200px] pr-2 custom-scrollbar">
                                  {/* Auto-Fail Reasons (highest priority) */}
                                  {call.autoFailReasons && call.autoFailReasons.length > 0 && (
                                    call.autoFailReasons.map((af: any, i: number) => {
                                      const isObject = typeof af === 'object' && af !== null;
                                      const code = isObject ? af.code : `AF-${i + 1}`;
                                      const violation = isObject ? (af.violation || af.description) : af;
                                      const evidence = isObject ? af.evidence : null;
                                      const timestamp = isObject ? af.timestamp : null;
                                      const hasValidTimestamp = timestamp && timestamp !== '-1' && timestamp !== 'N/A' && timestamp !== '';
                                      const isWarning = isObject && af.severity === 'warning';
                                      return (
                                        <div key={`af-${i}`} className={`flex gap-3 ${isWarning ? 'bg-amber-50 border-amber-300' : 'bg-rose-100 border-rose-300'} p-3 rounded-lg border`}>
                                          <XCircle size={14} className={`${isWarning ? 'text-amber-600' : 'text-rose-600'} shrink-0 mt-0.5`} />
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline justify-between gap-2">
                                              <p className={`text-xs ${isWarning ? 'text-amber-900' : 'text-rose-900'} font-black`}>{isWarning ? 'REVIEW' : code}: {violation}</p>
                                              {hasValidTimestamp && (
                                                <span className={`shrink-0 text-[10px] ${isWarning ? 'text-amber-600 bg-amber-200/50' : 'text-rose-600 bg-rose-200/50'} font-mono px-1.5 py-0.5 rounded flex items-center gap-1`}>
                                                  <Clock size={8} /> {timestamp}
                                                </span>
                                              )}
                                            </div>
                                            {evidence && (
                                              <p className={`text-[10px] ${isWarning ? 'text-amber-700' : 'text-rose-700'} mt-1 italic line-clamp-2`}>"{evidence}"</p>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })
                                  )}
                                  {/* Regular Violations */}
                                  {call.violations && call.violations.length > 0 && (
                                    call.violations.map((v, i) => {
                                      const isObject = typeof v === 'object' && v !== null;
                                      const violation = typeof v === 'string' ? v : (v as any).description || (v as any).violation || JSON.stringify(v);
                                      const timestamp = isObject ? (v as any).timestamp : null;
                                      const evidence = isObject ? (v as any).evidence : null;
                                      const hasValidTimestamp = timestamp && timestamp !== '-1' && timestamp !== 'N/A' && timestamp !== '';
                                      return (
                                        <div key={`v-${i}`} className="flex gap-3 bg-rose-50/50 p-3 rounded-lg border border-rose-100">
                                          <AlertTriangle size={14} className="text-rose-500 shrink-0 mt-0.5" />
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline justify-between gap-2">
                                              <p className="text-xs text-rose-800 font-bold">{violation}</p>
                                              {hasValidTimestamp && (
                                                <span className="shrink-0 text-[10px] text-rose-500 font-mono bg-rose-100 px-1.5 py-0.5 rounded flex items-center gap-1">
                                                  <Clock size={8} /> {timestamp}
                                                </span>
                                              )}
                                            </div>
                                            {evidence && (
                                              <p className="text-[10px] text-rose-600 mt-1 italic line-clamp-2">"{evidence}"</p>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })
                                  )}
                                  {/* No violations message */}
                                  {(!call.autoFailReasons || call.autoFailReasons.length === 0) &&
                                   (!call.violations || call.violations.length === 0) && (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                      <CheckCircle2 size={32} className="mb-2 text-emerald-500/20" />
                                      <p className="text-xs font-bold">No Violations Detected</p>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Coaching Notes */}
                              <div className="bg-white p-7 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase mb-5 flex items-center gap-2 tracking-widest">
                                  <Lightbulb size={12} className="text-amber-500" /> Coaching Opportunities
                                </h4>
                                <div className="space-y-3 flex-1 overflow-y-auto max-h-[200px] pr-2 custom-scrollbar">
                                  {call.coachingNotes && call.coachingNotes.length > 0 ? (
                                    call.coachingNotes.map((note, i) => (
                                      <div key={i} className="flex gap-3 bg-amber-50/50 p-3 rounded-lg border border-amber-100">
                                        <div className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0 mt-1.5" />
                                        <p className="text-xs text-amber-900 font-medium leading-relaxed">{note}</p>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="text-center py-4 text-slate-400 text-xs italic">
                                      No specific coaching notes generated.
                                    </div>
                                  )}
                                </div>
                                <button
                                  onClick={(e) => { e.stopPropagation(); onViewTranscript(call); }}
                                  className="mt-4 w-full py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200 transition-all flex items-center justify-center gap-2"
                                >
                                  Open Full Transcript <MoreHorizontal size={14} />
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Delete Confirmation Modal Overlay */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={cancelDelete} />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="h-12 w-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 border border-rose-200">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Confirm Deletion</h3>
                <p className="text-sm text-slate-500 mt-2 font-medium">
                  Are you sure you want to delete {itemToDelete ? 'this record' : `${selectedIds.size} records`}?
                  <br />This action cannot be undone.
                </p>
              </div>
              <div className="flex gap-3 w-full mt-4">
                <button
                  onClick={cancelDelete}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 py-3 rounded-xl bg-rose-600 text-white font-bold text-sm hover:bg-rose-700 shadow-lg shadow-rose-200 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};