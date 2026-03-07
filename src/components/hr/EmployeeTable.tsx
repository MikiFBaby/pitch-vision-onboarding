"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { Eye, Mail, Search, Trash2, Upload, FileText, UserMinus, Slack, ChevronLeft, ChevronRight, Phone, MapPin, ClipboardPaste, X, AlertTriangle, CheckCircle2, XCircle, Loader2, Filter, Download } from "lucide-react";
import { motion } from "framer-motion";
import EmployeeProfileDrawer from "./EmployeeProfileDrawer";
import DeleteConfirmationModal from "./DeleteConfirmationModal";
import { calculateWeeklyHours, WEEKDAYS, scheduleNameKeys } from "@/lib/hr-utils";
import { detectCampaignType, getPerformanceTier, isPilotCampaign, type PerformanceTier } from "@/utils/dialedin-heatmap";
import { getBreakEvenTPH, getRevenuePerTransfer } from "@/utils/dialedin-revenue";
import { CAMPAIGN_MANAGERS, getAllManagerNames, getManagerNamesForCampaigns } from "@/lib/campaign-config";

interface Employee {
    id: string;
    first_name: string;
    last_name: string;
    role: string | null;
    email: string | null;
    slack_display_name: string | null;
    slack_user_id: string | null;
    user_image: string | null;
    documents?: { name: string; path: string; type: string; size: number; uploaded_at: string }[];
    phone: string | null;
    country: string | null;
    employee_status: string | null;
    hired_at: string | null;
    contract_status: string | null;
    signed_contract_url: string | null;
    signed_contract_audit_url: string | null;
    contract_signed_at: string | null;
    hourly_wage: number | null;
    training_start_date: string | null;
    docuseal_submission_id: string | null;
    current_campaigns?: string[] | null;
}

export default function EmployeeTable({ readOnly = false }: { readOnly?: boolean }) {
    const searchParams = useSearchParams();
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    // Action States
    const [activeActionRow, setActiveActionRow] = useState<string | null>(null);
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Upload States
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadTargetEmployee, setUploadTargetEmployee] = useState<Employee | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    // Ref for click outside to close actions menu
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (activeActionRow && !(event.target as Element).closest('.action-menu-container')) {
                setActiveActionRow(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeActionRow]);

    useEffect(() => {
        fetchEmployees();
    }, []);

    // Deep-link: open employee card from ?employee={id} (e.g. from Slack DM link)
    useEffect(() => {
        const employeeId = searchParams.get("employee");
        if (employeeId && employees.length > 0 && !isDrawerOpen) {
            const found = employees.find((e) => e.id === employeeId);
            if (found) {
                setSelectedEmployee(found);
                setIsDrawerOpen(true);
                window.history.replaceState({}, "", "/hr");
            }
        }
    }, [employees, searchParams]);

    const fetchEmployees = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from("employee_directory")
            .select("*")
            .order("hired_at", { ascending: false });

        if (!error && data) {
            setEmployees(data);
        }
        setLoading(false);
    };

    const handleTerminateEmployee = async () => {
        if (!selectedEmployee) return;

        setIsDeleting(true);
        const { error } = await supabase
            .from("employee_directory")
            .update({
                employee_status: "Terminated",
                terminated_at: new Date().toISOString(),
            })
            .eq("id", selectedEmployee.id);

        if (!error) {
            setEmployees(prev => prev.map(e =>
                e.id === selectedEmployee.id
                    ? { ...e, employee_status: "Terminated" }
                    : e
            ));
            setIsDeleteModalOpen(false);
            setSelectedEmployee(null);
        } else {
            console.error("Error terminating employee:", error);
            alert("Failed to terminate employee.");
        }
        setIsDeleting(false);
    };

    const handleRemoveEmployee = async () => {
        if (!selectedEmployee) return;

        setIsDeleting(true);
        const { error } = await supabase
            .from("employee_directory")
            .delete()
            .eq("id", selectedEmployee.id);

        if (!error) {
            setEmployees(prev => prev.filter(e => e.id !== selectedEmployee.id));
            setIsDeleteModalOpen(false);
            setSelectedEmployee(null);
        } else {
            console.error("Error removing employee:", error);
            alert("Failed to remove employee.");
        }
        setIsDeleting(false);
    };

    const handleActionClick = (employee: Employee, action: 'view' | 'delete' | 'upload') => {
        setSelectedEmployee(employee);
        setActiveActionRow(null);
        if (action === 'view') {
            setIsDrawerOpen(true);
        } else if (action === 'delete') {
            setIsDeleteModalOpen(true);
        } else if (action === 'upload') {
            setUploadTargetEmployee(employee);
            // Trigger file input click
            if (fileInputRef.current) {
                fileInputRef.current.click();
            }
        }
    };

    const handleTableFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files || event.target.files.length === 0 || !uploadTargetEmployee) return;

        const file = event.target.files[0];
        setIsUploading(true);

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${uploadTargetEmployee.id}/${Math.random().toString(36).substring(2)}.${fileExt}`;
            const filePath = `${fileName}`;

            // 1. Upload to Storage
            const { error: uploadError } = await supabase.storage
                .from('employee_documents')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // 2. Fetch current documents to append
            // We fetch fresh to ensure we don't overwrite concurrent updates, though for this simple case using local state might be ok, strictness is better.
            const { data: currentData, error: fetchError } = await supabase
                .from('employee_directory')
                .select('documents')
                .eq('id', uploadTargetEmployee.id)
                .single();

            if (fetchError) throw fetchError;

            const currentDocs = currentData?.documents || [];

            const newDoc = {
                name: file.name,
                path: filePath,
                type: file.type,
                size: file.size,
                uploaded_at: new Date().toISOString()
            };

            const updatedDocs = [...currentDocs, newDoc];

            // 3. Update Database
            const { error: dbError } = await supabase
                .from('employee_directory')
                .update({ documents: updatedDocs })
                .eq('id', uploadTargetEmployee.id);

            if (dbError) throw dbError;

            // Update local state to reflect changes (optional but good)
            setEmployees(prev => prev.map(emp =>
                emp.id === uploadTargetEmployee.id
                    ? { ...emp, documents: updatedDocs }
                    : emp
            ));

            alert(`Document "${file.name}" uploaded successfully for ${uploadTargetEmployee.first_name}!`);

        } catch (error) {
            console.error('Error uploading document:', error);
            alert('Failed to upload document. Please try again.');
        } finally {
            setIsUploading(false);
            setUploadTargetEmployee(null);
            // Reset input
            event.target.value = '';
        }
    };

    const [activeTab, setActiveTab] = useState<'all' | 'agents' | 'qa' | 'hr' | 'payroll' | 'management' | 'c-suite'>('all');

    // Dropdown Filters
    const [countryFilter, setCountryFilter] = useState<'all' | 'Canada' | 'USA' | 'unknown'>('all');
    const [employmentFilter, setEmploymentFilter] = useState<'all' | 'full-time' | 'part-time' | 'unknown'>('all');
    const [campaignFilter, setCampaignFilter] = useState<'all' | 'Medicare' | 'ACA' | 'Medicare WhatIF' | 'Hospital' | 'Pitch Meals' | 'Home Care Michigan' | 'Home Care PA' | 'Home Care NY' | 'none'>('all');
    const [statusFilter, setStatusFilter] = useState<'active' | 'pending' | 'terminated' | 'all'>('active');
    const [scheduleMap, setScheduleMap] = useState<Map<string, { hours: number; ft: boolean }>>(new Map());
    const [scheduleLoading, setScheduleLoading] = useState(true);

    // Hire date filter
    const [hireDateFilter, setHireDateFilter] = useState<'all' | 'last-7d' | 'last-30d' | 'last-90d' | 'last-year'>('all');

    // Performance filter (agents only — campaign-specific tiers)
    const [perfMap, setPerfMap] = useState<Record<string, { adjusted_tph: number | null; tph: number; skill: string | null }>>({});
    const [perfLoading, setPerfLoading] = useState(true);

    // Intraday data (TODAY SLA/hr column)
    const [intradayMap, setIntradayMap] = useState<Record<string, { sla_hr: number; rank?: number; team: string | null }>>({});
    const [intradayBreakEven, setIntradayBreakEven] = useState<{ aca: number; medicare: number }>({ aca: 2.5, medicare: 3.5 });

    // Trend filter + roster data (for trend analysis + CSV export)
    type TrendFilter = 'all' | 'crushing-it' | 'uptrend' | 'stable' | 'downtrend' | 'in-a-rut';
    const [trendFilter, setTrendFilter] = useState<TrendFilter>('all');
    interface RosterEntry { agent_name: string; employee_id: string | null; team: string | null; campaign_type: string | null; avg_tph: number; trend: 'up' | 'down' | 'flat'; trend_pct: number; total_transfers: number; total_hours: number; total_dials: number; total_connects: number; avg_conversion: number; days_worked: number; days_active: number; tier: string; est_revenue: number; hourly_wage: number | null; est_cost: number; true_cost: number | null; pnl: number; pnl_per_hour: number; roi_pct: number; qa_score: number | null; qa_stats: { avg_score: number; pass_rate: number; auto_fail_count: number; auto_fail_rate: number; total_calls: number; risk_breakdown: { high: number; medium: number; low: number } } | null; qa_language: { professionalism: number | null; empathy: number | null; clarity: number | null; pace: string | null; tone_keywords: string[] } | null; is_new_hire?: boolean; }
    const [rosterMap, setRosterMap] = useState<Record<string, RosterEntry>>({});
    const [rosterIdMap, setRosterIdMap] = useState<Record<string, RosterEntry>>({});
    const [rosterLoading, setRosterLoading] = useState(true);
    const [csvExporting, setCsvExporting] = useState(false);
    const [pdfExporting, setPdfExporting] = useState(false);
    // Cost/SLA filter: composite performance status based on break-even TPH
    type CostSlaFilter = 'all' | 'performing' | 'trending-up' | 'trending-down' | 'critical' | 'negative-pnl';
    const [costSlaFilter, setCostSlaFilter] = useState<CostSlaFilter>('all');
    // Manager filter (derived from campaign → manager mapping)
    const [managerFilter, setManagerFilter] = useState<string>('all');

    // Load all schedules once for PT/FT classification
    const loadSchedules = useCallback(async () => {
        setScheduleLoading(true);
        try {
            // Paginated fetch for Agent Schedule (>1000 rows)
            let allSchedules: any[] = [];
            let from = 0;
            const batch = 1000;
            while (true) {
                const { data } = await supabase
                    .from('Agent Schedule')
                    .select('"First Name", "Last Name", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"')
                    .range(from, from + batch - 1);
                if (!data || data.length === 0) break;
                allSchedules = allSchedules.concat(data);
                if (data.length < batch) break;
                from += batch;
            }

            // Load break schedules to know who gets 1hr/day deduction
            let allBreaks: any[] = [];
            from = 0;
            while (true) {
                const { data } = await supabase
                    .from('Agent Break Schedule')
                    .select('"First Name", "Last Name"')
                    .range(from, from + batch - 1);
                if (!data || data.length === 0) break;
                allBreaks = allBreaks.concat(data);
                if (data.length < batch) break;
                from += batch;
            }

            // Build break schedule lookup (variant keys for fuzzy matching)
            const breakKeys = new Set<string>();
            allBreaks.forEach((b: any) => {
                const f = (b['First Name'] || '').trim();
                const l = (b['Last Name'] || '').trim();
                if (!f) return;
                for (const key of scheduleNameKeys(f, l)) {
                    breakKeys.add(key);
                }
            });

            // Build schedule map (dedup by primary key, indexed by all variant keys)
            const map = new Map<string, { hours: number; ft: boolean }>();
            const processedPrimary = new Set<string>();
            allSchedules.forEach((row: any) => {
                const f = (row['First Name'] || '').trim();
                const l = (row['Last Name'] || '').trim();
                if (!f) return;
                const primaryKey = `${f.toLowerCase()}|${l.toLowerCase()}`;
                if (processedPrimary.has(primaryKey)) return;
                processedPrimary.add(primaryKey);

                const grossHours = calculateWeeklyHours(row);
                const workingDays = WEEKDAYS.filter(day => {
                    const s = row[day];
                    return s && s.trim().toLowerCase() !== 'off' && s.trim() !== '';
                }).length;
                const rowKeys = scheduleNameKeys(f, l);
                const hasBreak = rowKeys.some(k => breakKeys.has(k));
                const breakDeduction = hasBreak ? workingDays * 1 : 0;
                const netHours = Math.round((grossHours - breakDeduction) * 100) / 100;
                const displayHours = hasBreak ? netHours : grossHours;

                const entry = { hours: displayHours, ft: displayHours >= 30 };
                for (const key of rowKeys) {
                    if (!map.has(key)) map.set(key, entry);
                }
            });

            setScheduleMap(map);
        } catch (err) {
            console.error('Error loading schedules for PT/FT filter:', err);
        } finally {
            setScheduleLoading(false);
        }
    }, []);

    useEffect(() => { loadSchedules(); }, [loadSchedules]);

    // Load performance data for tier coloring
    useEffect(() => {
        (async () => {
            setPerfLoading(true);
            try {
                const res = await fetch('/api/hr/performance-bulk');
                if (res.ok) {
                    const json = await res.json();
                    setPerfMap(json.agents || {});
                }
            } catch (err) {
                console.error('Error loading performance data:', err);
            } finally {
                setPerfLoading(false);
            }
        })();
    }, []);

    // Load roster data for trend analysis + enriched CSV export
    useEffect(() => {
        (async () => {
            setRosterLoading(true);
            try {
                const res = await fetch('/api/executive/roster?period=30d');
                if (res.ok) {
                    const json = await res.json();
                    const map: Record<string, RosterEntry> = {};
                    const idMap: Record<string, RosterEntry> = {};
                    for (const agent of (json.roster || [])) {
                        map[agent.agent_name.toLowerCase()] = agent;
                        if (agent.employee_id) idMap[agent.employee_id] = agent;
                    }
                    setRosterMap(map);
                    setRosterIdMap(idMap);
                }
            } catch (err) {
                console.error('Error loading roster data:', err);
            } finally {
                setRosterLoading(false);
            }
        })();
    }, []);

    // Load intraday data for TODAY column
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/dialedin/intraday?include_trend=false&include_rank=true');
                if (res.ok) {
                    const json = await res.json();
                    const map: Record<string, { sla_hr: number; rank?: number; team: string | null }> = {};
                    for (const a of (json.agents || [])) {
                        map[a.name.toLowerCase().trim()] = { sla_hr: a.sla_hr, rank: a.rank, team: a.team };
                    }
                    setIntradayMap(map);
                    if (json.break_even) setIntradayBreakEven(json.break_even);
                }
            } catch { /* silent */ }
        })();
    }, []);

    // CAMPAIGN_MANAGERS imported from @/lib/campaign-config
    const availableManagers = useMemo(() => getAllManagerNames(), []);

    // Helper: get manager names for an employee's campaigns
    const getManagersForEmployee = useCallback((emp: Employee): string[] => {
        return getManagerNamesForCampaigns(emp.current_campaigns);
    }, []);

    // Match employee to perf data (fuzzy name matching)
    const getAgentPerf = useCallback((emp: Employee) => {
        const f = (emp.first_name || '').trim().toLowerCase();
        const l = (emp.last_name || '').trim().toLowerCase();
        const fullName = `${f} ${l}`;
        // Exact match
        if (perfMap[fullName]) return perfMap[fullName];
        // Last + first initial
        const initKey = `${f[0] || ''}. ${l}`;
        for (const [key, val] of Object.entries(perfMap)) {
            if (key === initKey) return val;
        }
        // Partial: first name + starts with last
        for (const [key, val] of Object.entries(perfMap)) {
            const parts = key.split(' ');
            const pf = parts[0];
            const pl = parts.slice(1).join(' ');
            if (pf === f && (pl.startsWith(l) || l.startsWith(pl))) return val;
        }
        return null;
    }, [perfMap]);

    // Match employee to intraday data (exact match by full name)
    const getIntradayData = useCallback((emp: Employee) => {
        const key = `${(emp.first_name || '').trim()} ${(emp.last_name || '').trim()}`.toLowerCase();
        return intradayMap[key] || null;
    }, [intradayMap]);

    // Match employee to roster data (employee_id first, then fuzzy name matching)
    const getRosterData = useCallback((emp: Employee): RosterEntry | null => {
        // Direct match by employee_id (most reliable)
        if (emp.id && rosterIdMap[emp.id]) return rosterIdMap[emp.id];
        // Fuzzy name matching fallback
        const f = (emp.first_name || '').trim().toLowerCase();
        const l = (emp.last_name || '').trim().toLowerCase();
        const fullName = `${f} ${l}`;
        if (rosterMap[fullName]) return rosterMap[fullName];
        // First initial + last
        const initKey = `${f[0] || ''}. ${l}`;
        if (rosterMap[initKey]) return rosterMap[initKey];
        // Partial: first name + starts with last
        for (const [key, val] of Object.entries(rosterMap)) {
            const parts = key.split(' ');
            const pf = parts[0];
            const pl = parts.slice(1).join(' ');
            if (pf === f && (pl.startsWith(l) || l.startsWith(pl))) return val;
        }
        return null;
    }, [rosterMap, rosterIdMap]);

    // Get performance tier for an employee
    // Minimum 7-day tenure required — new hires don't have meaningful performance data yet
    const getEmployeeTier = useCallback((emp: Employee): PerformanceTier | null => {
        if ((emp.role || '').toLowerCase() !== 'agent') return null;
        // Skip agents hired less than 7 days ago
        if (emp.hired_at) {
            const hiredDate = new Date(emp.hired_at);
            const daysSinceHire = (Date.now() - hiredDate.getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceHire < 7) return null;
        }
        const perf = getAgentPerf(emp);
        if (isPilotCampaign(emp.current_campaigns, perf?.skill)) return null; // pilot verticals — no metrics yet
        if (!perf) return null;
        const tph = perf.adjusted_tph ?? perf.tph;
        if (tph <= 0) return null;
        const campaign = detectCampaignType(emp.current_campaigns);
        return getPerformanceTier(tph, campaign);
    }, [getAgentPerf]);

    // Detect new hires: ≤5 lifetime shifts (from server-side RPC)
    const isNewHire = useCallback((emp: Employee): boolean => {
        if ((emp.role || '').toLowerCase() !== 'agent') return false;
        const roster = getRosterData(emp);
        if (!roster) {
            // No roster data at all — if hired recently, treat as new hire
            if (emp.hired_at) {
                const daysSinceHire = (Date.now() - new Date(emp.hired_at).getTime()) / (1000 * 60 * 60 * 24);
                return daysSinceHire < 14;
            }
            return false;
        }
        return roster.is_new_hire === true;
    }, [getRosterData]);

    // Get cost/SLA composite status using full-period roster data (30d)
    // Uses period avg TPH vs break-even, P&L, and trend to classify
    const getCostSlaStatus = useCallback((emp: Employee): CostSlaFilter | null => {
        if ((emp.role || '').toLowerCase() !== 'agent') return null;
        if (isNewHire(emp)) return null; // Exclude new hires from classification
        const roster = getRosterData(emp);
        if (!roster || roster.days_worked < 3) return null;
        const perf = getAgentPerf(emp);
        if (isPilotCampaign(emp.current_campaigns, perf?.skill)) return null;
        const be = getBreakEvenTPH(roster.team);
        const periodTPH = roster.avg_tph;
        const periodAbove = periodTPH >= be;
        const trendUp = roster.trend === 'up';
        // Period-based composite: above/below BE + trend direction
        if (periodAbove && (trendUp || roster.trend === 'flat')) return 'performing';
        if (periodAbove && roster.trend === 'down') return 'trending-down';
        if (!periodAbove && trendUp) return 'trending-up';
        return 'critical';
    }, [getRosterData, getAgentPerf, isNewHire]);

    // Shared: fetch + build roster lookups for export
    const getExportData = useCallback(async () => {
        let exportRoster: Record<string, RosterEntry> = rosterMap;
        let exportRosterById: Record<string, RosterEntry> = rosterIdMap;
        if (Object.keys(exportRoster).length === 0) {
            const res = await fetch('/api/executive/roster?period=30d');
            if (res.ok) {
                const json = await res.json();
                const map: Record<string, RosterEntry> = {};
                const idMap: Record<string, RosterEntry> = {};
                for (const agent of (json.roster || [])) {
                    map[agent.agent_name.toLowerCase()] = agent;
                    if (agent.employee_id) idMap[agent.employee_id] = agent;
                }
                exportRoster = map;
                exportRosterById = idMap;
            }
        }

        // Bulk fetch attendance events (last 90 days)
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const sinceDate = ninetyDaysAgo.toISOString().split('T')[0];

        const [bookedRes, nbRes, writeUpRes] = await Promise.all([
            supabase.from('Booked Days Off').select('"Agent Name", "Date"').gte('Date', sinceDate),
            supabase.from('Non Booked Days Off').select('"Agent Name", "Reason", "Date"').gte('Date', sinceDate),
            supabase.from('employee_write_ups').select('employee_id, type, sent_at'),
        ]);

        // Attendance by normalized name
        const attendByName = new Map<string, { planned: number; unplanned: number; lastDate: string }>();
        const normAttend = (n: string) => (n || '').trim().toLowerCase();
        for (const b of (bookedRes.data || [])) {
            const name = normAttend(b['Agent Name']);
            if (!name) continue;
            const entry = attendByName.get(name) || { planned: 0, unplanned: 0, lastDate: '' };
            entry.planned++;
            if (b.Date > entry.lastDate) entry.lastDate = b.Date;
            attendByName.set(name, entry);
        }
        for (const n of (nbRes.data || [])) {
            const name = normAttend(n['Agent Name']);
            if (!name) continue;
            const entry = attendByName.get(name) || { planned: 0, unplanned: 0, lastDate: '' };
            entry.unplanned++;
            if (n.Date > entry.lastDate) entry.lastDate = n.Date;
            attendByName.set(name, entry);
        }

        // Write-ups by employee_id
        const writeUpsByEmpId = new Map<string, number>();
        for (const w of (writeUpRes.data || [])) {
            if (!w.employee_id) continue;
            writeUpsByEmpId.set(w.employee_id, (writeUpsByEmpId.get(w.employee_id) || 0) + 1);
        }

        const rows = filterEmployees(employees);

        const findRoster = (emp: Employee): RosterEntry | null => {
            if (emp.id && exportRosterById[emp.id]) return exportRosterById[emp.id];
            const f = (emp.first_name || '').trim().toLowerCase();
            const l = (emp.last_name || '').trim().toLowerCase();
            const fullName = `${f} ${l}`;
            if (exportRoster[fullName]) return exportRoster[fullName];
            const initKey = `${f[0] || ''}. ${l}`;
            if (exportRoster[initKey]) return exportRoster[initKey];
            for (const [key, val] of Object.entries(exportRoster)) {
                const parts = key.split(' ');
                const pf = parts[0];
                const pl = parts.slice(1).join(' ');
                if (pf === f && (pl.startsWith(l) || l.startsWith(pl))) return val;
            }
            return null;
        };

        const findAttendance = (emp: Employee) => {
            const f = (emp.first_name || '').trim().toLowerCase();
            const l = (emp.last_name || '').trim().toLowerCase();
            return attendByName.get(`${f} ${l}`) || null;
        };

        return { rows, findRoster, findAttendance, writeUpsByEmpId };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employees, rosterMap, rosterIdMap, searchTerm, statusFilter, activeTab, countryFilter, employmentFilter, campaignFilter, managerFilter, hireDateFilter, trendFilter, costSlaFilter]);

    // CSV download with full performance, QA, attendance, and write-up data
    const downloadCSV = useCallback(async () => {
        setCsvExporting(true);
        try {
            const { rows, findRoster, findAttendance, writeUpsByEmpId } = await getExportData();

            const escapeCSV = (val: string) => {
                if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                    return `"${val.replace(/"/g, '""')}"`;
                }
                return val;
            };

            const headers = [
                // Employee Info
                'First Name', 'Last Name', 'Role', 'Email', 'Phone', 'Country',
                'Status', 'Hire Date', 'Days Active', 'Employment Type', 'Campaigns',
                'Team', 'Campaign Type', 'Hourly Wage', 'Contract Status',
                // Performance (30d)
                'Performance Tier', 'Avg SLA/hr (30d)', 'SLA Trend', 'Trend %', 'Tier (S/A/B/C/D)',
                'Total Transfers (30d)', 'Total Hours (30d)', 'Total Dials (30d)', 'Total Connects (30d)',
                'Avg Conversion %', 'Days Worked (30d)',
                // Financials
                'Est Revenue ($)', 'Est Cost ($)', 'True Cost ($)', 'P&L ($)',
                'P&L / Hour ($)', 'ROI %',
                // QA Compliance
                'QA Avg Score', 'QA Pass Rate %', 'QA Auto-Fails', 'QA Auto-Fail Rate %',
                'QA Risk: High', 'QA Risk: Medium', 'QA Calls Reviewed',
                // QA Language Assessment
                'QA Professionalism', 'QA Empathy', 'QA Clarity', 'QA Pace', 'QA Tone Keywords',
                // Attendance (90d)
                'Planned Absences (90d)', 'Unplanned Absences (90d)', 'Total Absences (90d)', 'Last Absence Date',
                // Write-Ups
                'Write-Up Count',
                // Weekly Schedule
                'Weekly Hours',
            ];

            const csvRows = rows.map(emp => {
                const empType = getEmploymentType(emp);
                const perfTier = getEmployeeTier(emp);
                const r = findRoster(emp);
                const qa = r?.qa_stats;
                const lang = r?.qa_language;
                const att = findAttendance(emp);
                const writeUps = emp.id ? (writeUpsByEmpId.get(emp.id) || 0) : 0;
                const schedHours = (() => {
                    for (const k of scheduleNameKeys(emp.first_name, emp.last_name)) {
                        const v = scheduleMap.get(k);
                        if (v) return v.hours;
                    }
                    return null;
                })();

                return [
                    // Employee Info
                    emp.first_name || '',
                    emp.last_name || '',
                    emp.role || '',
                    emp.email || '',
                    emp.phone || '',
                    emp.country || '',
                    emp.employee_status || '',
                    emp.hired_at ? new Date(emp.hired_at).toLocaleDateString('en-US') : '',
                    r ? String(r.days_active) : '',
                    empType === 'unknown' ? '' : empType,
                    (emp.current_campaigns || []).join('; '),
                    r?.team || '',
                    r?.campaign_type || '',
                    emp.hourly_wage != null ? `$${emp.hourly_wage.toFixed(2)}` : '',
                    emp.contract_status || '',
                    // Performance
                    perfTier || '',
                    r ? r.avg_tph.toFixed(2) : '',
                    r ? r.trend : '',
                    r ? `${r.trend_pct > 0 ? '+' : ''}${r.trend_pct.toFixed(1)}%` : '',
                    r ? r.tier : '',
                    r ? String(r.total_transfers) : '',
                    r ? r.total_hours.toFixed(1) : '',
                    r ? String(r.total_dials || 0) : '',
                    r ? String(r.total_connects || 0) : '',
                    r ? r.avg_conversion.toFixed(1) : '',
                    r ? String(r.days_worked) : '',
                    // Financials
                    r ? `$${r.est_revenue.toFixed(2)}` : '',
                    r ? `$${r.est_cost.toFixed(2)}` : '',
                    r?.true_cost != null ? `$${r.true_cost.toFixed(2)}` : '',
                    r ? `$${r.pnl.toFixed(2)}` : '',
                    r ? `$${(r.pnl_per_hour || 0).toFixed(2)}` : '',
                    r ? `${r.roi_pct.toFixed(1)}%` : '',
                    // QA
                    qa ? String(qa.avg_score) : '',
                    qa ? `${qa.pass_rate}%` : '',
                    qa ? String(qa.auto_fail_count) : '',
                    qa ? `${qa.auto_fail_rate}%` : '',
                    qa ? String(qa.risk_breakdown.high) : '',
                    qa ? String(qa.risk_breakdown.medium) : '',
                    qa ? String(qa.total_calls) : '',
                    // QA Language
                    lang?.professionalism != null ? String(lang.professionalism) : '',
                    lang?.empathy != null ? String(lang.empathy) : '',
                    lang?.clarity != null ? String(lang.clarity) : '',
                    lang?.pace || '',
                    lang?.tone_keywords?.join('; ') || '',
                    // Attendance
                    att ? String(att.planned) : '0',
                    att ? String(att.unplanned) : '0',
                    att ? String(att.planned + att.unplanned) : '0',
                    att?.lastDate || '',
                    // Write-Ups
                    String(writeUps),
                    // Schedule
                    schedHours != null ? schedHours.toFixed(1) : '',
                ].map(v => escapeCSV(String(v)));
            });

            const csv = [headers.join(','), ...csvRows.map(r => r.join(','))].join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `employee-directory-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Error exporting CSV:', err);
            alert('Failed to export CSV. Please try again.');
        } finally {
            setCsvExporting(false);
        }
    }, [getExportData, scheduleMap]);

    // PDF download with comprehensive employee data
    const downloadPDF = useCallback(async () => {
        setPdfExporting(true);
        try {
            const { jsPDF } = await import('jspdf');
            const autoTableModule = await import('jspdf-autotable');
            const autoTable = autoTableModule.default;
            const { rows, findRoster, findAttendance, writeUpsByEmpId } = await getExportData();

            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const pageWidth = 297;
            const pageHeight = 210;
            const margin = 10;

            // Colors
            const BRAND: [number, number, number] = [109, 40, 217];
            const NAVY: [number, number, number] = [15, 23, 42];
            const MUTED: [number, number, number] = [100, 116, 139];
            const GREEN: [number, number, number] = [16, 185, 129];
            const RED: [number, number, number] = [244, 63, 94];
            const AMBER: [number, number, number] = [245, 158, 11];

            // Header
            doc.setFillColor(...BRAND);
            doc.rect(0, 0, pageWidth, 3, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(...MUTED);
            doc.text('PITCH PERFECT SOLUTIONS', margin, 12);
            doc.setFontSize(20);
            doc.setTextColor(...NAVY);
            doc.text('Employee Directory Report', margin, 22);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...MUTED);
            const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
            doc.text(`Generated: ${dateStr}  |  ${rows.length} employees  |  30-day performance window`, margin, 29);
            doc.setDrawColor(200, 200, 210);
            doc.setLineWidth(0.3);
            doc.line(margin, 32, pageWidth - margin, 32);

            // Summary stats
            let matched = 0;
            let totalRev = 0;
            let totalCost = 0;
            let totalPnl = 0;
            const tierCounts: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 };
            for (const emp of rows) {
                const r = findRoster(emp);
                if (r) {
                    matched++;
                    totalRev += r.est_revenue;
                    totalCost += r.true_cost ?? r.est_cost;
                    totalPnl += r.pnl;
                    if (r.tier in tierCounts) tierCounts[r.tier]++;
                }
            }

            let sy = 38;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(...NAVY);
            const summaryItems = [
                `Agents w/ Data: ${matched}`,
                `Revenue: $${(totalRev / 1000).toFixed(0)}K`,
                `Cost: $${(totalCost / 1000).toFixed(0)}K`,
                `P&L: $${(totalPnl / 1000).toFixed(0)}K`,
                `Tier: S(${tierCounts.S}) A(${tierCounts.A}) B(${tierCounts.B}) C(${tierCounts.C}) D(${tierCounts.D})`,
            ];
            doc.text(summaryItems.join('    |    '), margin, sy);
            sy += 5;

            // Build table data
            const tableHeaders = [
                'Name', 'Role', 'Country', 'Campaigns', 'Wage',
                'SLA/hr', 'Trend', 'Tier', 'Transfers', 'Hours',
                'Revenue', 'Cost', 'P&L', 'ROI',
                'QA Score', 'QA Pass', 'QA AF',
                'Absent (90d)', 'Write-Ups',
            ];

            const tableData = rows.map(emp => {
                const r = findRoster(emp);
                const qa = r?.qa_stats;
                const att = findAttendance(emp);
                const writeUps = emp.id ? (writeUpsByEmpId.get(emp.id) || 0) : 0;
                const absTotal = att ? att.planned + att.unplanned : 0;
                const name = `${emp.first_name || ''} ${emp.last_name || ''}`.trim();

                return [
                    name,
                    emp.role || '',
                    emp.country || '',
                    (emp.current_campaigns || []).join(', '),
                    emp.hourly_wage != null ? `$${emp.hourly_wage}` : '',
                    r ? r.avg_tph.toFixed(2) : '',
                    r ? `${r.trend} ${r.trend_pct > 0 ? '+' : ''}${r.trend_pct.toFixed(0)}%` : '',
                    r ? r.tier : '',
                    r ? String(r.total_transfers) : '',
                    r ? r.total_hours.toFixed(0) : '',
                    r ? `$${(r.est_revenue / 1000).toFixed(1)}K` : '',
                    r ? `$${((r.true_cost ?? r.est_cost) / 1000).toFixed(1)}K` : '',
                    r ? `$${(r.pnl / 1000).toFixed(1)}K` : '',
                    r ? `${r.roi_pct.toFixed(0)}%` : '',
                    qa ? String(qa.avg_score) : '',
                    qa ? `${qa.pass_rate}%` : '',
                    qa ? String(qa.auto_fail_count) : '',
                    absTotal > 0 ? `${absTotal} (${att!.planned}P/${att!.unplanned}U)` : '0',
                    writeUps > 0 ? String(writeUps) : '',
                ];
            });

            // Auto-table
            autoTable(doc, {
                head: [tableHeaders],
                body: tableData,
                startY: sy,
                margin: { left: margin, right: margin },
                styles: {
                    fontSize: 6,
                    cellPadding: 1.5,
                    textColor: [30, 30, 50],
                    lineColor: [220, 220, 230],
                    lineWidth: 0.1,
                },
                headStyles: {
                    fillColor: BRAND,
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    fontSize: 6,
                },
                alternateRowStyles: {
                    fillColor: [245, 243, 255],
                },
                columnStyles: {
                    0: { cellWidth: 28 },   // Name
                    1: { cellWidth: 12 },   // Role
                    2: { cellWidth: 12 },   // Country
                    3: { cellWidth: 22 },   // Campaigns
                    4: { cellWidth: 10 },   // Wage
                    5: { cellWidth: 10 },   // TPH
                    6: { cellWidth: 16 },   // Trend
                    7: { cellWidth: 8 },    // Tier
                    8: { cellWidth: 12 },   // Transfers
                    9: { cellWidth: 10 },   // Hours
                    10: { cellWidth: 14 },  // Revenue
                    11: { cellWidth: 14 },  // Cost
                    12: { cellWidth: 14 },  // P&L
                    13: { cellWidth: 10 },  // ROI
                    14: { cellWidth: 12 },  // QA Score
                    15: { cellWidth: 12 },  // QA Pass
                    16: { cellWidth: 10 },  // QA AF
                    17: { cellWidth: 20 },  // Absent
                    18: { cellWidth: 14 },  // Write-Ups
                },
                didParseCell: (data: any) => {
                    if (data.section !== 'body') return;
                    const col = data.column.index;
                    const val = data.cell.raw as string;
                    // Color P&L column
                    if (col === 12 && val) {
                        const neg = val.startsWith('-') || val.startsWith('$-');
                        data.cell.styles.textColor = neg ? RED : GREEN;
                        data.cell.styles.fontStyle = 'bold';
                    }
                    // Color Tier column
                    if (col === 7 && val) {
                        if (val === 'S') data.cell.styles.textColor = [109, 40, 217];
                        else if (val === 'A') data.cell.styles.textColor = GREEN;
                        else if (val === 'D') data.cell.styles.textColor = RED;
                        data.cell.styles.fontStyle = 'bold';
                    }
                    // Color QA Auto-Fails
                    if (col === 16 && val && parseInt(val) > 0) {
                        data.cell.styles.textColor = RED;
                        data.cell.styles.fontStyle = 'bold';
                    }
                    // Color absences
                    if (col === 17 && val && !val.startsWith('0')) {
                        data.cell.styles.textColor = AMBER;
                    }
                },
                didDrawPage: (data: any) => {
                    // Footer on each page
                    const pageNum = (doc as any).internal.getNumberOfPages();
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(7);
                    doc.setTextColor(...MUTED);
                    doc.text('Pitch Perfect Solutions - Confidential', margin, pageHeight - 5);
                    doc.text(`Page ${data.pageNumber} of ${pageNum}`, pageWidth - margin - 25, pageHeight - 5);
                },
            });

            doc.save(`employee-directory-report-${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (err) {
            console.error('Error exporting PDF:', err);
            alert('Failed to export PDF. Please try again.');
        } finally {
            setPdfExporting(false);
        }
    }, [getExportData, scheduleMap]);

    // Role tab matching helper (shared by statusCounts + filterEmployees)
    const matchesRoleTab = useCallback((emp: Employee, tab: string): boolean => {
        if (tab === 'all') return true;
        const role = emp.role?.toLowerCase() || '';
        if (tab === 'agents') return role === 'agent';
        if (tab === 'qa') return role === 'qa' || role.includes('head of qa');
        if (tab === 'hr') return (role.includes('hr') || role.includes('attendance')) && !role.includes('payroll');
        if (tab === 'payroll') return role.includes('payroll');
        if (tab === 'management') return role.includes('manager') || role.includes('team leader') || role.includes('head of dialer') || role.includes('head of operations');
        if (tab === 'c-suite') return role.includes('owner') || role.includes('founder') || role.includes('president') || role.includes('cto') || role.includes('caio');
        return false;
    }, []);

    // Status counts — applies ALL non-status filters so pill counts stay accurate
    const statusCounts = useMemo(() => {
        const counts = { active: 0, pending: 0, terminated: 0, total: 0 };
        employees.forEach(emp => {
            if (!matchesRoleTab(emp, activeTab)) return;

            if (countryFilter !== 'all') {
                const c = (emp.country || '').trim();
                if (countryFilter === 'unknown') { if (c) return; }
                else { if (c !== countryFilter) return; }
            }

            if (employmentFilter !== 'all') {
                const empType = getEmploymentType(emp);
                if (empType !== employmentFilter) return;
            }

            if (campaignFilter !== 'all') {
                const campaigns: string[] = emp.current_campaigns || [];
                if (campaignFilter === 'none') { if (campaigns.length > 0) return; }
                else {
                    const fl = campaignFilter.toLowerCase();
                    if (!campaigns.some(c => c.toLowerCase() === fl)) return;
                }
            }

            if (managerFilter !== 'all') {
                const empManagers = getManagersForEmployee(emp);
                if (!empManagers.includes(managerFilter)) return;
            }

            if (hireDateFilter !== 'all') {
                const hiredAt = emp.hired_at ? new Date(emp.hired_at) : null;
                if (!hiredAt || isNaN(hiredAt.getTime())) return;
                const diffDays = (Date.now() - hiredAt.getTime()) / (1000 * 60 * 60 * 24);
                if (hireDateFilter === 'last-7d' && diffDays > 7) return;
                if (hireDateFilter === 'last-30d' && diffDays > 30) return;
                if (hireDateFilter === 'last-90d' && diffDays > 90) return;
                if (hireDateFilter === 'last-year' && diffDays > 365) return;
            }

            if (trendFilter !== 'all') {
                const isAgent = (emp.role || '').toLowerCase() === 'agent';
                if (isAgent) {
                    const roster = getRosterData(emp);
                    if (!roster) return;
                    const t = roster.trend;
                    const rTier = roster.tier;
                    if (trendFilter === 'crushing-it' && !(t === 'up' && (rTier === 'S' || rTier === 'A'))) return;
                    if (trendFilter === 'uptrend' && t !== 'up') return;
                    if (trendFilter === 'stable' && t !== 'flat') return;
                    if (trendFilter === 'downtrend' && t !== 'down') return;
                    if (trendFilter === 'in-a-rut' && !((t === 'down' || t === 'flat') && (rTier === 'C' || rTier === 'D'))) return;
                } else {
                    return; // non-agents have no trend data
                }
            }

            if (costSlaFilter !== 'all') {
                const status = getCostSlaStatus(emp);
                if (!status) return;
                if (costSlaFilter === 'negative-pnl') {
                    const roster = getRosterData(emp);
                    if (!roster || roster.pnl >= 0) return;
                } else {
                    if (status !== costSlaFilter) return;
                }
            }

            counts.total++;
            const s = (emp.employee_status || '').toLowerCase();
            if (s === 'active') counts.active++;
            else if (s === 'pending') counts.pending++;
            else if (s === 'terminated') counts.terminated++;
        });
        return counts;
    }, [employees, activeTab, countryFilter, employmentFilter, campaignFilter, managerFilter, hireDateFilter, trendFilter, costSlaFilter, matchesRoleTab, getManagersForEmployee, getRosterData, getCostSlaStatus]);

    const handleActivateEmployee = async (employee: Employee) => {
        const { error } = await supabase
            .from("employee_directory")
            .update({ employee_status: "Active" })
            .eq("id", employee.id);

        if (!error) {
            setEmployees(prev => prev.map(e =>
                e.id === employee.id ? { ...e, employee_status: "Active" } : e
            ));
        } else {
            console.error("Error activating employee:", error);
            alert("Failed to activate employee.");
        }
    };

    // Selection Mode
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());

    const toggleSelectionMode = () => {
        setIsSelectionMode(!isSelectionMode);
        setSelectedEmployeeIds(new Set());
    };

    const toggleRowSelection = (id: string) => {
        const newSelected = new Set(selectedEmployeeIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedEmployeeIds(newSelected);
    };

    // Bulk action states
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

    // Bulk Name Paste states
    const [isBulkPasteOpen, setIsBulkPasteOpen] = useState(false);
    const [bulkNameInput, setBulkNameInput] = useState("");
    const [bulkMatches, setBulkMatches] = useState<{ name: string; match: Employee | null; }[]>([]);
    const [bulkStep, setBulkStep] = useState<'input' | 'review'>('input');
    const [bulkProcessing, setBulkProcessing] = useState(false);
    const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());

    const parseBulkNames = () => {
        const lines = bulkNameInput
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0);

        const matches = lines.map(line => {
            const parts = line.split(/\s+/);
            const firstName = parts[0]?.toLowerCase() || '';
            const lastName = parts.slice(1).join(' ').toLowerCase() || '';

            // Exact match first
            let match = employees.find(e =>
                e.first_name?.toLowerCase() === firstName &&
                e.last_name?.toLowerCase() === lastName
            );

            // Partial match fallback (first name + starts with last name)
            if (!match && lastName) {
                match = employees.find(e =>
                    e.first_name?.toLowerCase() === firstName &&
                    e.last_name?.toLowerCase().startsWith(lastName)
                );
            }

            return { name: line, match: match || null };
        });

        setBulkMatches(matches);
        // Auto-select all matched employees
        const matchedIds = new Set<string>();
        matches.forEach(m => { if (m.match) matchedIds.add(m.match.id); });
        setBulkSelectedIds(matchedIds);
        setBulkStep('review');
    };

    const handleBulkPasteTerminate = async () => {
        if (bulkSelectedIds.size === 0) return;
        setBulkProcessing(true);
        const { error } = await supabase
            .from("employee_directory")
            .update({ employee_status: "Terminated", terminated_at: new Date().toISOString() })
            .in("id", Array.from(bulkSelectedIds));

        if (!error) {
            setEmployees(prev => prev.map(e =>
                bulkSelectedIds.has(e.id) ? { ...e, employee_status: "Terminated" } : e
            ));
            closeBulkPaste();
        } else {
            alert("Failed to terminate employees.");
        }
        setBulkProcessing(false);
    };

    const handleBulkPasteRemove = async () => {
        if (bulkSelectedIds.size === 0) return;
        setBulkProcessing(true);
        const { error } = await supabase
            .from("employee_directory")
            .delete()
            .in("id", Array.from(bulkSelectedIds));

        if (!error) {
            setEmployees(prev => prev.filter(e => !bulkSelectedIds.has(e.id)));
            closeBulkPaste();
        } else {
            alert("Failed to remove employees.");
        }
        setBulkProcessing(false);
    };

    const closeBulkPaste = () => {
        setIsBulkPasteOpen(false);
        setBulkNameInput("");
        setBulkMatches([]);
        setBulkStep('input');
        setBulkSelectedIds(new Set());
    };

    const handleBulkAction = () => {
        if (selectedEmployeeIds.size === 0) return;
        setIsBulkModalOpen(true);
    };

    const handleBulkTerminate = async () => {
        setIsDeleting(true);
        const { error } = await supabase
            .from("employee_directory")
            .update({
                employee_status: "Terminated",
                terminated_at: new Date().toISOString(),
            })
            .in("id", Array.from(selectedEmployeeIds));

        if (!error) {
            setEmployees(prev => prev.map(e =>
                selectedEmployeeIds.has(e.id)
                    ? { ...e, employee_status: "Terminated" }
                    : e
            ));
            setSelectedEmployeeIds(new Set());
            setIsSelectionMode(false);
            setIsBulkModalOpen(false);
        } else {
            console.error("Error bulk terminating:", error);
            alert("Failed to terminate employees.");
        }
        setIsDeleting(false);
    };

    const handleBulkRemove = async () => {
        setIsDeleting(true);
        const { error } = await supabase
            .from("employee_directory")
            .delete()
            .in("id", Array.from(selectedEmployeeIds));

        if (!error) {
            setEmployees(prev => prev.filter(e => !selectedEmployeeIds.has(e.id)));
            setSelectedEmployeeIds(new Set());
            setIsSelectionMode(false);
            setIsBulkModalOpen(false);
        } else {
            console.error("Error bulk removing:", error);
            alert("Failed to remove employees.");
        }
        setIsDeleting(false);
    };

    // Helper: look up PT/FT for an employee using flexible name matching
    const getEmploymentType = (emp: Employee): 'full-time' | 'part-time' | 'unknown' => {
        const f = (emp.first_name || '').trim().toLowerCase();
        const l = (emp.last_name || '').trim().toLowerCase();
        const fullName = `${f} ${l}`.trim();
        const fFirst = f.split(/\s+/)[0];
        const strip = (s: string) => s.replace(/[''`.\-]/g, '').trim().toLowerCase();
        const collapse = (s: string) => strip(s).replace(/\s+/g, '');
        // Exact match
        const exact = scheduleMap.get(`${f}|${l}`);
        if (exact) return exact.ft ? 'full-time' : 'part-time';
        // First-word match (e.g. directory "John Michael" vs schedule "john")
        if (fFirst !== f) {
            const firstWordMatch = scheduleMap.get(`${fFirst}|${l}`);
            if (firstWordMatch) return firstWordMatch.ft ? 'full-time' : 'part-time';
        }
        // Flexible: full-name-in-first-column, first name matching, last name matching
        let flexResult: 'full-time' | 'part-time' | null = null;
        scheduleMap.forEach((val, key) => {
            if (flexResult) return;
            const parts = key.split('|');
            const sf = parts[0], sl = parts[1];
            const schedFull = `${sf} ${sl}`.trim();
            // Full-name match: "portia washington"|"" vs fullName "portia washington"
            if (schedFull === fullName || collapse(schedFull) === collapse(fullName)) {
                flexResult = val.ft ? 'full-time' : 'part-time'; return;
            }
            // Full name crammed into first-name column: sf="portia washington", sl=""
            if (sf.includes(' ') && !sl && l) {
                const sfParts = sf.split(/\s+/);
                if (sfParts.length >= 2) {
                    const sfFirst = sfParts[0], sfRest = sfParts.slice(1).join(' ');
                    if ((sfFirst === fFirst || sfFirst === f) &&
                        (sfRest === l || sfRest.includes(l) || l.includes(sfRest) ||
                         strip(sfRest) === strip(l) || collapse(sfRest) === collapse(l))) {
                        flexResult = val.ft ? 'full-time' : 'part-time'; return;
                    }
                }
            }
            const sfFirst = sf.split(/\s+/)[0];
            const firstMatch = sf === f || sf === fFirst || sfFirst === f || sfFirst === fFirst
                || strip(sf) === strip(f) || strip(sfFirst) === strip(fFirst)
                || (sfFirst.length >= 3 && fFirst.startsWith(sfFirst))
                || (fFirst.length >= 3 && sfFirst.startsWith(fFirst));
            if (!firstMatch) return;
            // Empty last name in schedule or directory → match on first name alone
            if (!sl || !l) { flexResult = val.ft ? 'full-time' : 'part-time'; return; }
            if (sl === l || sl.includes(l) || l.includes(sl) || strip(sl) === strip(l) || collapse(sl) === collapse(l)) {
                flexResult = val.ft ? 'full-time' : 'part-time';
            }
        });
        if (flexResult) return flexResult;
        return 'unknown';
    };

    const filterEmployees = (employees: Employee[]) => {
        return employees.filter(emp => {
            // Status Filter
            if (statusFilter !== 'all') {
                if ((emp.employee_status || '').toLowerCase() !== statusFilter) return false;
            }

            // Search Filter — supports first, last, full name, and email
            const term = searchTerm.toLowerCase().trim();
            if (term) {
                const first = (emp.first_name || '').toLowerCase();
                const last = (emp.last_name || '').toLowerCase();
                const fullName = `${first} ${last}`;
                const email = (emp.email || '').toLowerCase();
                const slackName = (emp.slack_display_name || '').toLowerCase();

                const matchesSearch =
                    first.includes(term) ||
                    last.includes(term) ||
                    fullName.includes(term) ||
                    email.includes(term) ||
                    slackName.includes(term);

                if (!matchesSearch) return false;
            }

            // Country Filter
            if (countryFilter !== 'all') {
                const c = (emp.country || '').trim();
                if (countryFilter === 'unknown') {
                    if (c) return false;
                } else {
                    if (c !== countryFilter) return false;
                }
            }

            // Employment Type Filter (PT/FT)
            if (employmentFilter !== 'all') {
                const empType = getEmploymentType(emp);
                if (empType !== employmentFilter) return false;
            }

            // Campaign Filter (exact match to prevent "Medicare" matching "Medicare WhatIF")
            if (campaignFilter !== 'all') {
                const campaigns: string[] = emp.current_campaigns || [];
                if (campaignFilter === 'none') {
                    if (campaigns.length > 0) return false;
                } else {
                    const fl = campaignFilter.toLowerCase();
                    const hasMatch = campaigns.some(c => c.toLowerCase() === fl);
                    if (!hasMatch) return false;
                }
            }

            // Manager Filter (from campaign → manager mapping)
            if (managerFilter !== 'all') {
                const empManagers = getManagersForEmployee(emp);
                if (!empManagers.includes(managerFilter)) return false;
            }

            // Hire Date Filter
            if (hireDateFilter !== 'all') {
                const hiredAt = emp.hired_at ? new Date(emp.hired_at) : null;
                if (!hiredAt || isNaN(hiredAt.getTime())) return false;
                const now = new Date();
                const diffDays = (now.getTime() - hiredAt.getTime()) / (1000 * 60 * 60 * 24);
                if (hireDateFilter === 'last-7d' && diffDays > 7) return false;
                if (hireDateFilter === 'last-30d' && diffDays > 30) return false;
                if (hireDateFilter === 'last-90d' && diffDays > 90) return false;
                if (hireDateFilter === 'last-year' && diffDays > 365) return false;
            }

            // Trend Filter (agent-only metric — skip for non-agents so they aren't silently removed)
            if (trendFilter !== 'all') {
                const isAgent = (emp.role || '').toLowerCase() === 'agent';
                if (!isAgent) return false;
                const roster = getRosterData(emp);
                if (!roster) return false; // no roster data = can't classify
                const t = roster.trend;
                const rTier = roster.tier;
                if (trendFilter === 'crushing-it' && !(t === 'up' && (rTier === 'S' || rTier === 'A'))) return false;
                if (trendFilter === 'uptrend' && t !== 'up') return false;
                if (trendFilter === 'stable' && t !== 'flat') return false;
                if (trendFilter === 'downtrend' && t !== 'down') return false;
                if (trendFilter === 'in-a-rut' && !((t === 'down' || t === 'flat') && (rTier === 'C' || rTier === 'D'))) return false;
            }

            // Cost/SLA Filter (agent-only metric — skip for non-agents)
            if (costSlaFilter !== 'all') {
                const isAgent = (emp.role || '').toLowerCase() === 'agent';
                if (!isAgent) return false;
                const status = getCostSlaStatus(emp);
                if (!status) return false;
                if (costSlaFilter === 'negative-pnl') {
                    const roster = getRosterData(emp);
                    if (!roster || roster.pnl >= 0) return false;
                } else {
                    if (status !== costSlaFilter) return false;
                }
            }

            // Tab Filter
            return matchesRoleTab(emp, activeTab);
        });
    };

    let filteredEmployees = filterEmployees(employees);

    // Pagination Logic
    const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);
    const paginatedEmployees = filteredEmployees.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    return (
        <>
            {/* Hidden File Input for Row Actions */}
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={handleTableFileUpload}
                disabled={isUploading}
            />

            <div className="space-y-4">
                {/* Header Controls */}
                <div className="flex flex-col gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                        <div className="relative w-full sm:w-96">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search className="h-4 w-4 text-gray-400" />
                            </div>
                            <input
                                type="text"
                                placeholder="Search employees..."
                                className="pl-10 pr-4 py-2 w-full border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            {isSelectionMode && !readOnly ? (
                                <button
                                    onClick={handleBulkAction}
                                    disabled={selectedEmployeeIds.size === 0}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    Remove ({selectedEmployeeIds.size})
                                </button>
                            ) : (
                                <>
                                    <button
                                        onClick={downloadCSV}
                                        disabled={csvExporting}
                                        className="flex items-center gap-2 px-4 py-2 bg-white text-gray-600 border border-gray-200 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-wait"
                                        title="Download filtered employees with full performance, QA, attendance & write-up data as CSV"
                                    >
                                        {csvExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                        {csvExporting ? 'Exporting...' : 'Export CSV'}
                                    </button>
                                    <button
                                        onClick={downloadPDF}
                                        disabled={pdfExporting}
                                        className="flex items-center gap-2 px-4 py-2 bg-white text-purple-600 border border-purple-200 text-sm font-medium rounded-lg hover:bg-purple-50 transition-colors disabled:opacity-50 disabled:cursor-wait"
                                        title="Download filtered employees as a formatted PDF report"
                                    >
                                        {pdfExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                                        {pdfExporting ? 'Generating...' : 'Export PDF'}
                                    </button>
                                    {!readOnly && (
                                        <>
                                            <button
                                                onClick={() => setIsBulkPasteOpen(true)}
                                                className="flex items-center gap-2 px-4 py-2 bg-white text-orange-600 border border-orange-200 text-sm font-medium rounded-lg hover:bg-orange-50 transition-colors"
                                            >
                                                <ClipboardPaste className="h-4 w-4" />
                                                Bulk Remove
                                            </button>
                                            <button
                                                onClick={toggleSelectionMode}
                                                className="flex items-center gap-2 px-4 py-2 bg-white text-red-600 border border-red-200 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                                Remove Employee
                                            </button>
                                        </>
                                    )}
                                </>
                            )}

                        </div>
                    </div>

                    {/* Status Filter */}
                    <div className="flex items-center gap-1 pb-2 border-b border-gray-100 mb-1">
                        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider mr-2">Status</span>
                        {([
                            { id: 'active' as const, label: 'Active', count: statusCounts.active },
                            { id: 'pending' as const, label: 'Pending', count: statusCounts.pending },
                            { id: 'terminated' as const, label: 'Terminated', count: statusCounts.terminated },
                            { id: 'all' as const, label: 'All', count: statusCounts.total },
                        ]).map((tab) => {
                            const isActive = statusFilter === tab.id;
                            const colorClass = isActive
                                ? tab.id === 'active' ? 'bg-emerald-600 text-white'
                                : tab.id === 'pending' ? 'bg-amber-500 text-white'
                                : tab.id === 'terminated' ? 'bg-red-600 text-white'
                                : 'bg-gray-900 text-white'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100';
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => { setStatusFilter(tab.id); setCurrentPage(1); }}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${colorClass}`}
                                >
                                    {tab.label}
                                    <span className={`ml-1.5 text-xs font-semibold ${isActive ? 'text-white' : 'text-gray-600'}`}>
                                        {tab.count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-hide">
                        {[
                            { id: 'all', label: 'All' },
                            { id: 'agents', label: 'Agents' },
                            { id: 'qa', label: 'QA' },
                            { id: 'hr', label: 'HR' },
                            { id: 'payroll', label: 'Payroll' },
                            { id: 'management', label: 'Management' },
                            { id: 'c-suite', label: 'C-Suite' }
                        ].map((tab) => {
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => { setActiveTab(tab.id as any); setCurrentPage(1); }}
                                    className={`
                                        relative px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors duration-200
                                        ${isActive ? 'text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}
                                    `}
                                >
                                    {isActive && (
                                        <motion.div
                                            layoutId="activeTab"
                                            className="absolute inset-0 bg-black rounded-lg shadow-sm"
                                            initial={false}
                                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                        />
                                    )}
                                    <span className="relative z-10">{tab.label}</span>
                                </button>
                            );
                        })}
                        {isSelectionMode && (
                            <button
                                onClick={() => setIsSelectionMode(false)}
                                className="ml-auto px-4 py-2 text-sm text-gray-500 hover:text-gray-900"
                            >
                                Cancel Selection
                            </button>
                        )}
                    </div>

                    {/* Dropdown Filters */}
                    {(() => {
                        const activeFilterCount = [countryFilter, employmentFilter, campaignFilter, managerFilter, hireDateFilter, trendFilter, costSlaFilter].filter(f => f !== 'all').length;
                        const selectBase = "px-3 py-1.5 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer disabled:opacity-50 disabled:cursor-wait";
                        const selectActive = `${selectBase} border-blue-400 text-blue-700 font-medium`;
                        const selectDefault = `${selectBase} border-gray-200 text-gray-700`;
                        return (
                            <div className="pt-2 border-t border-gray-100 space-y-2">
                                {/* Header row: icon + active count + clear button */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Filter className="h-4 w-4 text-gray-400" />
                                        <span className="text-xs font-medium text-gray-500">Filters</span>
                                        {activeFilterCount > 0 && (
                                            <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold">
                                                {activeFilterCount}
                                            </span>
                                        )}
                                        {scheduleLoading && (
                                            <span className="text-xs text-gray-400 flex items-center gap-1 ml-2">
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                Loading...
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => { setCountryFilter('all'); setEmploymentFilter('all'); setCampaignFilter('all'); setManagerFilter('all'); setHireDateFilter('all'); setTrendFilter('all'); setCostSlaFilter('all'); setCurrentPage(1); }}
                                        disabled={activeFilterCount === 0}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${activeFilterCount > 0 ? 'text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 cursor-pointer' : 'text-gray-400 bg-gray-50 border border-gray-200 cursor-default'}`}
                                    >
                                        <X className="h-3 w-3" />
                                        Clear all filters
                                    </button>
                                </div>
                                {/* Filter dropdowns — wrapping grid */}
                                <div className="flex flex-wrap items-center gap-2">
                                    <select value={countryFilter} onChange={(e) => { setCountryFilter(e.target.value as any); setCurrentPage(1); }} className={countryFilter !== 'all' ? selectActive : selectDefault}>
                                        <option value="all">All Countries</option>
                                        <option value="USA">USA</option>
                                        <option value="Canada">Canada</option>
                                        <option value="unknown">Unknown</option>
                                    </select>
                                    <select value={employmentFilter} onChange={(e) => { setEmploymentFilter(e.target.value as any); setCurrentPage(1); }} disabled={scheduleLoading} className={employmentFilter !== 'all' ? selectActive : selectDefault}>
                                        <option value="all">All Employment</option>
                                        <option value="full-time">Full-Time (30+ hrs)</option>
                                        <option value="part-time">Part-Time (&lt;30 hrs)</option>
                                        <option value="unknown">No Schedule</option>
                                    </select>
                                    <select value={campaignFilter} onChange={(e) => { setCampaignFilter(e.target.value as any); setCurrentPage(1); }} className={campaignFilter !== 'all' ? selectActive : selectDefault}>
                                        <option value="all">All Campaigns</option>
                                        <option value="Medicare">Medicare</option>
                                        <option value="ACA">ACA</option>
                                        <option value="Medicare WhatIF">Medicare WhatIF</option>
                                        <option value="Hospital">Hospital</option>
                                        <option value="Pitch Meals">Pitch Meals</option>
                                        <option value="Home Care Michigan">Home Care Michigan</option>
                                        <option value="Home Care PA">Home Care PA</option>
                                        <option value="Home Care NY">Home Care NY</option>
                                        <option value="none">No Campaign</option>
                                    </select>
                                    <select value={managerFilter} onChange={(e) => { setManagerFilter(e.target.value); setCurrentPage(1); }} className={managerFilter !== 'all' ? selectActive : selectDefault}>
                                        <option value="all">All Managers</option>
                                        {availableManagers.map((m) => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                    </select>
                                    <select value={hireDateFilter} onChange={(e) => { setHireDateFilter(e.target.value as any); setCurrentPage(1); }} className={hireDateFilter !== 'all' ? selectActive : selectDefault}>
                                        <option value="all">All Hire Dates</option>
                                        <option value="last-7d">Last 7 Days</option>
                                        <option value="last-30d">Last 30 Days</option>
                                        <option value="last-90d">Last 90 Days</option>
                                        <option value="last-year">Last Year</option>
                                    </select>
                                    <select value={trendFilter} onChange={(e) => { setTrendFilter(e.target.value as TrendFilter); setCurrentPage(1); }} disabled={rosterLoading} className={trendFilter !== 'all' ? selectActive : selectDefault}>
                                        <option value="all">All Trends</option>
                                        <option value="crushing-it">Crushing It (S/A + Up)</option>
                                        <option value="uptrend">Uptrend</option>
                                        <option value="stable">Stable</option>
                                        <option value="downtrend">Downtrend</option>
                                        <option value="in-a-rut">In a Rut (C/D + Down/Flat)</option>
                                    </select>
                                    <select value={costSlaFilter} onChange={(e) => { setCostSlaFilter(e.target.value as CostSlaFilter); setCurrentPage(1); }} disabled={rosterLoading} className={costSlaFilter !== 'all' ? selectActive : selectDefault}>
                                        <option value="all">All Cost/SLA</option>
                                        <option value="performing">Above BE + Stable/Up</option>
                                        <option value="trending-up">Below BE + Trending Up</option>
                                        <option value="trending-down">Above BE + Trending Down</option>
                                        <option value="critical">Below BE + Flat/Down</option>
                                        <option value="negative-pnl">Negative P&L</option>
                                    </select>
                                </div>
                            </div>
                        );
                    })()}
                </div>

                {/* Table */}
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden min-h-[400px]">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100">
                                    {isSelectionMode && (
                                        <th className="w-10 px-6 py-4">
                                            <input
                                                type="checkbox"
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                checked={paginatedEmployees.length > 0 && paginatedEmployees.every(e => selectedEmployeeIds.has(e.id))}
                                                onChange={() => {
                                                    const allSelected = paginatedEmployees.every(e => selectedEmployeeIds.has(e.id));
                                                    const newSelected = new Set(selectedEmployeeIds);
                                                    paginatedEmployees.forEach(e => {
                                                        if (allSelected) newSelected.delete(e.id);
                                                        else newSelected.add(e.id);
                                                    });
                                                    setSelectedEmployeeIds(newSelected);
                                                }}
                                            />
                                        </th>
                                    )}
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Country</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-3 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-left">Performance</th>
                                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={isSelectionMode ? 9 : 8} className="px-6 py-8 text-center text-gray-500">
                                            Loading directory...
                                        </td>
                                    </tr>
                                ) : paginatedEmployees.length === 0 ? (
                                    <tr>
                                        <td colSpan={isSelectionMode ? 9 : 8} className="px-6 py-8 text-center text-gray-500">
                                            No employees found.
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedEmployees.map((employee) => (
                                        <tr
                                            key={employee.id}
                                            className={`
                                                hover:bg-gray-50/50 transition-colors group cursor-pointer 
                                                ${selectedEmployeeIds.has(employee.id) ? 'bg-blue-50/30' : ''}
                                            `}
                                            onClick={() => {
                                                if (isSelectionMode) toggleRowSelection(employee.id);
                                                else handleActionClick(employee, 'view');
                                            }}
                                        >
                                            {isSelectionMode && (
                                                <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                        checked={selectedEmployeeIds.has(employee.id)}
                                                        onChange={() => toggleRowSelection(employee.id)}
                                                    />
                                                </td>
                                            )}
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-14 w-14 rounded-full bg-gray-100 overflow-hidden border-2 border-gray-200 flex-shrink-0 relative">
                                                        <div className="h-full w-full flex items-center justify-center bg-blue-100 text-blue-600 font-semibold text-base">
                                                            {employee.first_name?.[0]}{employee.last_name?.[0]}
                                                        </div>
                                                        {employee.user_image && (
                                                            <img
                                                                src={employee.user_image}
                                                                alt={employee.first_name}
                                                                className="absolute inset-0 h-full w-full object-cover"
                                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                            />
                                                        )}
                                                    </div>
                                                    <span className="font-medium text-gray-900">
                                                        {employee.first_name} {employee.last_name}
                                                    </span>
                                                    {isNewHire(employee) && (
                                                        <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-200">
                                                            NEW HIRE
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-gray-600 font-medium">
                                                    {employee.role || "Unassigned"}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    {employee.email && (
                                                        <a
                                                            href={`mailto:${employee.email}`}
                                                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all z-10 relative"
                                                            title={employee.email}
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <Mail className="h-4 w-4" />
                                                        </a>
                                                    )}
                                                    {employee.phone && (
                                                        <a
                                                            href={`tel:${employee.phone}`}
                                                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all z-10 relative"
                                                            title={employee.phone}
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <Phone className="h-4 w-4" />
                                                        </a>
                                                    )}
                                                    {(employee.slack_display_name || employee.slack_user_id) && (
                                                        <button
                                                            className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-all cursor-pointer z-10 relative"
                                                            title={employee.slack_display_name ? `Slack: @${employee.slack_display_name}` : `Slack ID: ${employee.slack_user_id}`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                window.location.href = 'slack://open';
                                                            }}
                                                        >
                                                            <Slack className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-sm text-gray-600">
                                                    {employee.country || "—"}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                {(() => {
                                                    const status = employee.employee_status?.toLowerCase() || "unknown";
                                                    const styles: Record<string, string> = {
                                                        active: "bg-emerald-50 text-emerald-700 border-emerald-100",
                                                        pending: "bg-amber-50 text-amber-700 border-amber-100",
                                                        inactive: "bg-gray-50 text-gray-600 border-gray-200",
                                                        terminated: "bg-red-50 text-red-700 border-red-100",
                                                        onboarding: "bg-blue-50 text-blue-700 border-blue-100",
                                                        unknown: "bg-gray-50 text-gray-500 border-gray-200",
                                                    };
                                                    return (
                                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${styles[status] || styles.unknown}`}>
                                                            {employee.employee_status || "Unknown"}
                                                        </span>
                                                    );
                                                })()}
                                            </td>
                                            <td className="px-3 py-3">
                                                {(() => {
                                                    if (employee.role?.toLowerCase() !== 'agent') return <span className="text-xs text-gray-300">—</span>;

                                                    const roster = getRosterData(employee);
                                                    const intra = getIntradayData(employee);
                                                    const tier = getEmployeeTier(employee);

                                                    if (!roster && !intra) return <span className="text-xs text-gray-300">No data</span>;

                                                    // Tier letter + color from roster
                                                    const tierLetter = roster?.tier || null;
                                                    const tierColors: Record<string, string> = {
                                                        S: 'bg-violet-100 text-violet-700 border-violet-200',
                                                        A: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                                                        B: 'bg-gray-100 text-gray-600 border-gray-200',
                                                        C: 'bg-amber-100 text-amber-700 border-amber-200',
                                                        D: 'bg-red-100 text-red-700 border-red-200',
                                                    };

                                                    // Today SLA/hr with break-even check
                                                    const team = intra?.team?.toLowerCase() || roster?.team?.toLowerCase() || "";
                                                    const isMedicare = team.includes("aragon") || team.includes("medicare") || team.includes("whatif") || team.includes("elite") || team.includes("brandon");
                                                    const be = isMedicare ? intradayBreakEven.medicare : intradayBreakEven.aca;

                                                    return (
                                                        <div className="flex items-center gap-1.5 min-w-[200px]">
                                                            {/* 30d Avg SLA/hr */}
                                                            {roster && (
                                                                <div className="text-center px-1">
                                                                    <div className="text-xs font-mono font-bold tabular-nums text-gray-900">{roster.avg_tph.toFixed(2)}</div>
                                                                    <div className="text-[9px] text-gray-400 leading-tight">14d avg</div>
                                                                </div>
                                                            )}

                                                            {/* Today (live) */}
                                                            {intra && (
                                                                <div className="text-center px-1 border-l border-gray-100">
                                                                    <div className={`text-xs font-mono font-bold tabular-nums ${intra.sla_hr >= be ? 'text-emerald-600' : 'text-red-500'}`}>
                                                                        {intra.sla_hr.toFixed(2)}
                                                                    </div>
                                                                    <div className="text-[9px] text-gray-400 leading-tight">today</div>
                                                                </div>
                                                            )}

                                                            {/* Today vs avg trend */}
                                                            {roster && intra && (() => {
                                                                const delta = ((intra.sla_hr - roster.avg_tph) / roster.avg_tph) * 100;
                                                                const abs = Math.abs(delta).toFixed(0);
                                                                if (Math.abs(delta) < 3) return <span className="text-[10px] font-bold text-gray-400">→</span>;
                                                                return delta > 0
                                                                    ? <span className="text-[10px] font-bold text-emerald-600">↑{abs}%</span>
                                                                    : <span className="text-[10px] font-bold text-red-500">↓{abs}%</span>;
                                                            })()}

                                                            {/* QA Score */}
                                                            {roster?.qa_stats && (
                                                                <div className="text-center px-1 border-l border-gray-100">
                                                                    <div className={`text-xs font-mono font-bold tabular-nums ${roster.qa_stats.avg_score >= 80 ? 'text-emerald-600' : roster.qa_stats.avg_score >= 60 ? 'text-amber-600' : 'text-red-500'}`}>
                                                                        {roster.qa_stats.avg_score}%
                                                                    </div>
                                                                    <div className="text-[9px] text-gray-400 leading-tight">QA</div>
                                                                </div>
                                                            )}

                                                        </div>
                                                    );
                                                })()}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleActionClick(employee, 'view');
                                                        }}
                                                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors group relative"
                                                        title="View Profile"
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </button>
                                                    {!readOnly && (
                                                        <>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleActionClick(employee, 'upload');
                                                                }}
                                                                className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors group relative"
                                                                title="Upload Document"
                                                                disabled={isUploading}
                                                            >
                                                                <Upload className="h-4 w-4" />
                                                            </button>
                                                            {employee.employee_status?.toLowerCase() === 'pending' && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleActivateEmployee(employee);
                                                                    }}
                                                                    className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                                                    title="Activate Employee"
                                                                >
                                                                    <CheckCircle2 className="h-4 w-4" />
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleActionClick(employee, 'delete');
                                                                }}
                                                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                                title="Delete Member"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {!loading && filteredEmployees.length > 0 && (
                        <div className="flex items-center justify-between px-6 py-4 bg-gray-50/50 border-t border-gray-100">
                            <div className="text-sm text-gray-500">
                                Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredEmployees.length)}</span> of <span className="font-medium">{filteredEmployees.length}</span> results
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="p-1 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
                                >
                                    <ChevronLeft className="h-5 w-5 text-gray-600" />
                                </button>
                                <span className="text-sm font-medium text-gray-700">
                                    Page {currentPage} of {totalPages}
                                </span>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="p-1 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
                                >
                                    <ChevronRight className="h-5 w-5 text-gray-600" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <EmployeeProfileDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                employee={selectedEmployee}
            />

            <DeleteConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onTerminate={handleTerminateEmployee}
                onRemove={handleRemoveEmployee}
                employeeName={selectedEmployee ? `${selectedEmployee.first_name} ${selectedEmployee.last_name}` : ""}
                isAlreadyTerminated={selectedEmployee?.employee_status?.toLowerCase() === "terminated"}
                isProcessing={isDeleting}
            />

            {/* Bulk Action Modal */}
            <DeleteConfirmationModal
                isOpen={isBulkModalOpen}
                onClose={() => setIsBulkModalOpen(false)}
                onTerminate={handleBulkTerminate}
                onRemove={handleBulkRemove}
                employeeName={`${selectedEmployeeIds.size} selected employee${selectedEmployeeIds.size !== 1 ? "s" : ""}`}
                isAlreadyTerminated={false}
                isProcessing={isDeleting}
            />

            {/* Bulk Name Paste Modal */}
            {!readOnly && isBulkPasteOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-5 border-b border-gray-100">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-orange-100">
                                    <ClipboardPaste className="h-5 w-5 text-orange-600" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Bulk Remove Employees</h3>
                                    <p className="text-xs text-gray-500">
                                        {bulkStep === 'input' ? 'Paste employee names (one per line)' : `${bulkMatches.filter(m => m.match).length} of ${bulkMatches.length} names matched`}
                                    </p>
                                </div>
                            </div>
                            <button onClick={closeBulkPaste} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="p-5">
                            {bulkStep === 'input' ? (
                                <>
                                    <textarea
                                        value={bulkNameInput}
                                        onChange={(e) => setBulkNameInput(e.target.value)}
                                        placeholder={"John Smith\nJane Doe\nBob Johnson\n..."}
                                        className="w-full h-48 p-3 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none font-mono"
                                        autoFocus
                                    />
                                    <p className="text-xs text-gray-400 mt-2">
                                        Enter first and last name, one employee per line. The system will match against the directory.
                                    </p>
                                    <div className="flex justify-end gap-2 mt-4">
                                        <button
                                            onClick={closeBulkPaste}
                                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={parseBulkNames}
                                            disabled={!bulkNameInput.trim()}
                                            className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Find Matches
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="max-h-64 overflow-y-auto space-y-1.5">
                                        {bulkMatches.map((item, idx) => (
                                            <div
                                                key={idx}
                                                className={`flex items-center gap-3 p-2.5 rounded-lg border text-sm ${
                                                    item.match
                                                        ? bulkSelectedIds.has(item.match.id)
                                                            ? 'bg-orange-50 border-orange-200'
                                                            : 'bg-gray-50 border-gray-200'
                                                        : 'bg-red-50/50 border-red-200'
                                                }`}
                                            >
                                                {item.match ? (
                                                    <>
                                                        <input
                                                            type="checkbox"
                                                            checked={bulkSelectedIds.has(item.match.id)}
                                                            onChange={() => {
                                                                const next = new Set(bulkSelectedIds);
                                                                if (next.has(item.match!.id)) next.delete(item.match!.id);
                                                                else next.add(item.match!.id);
                                                                setBulkSelectedIds(next);
                                                            }}
                                                            className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                                                        />
                                                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                                                        <div className="flex-1 min-w-0">
                                                            <span className="font-medium text-gray-900">{item.match.first_name} {item.match.last_name}</span>
                                                            <span className="text-gray-400 ml-2 text-xs">{item.match.role || 'No role'}</span>
                                                        </div>
                                                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                                                            item.match.employee_status?.toLowerCase() === 'terminated'
                                                                ? 'bg-red-100 text-red-700'
                                                                : item.match.employee_status?.toLowerCase() === 'pending'
                                                                ? 'bg-amber-100 text-amber-700'
                                                                : 'bg-emerald-100 text-emerald-700'
                                                        }`}>
                                                            {item.match.employee_status || 'Unknown'}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="w-5" />
                                                        <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                                                        <span className="text-gray-500">{item.name}</span>
                                                        <span className="ml-auto text-xs text-red-500 font-medium">No match</span>
                                                    </>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {bulkMatches.some(m => !m.match) && (
                                        <div className="mt-3 flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                                            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                                            <span className="text-xs text-amber-700">
                                                {bulkMatches.filter(m => !m.match).length} name(s) could not be matched. Check spelling or try "First Last" format.
                                            </span>
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                                        <button
                                            onClick={() => setBulkStep('input')}
                                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                                        >
                                            Back
                                        </button>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleBulkPasteTerminate}
                                                disabled={bulkSelectedIds.size === 0 || bulkProcessing}
                                                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-100 rounded-lg hover:bg-amber-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {bulkProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserMinus className="h-3.5 w-3.5" />}
                                                Terminate ({bulkSelectedIds.size})
                                            </button>
                                            <button
                                                onClick={handleBulkPasteRemove}
                                                disabled={bulkSelectedIds.size === 0 || bulkProcessing}
                                                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {bulkProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                                Remove ({bulkSelectedIds.size})
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
