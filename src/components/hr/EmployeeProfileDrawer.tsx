"use client";

import { X, Mail, Slack, Calendar, User, Upload, FileText, Trash2, Download, Phone, MapPin, DollarSign, FileCheck, Briefcase, AlertTriangle, ChevronDown, ChevronUp, Clock, Coffee, ExternalLink, Eye, Activity, ArrowLeft, Ban, Zap, Trophy, Medal, ShieldAlert, ShieldCheck } from "lucide-react";
import { parseShiftDuration, calculateWeeklyHours, isFullTime, normalizeShiftTime, WEEKDAYS } from "@/lib/hr-utils";
import { heatmapClassLight, detectCampaignType } from "@/utils/dialedin-heatmap";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase-client";

interface WriteUp {
    id: string;
    type: string;
    subject: string;
    body: string;
    sent_at: string;
    sent_by: string;
    status: string;
    message_id: string | null;
}

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
    docuseal_submission_id: string | null;
    hourly_wage: number | null;
    training_start_date: string | null;
    current_campaigns?: string[] | null;
}

interface EmployeeProfileDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    employee: Employee | null;
}

// Campaign → Manager mapping
const CAMPAIGN_MANAGERS: Record<string, string> = {
    'Medicare WhatIF': 'Aya Al-Edhari',
    'ACA': 'Melak Baban, Sonia Baldeo, Tabark L-Uwdi',
    'Medicare': 'Brad Sicat, David Nichols, Lucas Varela',
    'Home Care Michigan': 'Josh Prodan',
    'Hospital': 'Brad Sicat',
    'Pitch Meals': 'Brad Sicat',
};

function getManagerForCampaigns(campaigns: string[] | null | undefined): string | null {
    if (!campaigns || campaigns.length === 0) return null;
    const managers = new Set<string>();
    for (const c of campaigns) {
        const m = CAMPAIGN_MANAGERS[c];
        if (m) managers.add(m);
    }
    if (managers.size === 0) return null;
    return Array.from(managers).join('; ');
}

export default function EmployeeProfileDrawer({ isOpen, onClose, employee }: EmployeeProfileDrawerProps) {
    const drawerRef = useRef<HTMLDivElement>(null);
    const [documents, setDocuments] = useState<Employee['documents']>([]);
    const [uploading, setUploading] = useState(false);
    const [writeUps, setWriteUps] = useState<WriteUp[]>([]);
    const [writeUpsExpanded, setWriteUpsExpanded] = useState(false);
    const [expandedWriteUp, setExpandedWriteUp] = useState<string | null>(null);
    const [schedule, setSchedule] = useState<Record<string, any> | null>(null);
    const [breakSchedule, setBreakSchedule] = useState<Record<string, any> | null>(null);
    const [contractStatus, setContractStatus] = useState<string | null>(null);
    const [contractSignedAt, setContractSignedAt] = useState<string | null>(null);
    const [signedContractUrl, setSignedContractUrl] = useState<string | null>(null);
    const [signedContractAuditUrl, setSignedContractAuditUrl] = useState<string | null>(null);
    const [showImageLightbox, setShowImageLightbox] = useState(false);
    const [attendanceEvents, setAttendanceEvents] = useState<{ eventType: string; date: string; minutes: number | null; reason: string | null }[]>([]);
    const [attendanceExpanded, setAttendanceExpanded] = useState(false);
    const [perfStats, setPerfStats] = useState<any>(null);
    const [perfLoading, setPerfLoading] = useState(false);
    const [qaStats, setQaStats] = useState<{ avg_score: number; total_calls: number; auto_fail_count: number; auto_fail_rate: number; pass_rate: number; risk_breakdown: { high: number; medium: number; low: number } } | null>(null);
    const [qaManual, setQaManual] = useState<{ total: number; violations: { violation: string; count: number }[]; recent: { date: string; violation: string; reviewer: string | null }[]; trend: { month: string; count: number }[]; matchedName: string; earliest: string; latest: string } | null>(null);
    const [showTerminateConfirm, setShowTerminateConfirm] = useState(false);
    const [isTerminating, setIsTerminating] = useState(false);
    const [terminateError, setTerminateError] = useState<string | null>(null);

    const fetchQAManualStats = async (firstName: string, lastName: string) => {
        const name = `${firstName} ${lastName}`.trim();
        if (!name || name.length < 2) { setQaManual(null); return; }
        try {
            const res = await fetch(`/api/hr/qa-manual-stats?name=${encodeURIComponent(name)}`);
            if (res.ok) {
                const data = await res.json();
                if (data.total > 0) {
                    setQaManual(data);
                } else {
                    setQaManual(null);
                }
            } else {
                setQaManual(null);
            }
        } catch {
            setQaManual(null);
        }
    };

    useEffect(() => {
        setShowImageLightbox(false);
        if (employee) {
            setDocuments(employee.documents || []);
            setContractStatus(employee.contract_status);
            setContractSignedAt(employee.contract_signed_at);
            setSignedContractUrl(employee.signed_contract_url);
            setSignedContractAuditUrl(employee.signed_contract_audit_url);
            fetchFreshDocuments(employee.id);
            fetchWriteUps(employee.id);
            fetchSchedule(employee.first_name, employee.last_name);
            fetchAttendanceEvents(employee.first_name, employee.last_name);
            if (employee.role?.toLowerCase() === 'agent') {
                fetchPerformanceStats(employee.first_name, employee.last_name);
                fetchQAStats(employee.first_name, employee.last_name);
                fetchQAManualStats(employee.first_name, employee.last_name);
            } else {
                setPerfStats(null);
                setQaStats(null);
                setQaManual(null);
            }
        }
    }, [employee, isOpen]);

    // Auto-poll DocuSeal for pending contracts as a failsafe against webhook failures
    useEffect(() => {
        if (!employee) return;
        const status = employee.contract_status;
        const hasSubmission = employee.docuseal_submission_id && employee.docuseal_submission_id.trim() !== '';
        const isPending = status === 'sent' || status === 'opened';

        if (!hasSubmission || !isPending) return;

        const pollContractStatus = async () => {
            try {
                const res = await fetch('/api/docuseal/check-status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ employeeId: employee.id }),
                });
                if (!res.ok) return;
                const data = await res.json();
                if (data.updated && data.status) {
                    setContractStatus(data.status);
                    if (data.status === 'signed') {
                        setContractSignedAt(new Date().toISOString());
                        if (data.signedDocumentUrl) {
                            setSignedContractUrl(data.signedDocumentUrl);
                        }
                    }
                }
            } catch (err) {
                console.error('[Profile] Contract status poll failed:', err);
            }
        };

        pollContractStatus();
    }, [employee]);

    const fetchWriteUps = async (employeeId: string) => {
        const { data, error } = await supabase
            .from('employee_write_ups')
            .select('id, type, subject, body, sent_at, sent_by, status, message_id')
            .eq('employee_id', employeeId)
            .order('sent_at', { ascending: false });

        if (data && !error) {
            setWriteUps(data);
        } else {
            setWriteUps([]);
        }
    };

    const fetchSchedule = async (firstName: string, lastName: string) => {
        const firstLower = (firstName || '').trim().toLowerCase();
        const lastLower = (lastName || '').trim().toLowerCase();
        const dirFullName = `${firstLower} ${lastLower}`.trim();
        if (!firstLower) {
            setSchedule(null);
            setBreakSchedule(null);
            return;
        }

        // Paginate Agent Schedule (can exceed 1000 rows due to sync duplicates)
        let allSchedules: any[] = [];
        let from = 0;
        const PAGE_SIZE = 1000;
        while (true) {
            const { data: page } = await supabase.from('Agent Schedule').select('*').range(from, from + PAGE_SIZE - 1);
            if (!page || page.length === 0) break;
            allSchedules = allSchedules.concat(page);
            if (page.length < PAGE_SIZE) break;
            from += PAGE_SIZE;
        }

        const { data: breakData } = await supabase.from('Agent Break Schedule').select('*');

        // Flexible name matching: handles punctuation variants, hyphens, middle names,
        // multi-word first names, nicknames, empty last names, and full-name-in-first-column
        const strip = (s: string) => s.replace(/[''`.\-]/g, '').trim().toLowerCase();
        const collapse = (s: string) => strip(s).replace(/\s+/g, ''); // "St Louis" → "stlouis"
        const nameMatches = (rowFirst: string, rowLast: string) => {
            const rf = (rowFirst || '').trim().toLowerCase();
            const rl = (rowLast || '').trim().toLowerCase();
            if (!rf && !rl) return false;

            // Full-name-in-first-column: schedule has "Portia Washington" in First Name, empty Last Name
            // Compare concatenated schedule name against directory full name
            const schedFullName = `${rf} ${rl}`.trim();
            if (schedFullName === dirFullName) return true;
            if (collapse(schedFullName) === collapse(dirFullName)) return true;
            // Schedule first name contains the full name (or vice versa)
            if (rf.includes(' ') && !rl && lastLower) {
                // e.g. rf="portia washington", rl="" — check against "portia"+"washington"
                const rfParts = rf.split(/\s+/);
                if (rfParts.length >= 2) {
                    const rfFirst = rfParts[0];
                    const rfRest = rfParts.slice(1).join(' ');
                    const dirFirstWord = firstLower.split(/\s+/)[0];
                    if ((rfFirst === dirFirstWord || rfFirst === firstLower) &&
                        (rfRest === lastLower || rfRest.includes(lastLower) || lastLower.includes(rfRest) ||
                         strip(rfRest) === strip(lastName) || collapse(rfRest) === collapse(lastName))) {
                        return true;
                    }
                }
            }

            // First name matching: exact, stripped, first-word, or prefix (Zach→Zachary)
            const rfStrip = strip(rowFirst || '');
            const dirFirstStrip = strip(firstName);
            const rfFirstWord = rf.split(/\s+/)[0];
            const dirFirstWord = firstLower.split(/\s+/)[0];
            const firstMatch =
                rf === firstLower
                || rfStrip === dirFirstStrip
                || rf === dirFirstWord
                || rfFirstWord === firstLower
                || rfFirstWord === dirFirstWord
                || strip(rfFirstWord) === strip(dirFirstWord)
                // Prefix match: "zach" matches "zachary" (min 3 chars)
                || (rfFirstWord.length >= 3 && dirFirstWord.startsWith(rfFirstWord))
                || (dirFirstWord.length >= 3 && rfFirstWord.startsWith(dirFirstWord));
            if (!firstMatch) return false;

            // Empty last name in schedule OR directory: match on first name alone
            if (!rl || !lastLower) return true;

            // Last name matching: exact, contains, stripped, collapsed, or hyphen-part
            if (rl === lastLower || lastLower.includes(rl) || rl.includes(lastLower)) return true;
            if (strip(rl) === strip(lastName)) return true;
            // Collapsed comparison: "St.Louis" vs "St Louis" → both become "stlouis"
            if (collapse(rl) === collapse(lastName)) return true;
            // Hyphenated last name: match either part
            const dirParts = lastName.split(/[\s-]+/).map(p => p.trim().toLowerCase()).filter(p => p.length > 1);
            const schedParts = (rowLast || '').split(/[\s-]+/).map(p => p.trim().toLowerCase()).filter(p => p.length > 1);
            if (dirParts.some(dp => schedParts.some(sp => dp === sp))) return true;
            // 1-char tolerance: Shelly/Shelley, Musfeq/Musfek
            const srl = strip(rl), sdl = strip(lastName);
            if (srl.length > 3 && sdl.length > 3 && Math.abs(srl.length - sdl.length) <= 1) {
                let diff = 0;
                const longer = srl.length >= sdl.length ? srl : sdl;
                const shorter = srl.length >= sdl.length ? sdl : srl;
                let si = 0;
                for (let li = 0; li < longer.length && diff <= 1; li++) {
                    if (shorter[si] === longer[li]) si++;
                    else diff++;
                }
                if (diff <= 1 && si >= shorter.length - 1) return true;
            }
            return false;
        };

        const matchSched = allSchedules.find(row =>
            nameMatches(row['First Name'], row['Last Name'])
        );

        const matchBreak = (breakData || []).find(row =>
            nameMatches(row['First Name'], row['Last Name'])
        );

        setSchedule(matchSched || null);
        setBreakSchedule(matchBreak || null);
    };

    const fetchAttendanceEvents = async (firstName: string, lastName: string) => {
        const fullName = `${firstName} ${lastName}`.trim().toLowerCase();
        if (!fullName) { setAttendanceEvents([]); return; }

        const { data, error } = await supabase
            .from('Attendance Events')
            .select('*')
            .order('id', { ascending: false });

        if (error || !data) { setAttendanceEvents([]); return; }

        const matched = data.filter((row: any) => {
            const rowName = (row['Agent Name'] || '').trim().toLowerCase();
            return rowName === fullName || rowName.includes(fullName) || fullName.includes(rowName);
        });

        setAttendanceEvents(matched.map((row: any) => ({
            eventType: (row['Event Type'] || '').toLowerCase(),
            date: row['Date'] || '',
            minutes: row['Minutes'] ? parseInt(row['Minutes'], 10) : null,
            reason: row['Reason'] || null,
        })));
    };

    const fetchPerformanceStats = async (firstName: string, lastName: string) => {
        const name = `${firstName} ${lastName}`.trim();
        if (!name || name.length < 2) { setPerfStats(null); return; }
        setPerfLoading(true);
        try {
            const res = await fetch(`/api/dialedin/agent-stats?name=${encodeURIComponent(name)}`);
            if (res.ok) {
                const data = await res.json();
                setPerfStats(data.latest ? data : null);
            } else {
                setPerfStats(null);
            }
        } catch {
            setPerfStats(null);
        } finally {
            setPerfLoading(false);
        }
    };

    const fetchQAStats = async (firstName: string, lastName: string) => {
        const name = `${firstName} ${lastName}`.trim();
        if (!name || name.length < 2) { setQaStats(null); return; }
        try {
            const res = await fetch(`/api/dialedin/qa-stats?days=90&agent=${encodeURIComponent(name)}`);
            if (res.ok) {
                const json = await res.json();
                const data = json.data || {};
                const match = Object.values(data)[0] as typeof qaStats;
                setQaStats(match || null);
            } else {
                setQaStats(null);
            }
        } catch {
            setQaStats(null);
        }
    };

    const fetchFreshDocuments = async (id: string) => {
        const { data, error } = await supabase
            .from('employee_directory')
            .select('documents')
            .eq('id', id)
            .single();

        if (data && !error) {
            setDocuments(data.documents || []);
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files || event.target.files.length === 0 || !employee) return;

        const file = event.target.files[0];
        setUploading(true);

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${employee.id}/${Math.random().toString(36).substring(2)}.${fileExt}`;
            const filePath = `${fileName}`;

            // 1. Upload to Storage
            const { error: uploadError } = await supabase.storage
                .from('employee_documents')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // 2. Update Database
            const newDoc = {
                name: file.name,
                path: filePath,
                type: file.type,
                size: file.size,
                uploaded_at: new Date().toISOString()
            };

            const updatedDocs = [...(documents || []), newDoc];

            const { error: dbError } = await supabase
                .from('employee_directory')
                .update({ documents: updatedDocs })
                .eq('id', employee.id);

            if (dbError) throw dbError;

            setDocuments(updatedDocs);
        } catch (error) {
            console.error('Error uploading document:', error);
            alert('Failed to upload document. Please try again.');
        } finally {
            setUploading(false);
            // Reset input
            event.target.value = '';
        }
    };

    const handleDeleteDocument = async (docToDelete: NonNullable<Employee['documents']>[number]) => {
        if (!employee || !confirm(`Are you sure you want to delete "${docToDelete.name}"?`)) return;

        try {
            // 1. Delete from Storage
            const { error: storageError } = await supabase.storage
                .from('employee_documents')
                .remove([docToDelete.path]);

            if (storageError) {
                console.error('Storage delete error:', storageError);
                // Continue to remove from DB even if storage fails (orphan cleanup)
            }

            // 2. Update Database
            const updatedDocs = (documents || []).filter(d => d.path !== docToDelete.path);

            const { error: dbError } = await supabase
                .from('employee_directory')
                .update({ documents: updatedDocs })
                .eq('id', employee.id);

            if (dbError) throw dbError;

            setDocuments(updatedDocs);
        } catch (error) {
            console.error('Error deleting document:', error);
            alert('Failed to delete document.');
        }
    };

    const handleViewDocument = async (doc: NonNullable<Employee['documents']>[number]) => {
        try {
            const { data, error } = await supabase.storage
                .from('employee_documents')
                .download(doc.path);

            if (error) throw error;

            const url = URL.createObjectURL(data);
            window.open(url, '_blank');
        } catch (error) {
            console.error('Error viewing document:', error);
            alert('Failed to open document.');
        }
    };

    const handleDownload = async (doc: NonNullable<Employee['documents']>[number]) => {
        try {
            const { data, error } = await supabase.storage
                .from('employee_documents')
                .download(doc.path);

            if (error) throw error;

            const url = URL.createObjectURL(data);
            const a = document.createElement('a');
            a.href = url;
            a.download = doc.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error downloading:', error);
            alert('Failed to download document.');
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (drawerRef.current && !drawerRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
            document.body.style.overflow = "hidden"; // Prevent scrolling
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.body.style.overflow = "unset";
        };
    }, [isOpen, onClose]);

    if (!isOpen || !employee) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm transition-opacity duration-300">
            <div
                ref={drawerRef}
                className="w-full max-w-md h-full bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300"
            >
                {/* Header */}
                <div className="relative h-48 bg-gradient-to-br from-[#7c3aed] to-[#9333ea]">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/30" />
                    <div className="absolute inset-0 flex items-center justify-center pb-6">
                        <img
                            src="/images/pp-logo-black.png"
                            alt="Pitch Perfect Solutions"
                            className="h-12 object-contain brightness-0 invert opacity-90"
                        />
                    </div>
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/40 rounded-full text-white transition-colors"
                    >
                        <X size={20} />
                    </button>

                    <div className="absolute -bottom-12 left-8">
                        <div
                            className={`h-24 w-24 rounded-2xl bg-white p-1 shadow-lg ${employee.user_image ? 'cursor-pointer hover:ring-2 hover:ring-indigo-400 transition-all' : ''}`}
                            onClick={(e) => { e.stopPropagation(); if (employee.user_image) setShowImageLightbox(true); }}
                        >
                            <div className="h-full w-full rounded-xl bg-gray-200 overflow-hidden relative">
                                <div className="h-full w-full flex items-center justify-center bg-blue-100 text-blue-600 font-bold text-2xl">
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
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="pt-16 px-8 pb-8 space-y-8">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">
                            {employee.first_name} {employee.last_name}
                        </h2>
                        <p className="text-gray-500 font-medium">
                            {employee.role || "No Role Assigned"}
                        </p>
                    </div>

                    {/* Status Badge */}
                    {employee.employee_status && (
                        <div>
                            {(() => {
                                const status = employee.employee_status.toLowerCase();
                                const styles: Record<string, string> = {
                                    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
                                    pending: "bg-amber-50 text-amber-700 border-amber-200",
                                    inactive: "bg-gray-100 text-gray-600 border-gray-200",
                                    terminated: "bg-red-50 text-red-700 border-red-200",
                                    onboarding: "bg-blue-50 text-blue-700 border-blue-200",
                                };
                                return (
                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${styles[status] || styles.active}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${status === 'active' ? 'bg-emerald-500' : status === 'pending' ? 'bg-amber-500' : status === 'terminated' ? 'bg-red-500' : 'bg-gray-400'}`} />
                                        {employee.employee_status}
                                    </span>
                                );
                            })()}
                        </div>
                    )}

                    {/* Campaign Badges + Manager */}
                    {employee.current_campaigns && employee.current_campaigns.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex flex-wrap gap-1.5">
                                {employee.current_campaigns.map(campaign => {
                                    const styles: Record<string, string> = {
                                        'Medicare': 'bg-blue-50 text-blue-700 border-blue-200',
                                        'ACA': 'bg-violet-50 text-violet-700 border-violet-200',
                                        'Medicare WhatIF': 'bg-teal-50 text-teal-700 border-teal-200',
                                        'Hospital': 'bg-rose-50 text-rose-700 border-rose-200',
                                        'Pitch Meals': 'bg-orange-50 text-orange-700 border-orange-200',
                                        'Home Care Michigan': 'bg-lime-50 text-lime-700 border-lime-200',
                                    };
                                    return (
                                        <span
                                            key={campaign}
                                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border ${styles[campaign] || 'bg-gray-50 text-gray-600 border-gray-200'}`}
                                        >
                                            <Briefcase size={12} />
                                            {campaign}
                                        </span>
                                    );
                                })}
                            </div>
                            {(() => {
                                const managerName = getManagerForCampaigns(employee.current_campaigns);
                                if (!managerName) return null;
                                return (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border bg-indigo-50 text-indigo-700 border-indigo-200">
                                        <User size={12} />
                                        Manager: {managerName}
                                    </span>
                                );
                            })()}
                        </div>
                    )}

                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Contact Information</h3>

                        <div className="space-y-3">
                            {employee.email && (
                                <div className="flex items-center gap-3 text-gray-600">
                                    <div className="p-2 bg-gray-100 rounded-lg">
                                        <Mail size={18} />
                                    </div>
                                    <span className="text-sm">{employee.email}</span>
                                </div>
                            )}

                            {employee.phone && (
                                <div className="flex items-center gap-3 text-gray-600">
                                    <div className="p-2 bg-gray-100 rounded-lg">
                                        <Phone size={18} />
                                    </div>
                                    <span className="text-sm">{employee.phone}</span>
                                </div>
                            )}

                            {(employee.slack_display_name || employee.slack_user_id) && (
                                <div className="flex items-center gap-3 text-gray-600">
                                    <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                                        <Slack size={18} />
                                    </div>
                                    <span className="text-sm">
                                        {employee.slack_display_name ? `@${employee.slack_display_name}` : employee.slack_user_id}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Employee Details</h3>

                        {employee.country && (
                            <div className="flex items-center gap-3 text-gray-600">
                                <div className="p-2 bg-gray-100 rounded-lg">
                                    <MapPin size={18} />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Country</p>
                                    <span className="text-sm font-medium">{employee.country}</span>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-3 text-gray-600">
                            <div className="p-2 bg-gray-100 rounded-lg">
                                <Calendar size={18} />
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Hire Date</p>
                                <span className="text-sm font-medium">
                                    {employee.hired_at
                                        ? new Date(employee.hired_at).toLocaleDateString(undefined, {
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric'
                                        })
                                        : "Not recorded"}
                                </span>
                            </div>
                        </div>

                        {employee.hourly_wage != null && employee.role?.toLowerCase() === 'agent' && (
                            <div className="flex items-center gap-3 text-gray-600">
                                <div className="p-2 bg-gray-100 rounded-lg">
                                    <DollarSign size={18} />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Hourly Wage</p>
                                    <span className="text-sm font-medium">${Number(employee.hourly_wage).toFixed(2)}/hr</span>
                                </div>
                            </div>
                        )}

                        {contractStatus && (
                            <div className="flex items-start gap-3 text-gray-600">
                                <div className="p-2 bg-gray-100 rounded-lg mt-0.5">
                                    <FileCheck size={18} />
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs text-gray-500">Contract</p>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-sm font-medium capitalize ${contractStatus === 'signed' ? 'text-emerald-600' : contractStatus === 'declined' ? 'text-red-600' : ''}`}>
                                            {contractStatus.replace(/_/g, ' ')}
                                        </span>
                                        {contractSignedAt && (
                                            <span className="text-[10px] text-gray-400">
                                                {new Date(contractSignedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </span>
                                        )}
                                    </div>
                                    {contractStatus === 'signed' && (signedContractUrl || signedContractAuditUrl) && (
                                        <div className="flex items-center gap-3 mt-1.5">
                                            {signedContractUrl && (
                                                <a
                                                    href={signedContractUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                                                >
                                                    <ExternalLink size={12} />
                                                    View Contract
                                                </a>
                                            )}
                                            {signedContractAuditUrl && (
                                                <a
                                                    href={signedContractAuditUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 font-medium"
                                                >
                                                    <ExternalLink size={12} />
                                                    Audit Log
                                                </a>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {employee.training_start_date && (
                            <div className="flex items-center gap-3 text-gray-600">
                                <div className="p-2 bg-gray-100 rounded-lg">
                                    <Briefcase size={18} />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Training Start</p>
                                    <span className="text-sm font-medium">
                                        {new Date(employee.training_start_date + 'T00:00:00').toLocaleDateString(undefined, {
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric'
                                        })}
                                    </span>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-3 text-gray-600">
                            <div className="p-2 bg-gray-100 rounded-lg">
                                <User size={18} />
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Employee ID</p>
                                <span className="text-sm font-mono text-gray-400 text-[10px] break-all">
                                    {employee.id}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Performance Stats (Agents only) */}
                    {employee.role?.toLowerCase() === 'agent' && (
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                <Zap size={14} className="text-amber-500" />
                                Performance Stats
                                {perfStats?.latest?.report_date && (
                                    <span className="text-[10px] text-gray-400 font-normal normal-case ml-auto">
                                        {new Date(perfStats.latest.report_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                )}
                            </h3>

                            {perfLoading && (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-3 gap-2">
                                        {[1, 2, 3].map(i => (
                                            <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
                                        ))}
                                    </div>
                                    <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
                                </div>
                            )}

                            {!perfLoading && !perfStats && (
                                <p className="text-sm text-gray-400 italic">No DialedIn data found for this agent.</p>
                            )}

                            {!perfLoading && perfStats?.latest && (() => {
                                const l = perfStats.latest;
                                const avg = perfStats.averages;
                                const tot = perfStats.totals;

                                const logged = Number(l.logged_in_time_min) || 0;
                                const pauseMin = Number(l.pause_time_min) || 0;
                                const wrapMin = Number(l.wrap_time_min) || 0;
                                const active = (Number(l.talk_time_min) || 0) + (Number(l.wait_time_min) || 0) + wrapMin;
                                const util = logged > 0 ? (active / logged) * 100 : 0;
                                const grossHrs = Number(l.hours_worked) || 0;
                                const paidHrsRaw = Math.max((logged - pauseMin - wrapMin + 30) / 60, 0);
                                const paidHrs = grossHrs > 0 ? Math.min(paidHrsRaw, grossHrs) : paidHrsRaw;

                                const RankBadge = ({ rank }: { rank: number | null }) => {
                                    if (!rank) return null;
                                    if (rank <= 3) return (
                                        <span className="inline-flex items-center gap-0.5">
                                            {rank === 1 ? <Trophy size={10} className="text-amber-500" /> : <Medal size={10} className={rank === 2 ? "text-gray-400" : "text-amber-600"} />}
                                            <span className="text-[9px] font-bold text-amber-600">#{rank}</span>
                                        </span>
                                    );
                                    return <span className="text-[9px] text-gray-400 font-mono">#{rank}</span>;
                                };

                                return (
                                    <>
                                        {/* Primary Metrics - 3 cards */}
                                        <div className="grid grid-cols-3 gap-2">
                                            <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-100">
                                                {(() => {
                                                    const campaign = detectCampaignType(employee?.current_campaigns);
                                                    const displayTph = l.adjusted_tph != null ? Number(l.adjusted_tph) : Number(l.tph);
                                                    const isAdjusted = l.adjusted_tph != null;
                                                    return (
                                                        <>
                                                            <div className={`text-xl font-bold font-mono ${heatmapClassLight(displayTph, 'tph', campaign)}`}>
                                                                {displayTph.toFixed(2)}{!isAdjusted && <span className="text-[9px] text-gray-400 ml-0.5">*</span>}
                                                            </div>
                                                        </>
                                                    );
                                                })()}
                                                <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mt-0.5">SLA/hr</div>
                                                <RankBadge rank={l.tph_rank} />
                                            </div>
                                            <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-100">
                                                <div className="text-xl font-bold font-mono text-gray-900">
                                                    {l.transfers}
                                                </div>
                                                <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mt-0.5">SLA</div>
                                            </div>
                                            <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-100">
                                                <div className={`text-xl font-bold font-mono ${heatmapClassLight(l.conversion_rate, 'conversion')}`}>
                                                    {Number(l.conversion_rate).toFixed(1)}%
                                                </div>
                                                <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mt-0.5">Conv %</div>
                                                <RankBadge rank={l.conversion_rank} />
                                            </div>
                                        </div>

                                        {/* Secondary Metrics Grid */}
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-1">
                                            {[
                                                { label: 'Dials', value: Number(l.dials).toLocaleString() },
                                                { label: 'Connects', value: Number(l.connects).toLocaleString() },
                                                { label: 'Connect %', value: `${Number(l.connect_rate).toFixed(1)}%`, color: heatmapClassLight(l.connect_rate, 'connect') },
                                                { label: 'Gross Hrs', value: grossHrs.toFixed(1) },
                                                { label: 'Paid Hrs', value: paidHrs.toFixed(1), color: 'text-indigo-700' },
                                                { label: 'Talk Time', value: `${Number(l.talk_time_min).toFixed(0)}m` },
                                                { label: 'Utilization', value: `${util.toFixed(0)}%`, color: heatmapClassLight(util, 'utilization') },
                                            ].map(({ label, value, color }) => (
                                                <div key={label} className="flex items-center justify-between py-0.5">
                                                    <span className="text-[11px] text-gray-500">{label}</span>
                                                    <span className={`text-[12px] font-mono font-semibold ${color || 'text-gray-800'}`}>{value}</span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* 14-Day Summary */}
                                        {avg && tot && tot.days_worked > 1 && (() => {
                                            const days = perfStats.recentDays || [];
                                            const totalGrossHrs = Number(tot.hours_worked) || 0;
                                            const totalPaidHrs = days.reduce((sum: number, d: Record<string, unknown>) => {
                                                const dLogged = Number(d.logged_in_time_min) || 0;
                                                const dPause = Number(d.pause_time_min) || 0;
                                                const dWrap = Number(d.wrap_time_min) || 0;
                                                const dGross = Number(d.hours_worked) || 0;
                                                const raw = Math.max((dLogged - dPause - dWrap + 30) / 60, 0);
                                                return sum + Math.min(raw, dGross);
                                            }, 0);
                                            const avgPaidHrs = days.length > 0 ? totalPaidHrs / days.length : 0;
                                            return (
                                                <div className="bg-indigo-50/50 border border-indigo-100 rounded-lg px-3 py-2">
                                                    <div className="text-[10px] text-indigo-600 uppercase tracking-wider font-semibold mb-1">
                                                        {tot.days_worked}-Day Summary
                                                    </div>
                                                    <div className="flex items-center gap-3 text-[11px] text-gray-700">
                                                        <span>Avg SLA/hr: <span className="font-mono font-semibold">{avg.adjusted_tph != null ? avg.adjusted_tph : avg.tph}</span></span>
                                                        <span className="text-gray-300">|</span>
                                                        <span>Avg SLA: <span className="font-mono font-semibold">{avg.transfers}</span></span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-[11px] text-gray-600 mt-0.5">
                                                        <span>Total: <span className="font-mono font-semibold">{tot.transfers}</span> SLA</span>
                                                        <span className="text-gray-300">|</span>
                                                        <span>Gross: <span className="font-mono font-semibold">{totalGrossHrs.toFixed(1)}</span> hrs</span>
                                                        <span className="text-gray-300">|</span>
                                                        <span>Paid: <span className="font-mono font-semibold text-indigo-700">{totalPaidHrs.toFixed(1)}</span> hrs</span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-[10px] text-gray-500 mt-0.5">
                                                        <span>Avg Gross: <span className="font-mono">{(totalGrossHrs / tot.days_worked).toFixed(1)}</span>h/day</span>
                                                        <span className="text-gray-300">|</span>
                                                        <span>Avg Paid: <span className="font-mono text-indigo-600">{avgPaidHrs.toFixed(1)}</span>h/day</span>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </>
                                );
                            })()}
                        </div>
                    )}

                    {/* QA Compliance (Agents only) */}
                    {employee.role?.toLowerCase() === 'agent' && qaStats && (
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                {qaStats.auto_fail_count > 0 ? (
                                    <ShieldAlert size={14} className="text-red-500" />
                                ) : (
                                    <ShieldCheck size={14} className="text-emerald-500" />
                                )}
                                QA Compliance
                                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium normal-case">
                                    {qaStats.total_calls} calls
                                </span>
                            </h3>

                            <div className="grid grid-cols-3 gap-2">
                                <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-100">
                                    <div className={`text-xl font-bold font-mono ${
                                        qaStats.avg_score >= 70 ? 'text-emerald-600' : qaStats.avg_score >= 40 ? 'text-amber-600' : 'text-red-600'
                                    }`}>
                                        {qaStats.avg_score}
                                    </div>
                                    <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mt-0.5">Avg Score</div>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-100">
                                    <div className={`text-xl font-bold font-mono ${
                                        qaStats.pass_rate >= 80 ? 'text-emerald-600' : qaStats.pass_rate >= 50 ? 'text-amber-600' : 'text-red-600'
                                    }`}>
                                        {qaStats.pass_rate}%
                                    </div>
                                    <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mt-0.5">Pass Rate</div>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-100">
                                    <div className={`text-xl font-bold font-mono ${
                                        qaStats.auto_fail_count > 0 ? 'text-red-600' : 'text-emerald-600'
                                    }`}>
                                        {qaStats.auto_fail_count}
                                    </div>
                                    <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mt-0.5">Auto-Fails</div>
                                </div>
                            </div>

                            {/* Risk Breakdown */}
                            <div className="flex items-center gap-2 px-1">
                                <span className="text-xs text-gray-500 font-medium">Risk:</span>
                                <div className="flex gap-1.5">
                                    {qaStats.risk_breakdown.high > 0 && (
                                        <span className="text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full">
                                            {qaStats.risk_breakdown.high} High
                                        </span>
                                    )}
                                    {qaStats.risk_breakdown.medium > 0 && (
                                        <span className="text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                                            {qaStats.risk_breakdown.medium} Medium
                                        </span>
                                    )}
                                    {qaStats.risk_breakdown.low > 0 && (
                                        <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                                            {qaStats.risk_breakdown.low} Low
                                        </span>
                                    )}
                                    {qaStats.risk_breakdown.high === 0 && qaStats.risk_breakdown.medium === 0 && qaStats.risk_breakdown.low === 0 && (
                                        <span className="text-xs text-gray-400 italic">No risk data</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Manual QA Audit (Agents only) */}
                    {employee.role?.toLowerCase() === 'agent' && qaManual && qaManual.total > 0 && (
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                <Eye size={14} className="text-orange-500" />
                                QA Audit
                                <span className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full font-medium normal-case">
                                    {qaManual.total} reviews
                                </span>
                            </h3>

                            {/* Top violations */}
                            <div className="space-y-1">
                                {qaManual.violations.slice(0, 5).map((v) => (
                                    <div key={v.violation} className="flex items-center justify-between px-1">
                                        <span className="text-[11px] text-gray-600 truncate max-w-[200px]">{v.violation}</span>
                                        <span className={`text-[11px] font-mono font-semibold ${
                                            v.count >= 10 ? 'text-red-600' : v.count >= 5 ? 'text-amber-600' : 'text-gray-700'
                                        }`}>{v.count}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Monthly trend sparkline */}
                            {qaManual.trend.length > 1 && (
                                <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                                    <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">Monthly Trend</div>
                                    <div className="flex items-end gap-1 h-8">
                                        {(() => {
                                            const max = Math.max(...qaManual.trend.map(t => t.count), 1);
                                            return qaManual.trend.map((t) => (
                                                <div key={t.month} className="flex flex-col items-center flex-1 group relative">
                                                    <div
                                                        className="w-full bg-orange-400/80 rounded-t-sm min-h-[2px]"
                                                        style={{ height: `${(t.count / max) * 100}%` }}
                                                        title={`${t.month}: ${t.count}`}
                                                    />
                                                    <span className="text-[8px] text-gray-400 mt-0.5">{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(t.month.slice(5)) - 1]}</span>
                                                </div>
                                            ));
                                        })()}
                                    </div>
                                </div>
                            )}

                            {/* Date range */}
                            <div className="text-[10px] text-gray-400 px-1">
                                {new Date(qaManual.earliest + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                {' - '}
                                {new Date(qaManual.latest + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                {qaManual.matchedName !== `${employee.first_name} ${employee.last_name}`.trim() && (
                                    <span className="ml-1 text-gray-300">(matched: {qaManual.matchedName})</span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Weekly Schedule */}
                    {schedule && (
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                <Clock size={14} className="text-indigo-500" />
                                Weekly Schedule
                                {(() => {
                                    const grossHours = calculateWeeklyHours(schedule);
                                    // Deduct 1hr break per working day if agent has a break schedule
                                    const workingDays = WEEKDAYS.filter(day => {
                                        const s = schedule[day];
                                        return s && s.trim().toLowerCase() !== 'off' && s.trim() !== '';
                                    }).length;
                                    const breakDeduction = breakSchedule ? workingDays * 1 : 0;
                                    const netHours = Math.round((grossHours - breakDeduction) * 100) / 100;
                                    const displayHours = breakSchedule ? netHours : grossHours;
                                    const ft = displayHours >= 30;
                                    return (
                                        <>
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium normal-case ${ft ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                                {displayHours}h/wk &middot; {ft ? 'Full-Time' : 'Part-Time'}
                                            </span>
                                            {breakSchedule && breakDeduction > 0 && (
                                                <span className="text-[10px] text-gray-400 normal-case ml-1">
                                                    (1hr break/day deducted)
                                                </span>
                                            )}
                                        </>
                                    );
                                })()}
                            </h3>

                            <div className="space-y-1.5">
                                {WEEKDAYS.map((day) => {
                                    const shift = schedule[day];
                                    const isOff = !shift || shift.trim().toLowerCase() === 'off' || shift.trim() === '';
                                    const grossHours = parseShiftDuration(shift);
                                    const netHours = breakSchedule && grossHours > 0 ? Math.max(grossHours - 1, 0) : grossHours;
                                    return (
                                        <div key={day} className={`flex items-center justify-between px-3 py-2 rounded-lg ${isOff ? 'bg-gray-50' : 'bg-indigo-50/50'}`}>
                                            <span className={`text-sm font-medium ${isOff ? 'text-gray-400' : 'text-gray-700'}`}>
                                                {day}
                                            </span>
                                            <div className="text-right">
                                                <span className={`text-sm ${isOff ? 'text-gray-400 italic' : 'text-gray-800 font-medium'}`}>
                                                    {isOff ? 'OFF' : normalizeShiftTime(shift).trim()}
                                                </span>
                                                {!isOff && netHours > 0 && (
                                                    <span className="text-xs text-gray-500 ml-2">({netHours}h)</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {schedule.Notes && (
                                <div className="px-1 mt-1">
                                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Notes</p>
                                    <p className="text-xs text-gray-500 italic">{schedule.Notes}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Break Schedule */}
                    {breakSchedule && (
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                <Coffee size={14} className="text-amber-500" />
                                Break Schedule
                            </h3>

                            <div className="space-y-1.5">
                                {[
                                    { label: 'First Break', key: 'First Break' },
                                    { label: 'Lunch Break', key: 'Lunch Break' },
                                    { label: 'Second Break', key: 'Second Break' },
                                ].map(({ label, key }) => {
                                    const raw = breakSchedule[key];
                                    // Parse time from Google Sheets date string (e.g. "Sat Dec 30 1899 11:00:00 GMT-0500 ...")
                                    let displayTime = '';
                                    if (raw && raw.trim() && raw.trim() !== '-') {
                                        const parsed = new Date(raw);
                                        if (!isNaN(parsed.getTime())) {
                                            const h = parsed.getHours();
                                            const m = parsed.getMinutes();
                                            const ampm = h >= 12 ? 'PM' : 'AM';
                                            const h12 = h % 12 || 12;
                                            displayTime = `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
                                        } else {
                                            displayTime = raw.trim();
                                        }
                                    }
                                    const hasValue = displayTime.length > 0;
                                    return (
                                        <div key={key} className={`flex items-center justify-between px-3 py-2 rounded-lg ${hasValue ? 'bg-amber-50/50' : 'bg-gray-50'}`}>
                                            <span className={`text-sm font-medium ${hasValue ? 'text-gray-700' : 'text-gray-400'}`}>
                                                {label}
                                            </span>
                                            <span className={`text-sm ${hasValue ? 'text-gray-800 font-medium' : 'text-gray-400 italic'}`}>
                                                {hasValue ? displayTime : '—'}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>

                            {breakSchedule.Notes && (
                                <div className="px-1 mt-1">
                                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Notes</p>
                                    <p className="text-xs text-gray-500 italic">{breakSchedule.Notes}</p>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Documents</h3>
                            <label className="cursor-pointer bg-gray-900 text-white p-1.5 rounded-lg hover:bg-gray-800 transition-colors shadow-sm">
                                <Upload size={14} />
                                <input
                                    type="file"
                                    className="hidden"
                                    onChange={handleFileUpload}
                                    disabled={uploading}
                                />
                            </label>
                        </div>

                        <div className="space-y-2">
                            {uploading && (
                                <div className="text-xs text-blue-600 animate-pulse font-medium">
                                    Uploading document...
                                </div>
                            )}

                            {!documents || documents.length === 0 ? (
                                <p className="text-sm text-gray-400 italic">No documents uploaded.</p>
                            ) : (
                                documents.map((doc, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 group hover:border-blue-100 transition-colors">
                                        <div className="flex items-center gap-3 overflow-hidden cursor-pointer" onClick={() => handleViewDocument(doc)}>
                                            <div className="p-2 bg-white rounded-md border border-gray-100 text-blue-500">
                                                <FileText size={16} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-gray-900 truncate pr-4 hover:text-blue-600 transition-colors" title={doc.name}>
                                                    {doc.name}
                                                </p>
                                                <p className="text-[10px] text-gray-400">
                                                    {(doc.size / 1024).toFixed(0)} KB • {new Date(doc.uploaded_at).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleViewDocument(doc)}
                                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                                title="View"
                                            >
                                                <Eye size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleDownload(doc)}
                                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                                title="Download"
                                            >
                                                <Download size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteDocument(doc)}
                                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                                title="Delete"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Attendance History */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                <Activity size={14} className="text-cyan-500" />
                                Attendance History
                                {attendanceEvents.length > 0 && (
                                    <span className="text-xs bg-cyan-50 text-cyan-700 px-2 py-0.5 rounded-full font-medium normal-case">
                                        {attendanceEvents.length}
                                    </span>
                                )}
                            </h3>
                            {attendanceEvents.length > 3 && (
                                <button
                                    onClick={() => setAttendanceExpanded(!attendanceExpanded)}
                                    className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                >
                                    {attendanceExpanded ? <>Show less <ChevronUp size={12} /></> : <>Show all <ChevronDown size={12} /></>}
                                </button>
                            )}
                        </div>

                        {attendanceEvents.length === 0 ? (
                            <p className="text-sm text-gray-400 italic">No attendance events on record.</p>
                        ) : (
                            <>
                                {/* 30-day score */}
                                {(() => {
                                    const thirtyDaysAgo = new Date();
                                    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                                    const months: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
                                    const parseDate = (s: string) => {
                                        if (s.includes('-')) return new Date(s);
                                        const parts = s.trim().split(/\s+/);
                                        if (parts.length === 3 && months[parts[1]]) {
                                            return new Date(`${parts[2]}-${months[parts[1]]}-${parts[0].padStart(2, '0')}`);
                                        }
                                        return new Date(s);
                                    };
                                    const weights: Record<string, number> = { late: 1, early_leave: 1, absent: 1.5, no_show: 1.5 };
                                    const recentScore = attendanceEvents
                                        .filter(e => { try { return parseDate(e.date) >= thirtyDaysAgo; } catch { return false; } })
                                        .reduce((sum, e) => sum + (weights[e.eventType] || 1), 0);
                                    const color = recentScore >= 6 ? 'text-red-600 bg-red-50 border-red-200' : recentScore >= 3 ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-emerald-600 bg-emerald-50 border-emerald-200';
                                    return (
                                        <div className={`flex items-center justify-between px-3 py-2 rounded-lg border ${color}`}>
                                            <span className="text-xs font-medium">30-Day Occurrence Score</span>
                                            <span className="text-sm font-bold">{recentScore.toFixed(1)} pts</span>
                                        </div>
                                    );
                                })()}
                                <div className="space-y-2">
                                    {(attendanceExpanded ? attendanceEvents : attendanceEvents.slice(0, 3)).map((evt, idx) => {
                                        const configs: Record<string, { color: string; bg: string; label: string; Icon: typeof Clock }> = {
                                            late: { color: 'text-yellow-600', bg: 'bg-yellow-50', label: 'Late', Icon: Clock },
                                            early_leave: { color: 'text-orange-600', bg: 'bg-orange-50', label: 'Early Leave', Icon: ArrowLeft },
                                            no_show: { color: 'text-amber-600', bg: 'bg-amber-50', label: 'Unplanned', Icon: AlertTriangle },
                                            absent: { color: 'text-rose-600', bg: 'bg-rose-50', label: 'Absent', Icon: AlertTriangle },
                                        };
                                        const cfg = configs[evt.eventType] || configs.absent;
                                        const Icon = cfg.Icon;
                                        return (
                                            <div key={idx} className={`flex items-center gap-3 p-3 rounded-lg border border-gray-100 ${cfg.bg}`}>
                                                <Icon size={14} className={cfg.color} />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between">
                                                        <span className={`text-xs font-semibold ${cfg.color}`}>
                                                            {cfg.label}{evt.minutes ? ` (${evt.minutes} min)` : ''}
                                                        </span>
                                                        <span className="text-[10px] text-gray-500">{evt.date}</span>
                                                    </div>
                                                    {evt.reason && (
                                                        <p className="text-[11px] text-gray-500 mt-0.5 truncate">{evt.reason}</p>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Write-Up History */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                <AlertTriangle size={14} className="text-amber-500" />
                                Write-Up History
                                {writeUps.length > 0 && (
                                    <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium normal-case">
                                        {writeUps.length}
                                    </span>
                                )}
                            </h3>
                            {writeUps.length > 2 && (
                                <button
                                    onClick={() => setWriteUpsExpanded(!writeUpsExpanded)}
                                    className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                >
                                    {writeUpsExpanded ? <>Show less <ChevronUp size={12} /></> : <>Show all <ChevronDown size={12} /></>}
                                </button>
                            )}
                        </div>

                        {writeUps.length === 0 ? (
                            <p className="text-sm text-gray-400 italic">No write-ups on record.</p>
                        ) : (
                            <div className="space-y-2">
                                {(writeUpsExpanded ? writeUps : writeUps.slice(0, 2)).map((wu) => (
                                    <div
                                        key={wu.id}
                                        className="p-3 bg-amber-50/50 rounded-lg border border-amber-100 cursor-pointer hover:border-amber-200 transition-colors"
                                        onClick={() => setExpandedWriteUp(expandedWriteUp === wu.id ? null : wu.id)}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm font-medium text-gray-900 truncate pr-4">
                                                {wu.subject}
                                            </span>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                                wu.status === 'sent' ? 'bg-emerald-100 text-emerald-700' :
                                                wu.status === 'simulated' ? 'bg-blue-100 text-blue-700' :
                                                'bg-red-100 text-red-700'
                                            }`}>
                                                {wu.status}
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-gray-500">
                                            {new Date(wu.sent_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                            {' '}&bull;{' '}{wu.type.replace(/_/g, ' ')}
                                            {wu.sent_by && <> &bull; by {wu.sent_by}</>}
                                        </p>
                                        {expandedWriteUp === wu.id && (
                                            <div className="mt-2 pt-2 border-t border-amber-100">
                                                <p className="text-xs text-gray-600 whitespace-pre-line">{wu.body}</p>
                                                {wu.message_id && (
                                                    <p className="text-[10px] text-gray-400 mt-2 font-mono">
                                                        Message ID: {wu.message_id}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="pt-8 flex flex-col gap-3">
                        <div className="flex gap-3">
                            <button className="flex-1 py-2.5 bg-gray-900 text-white rounded-xl font-medium text-sm hover:bg-gray-800 transition-colors shadow-lg shadow-gray-900/10">
                                Send Message
                            </button>
                            <button className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200 transition-colors">
                                Edit Profile
                            </button>
                        </div>
                        {employee.employee_status === 'Active' && (
                            <>
                                {!showTerminateConfirm ? (
                                    <button
                                        onClick={() => { setShowTerminateConfirm(true); setTerminateError(null); }}
                                        className="w-full py-2.5 bg-red-50 text-red-600 rounded-xl font-medium text-sm hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Ban size={14} />
                                        Terminate Employee
                                    </button>
                                ) : (
                                    <div className="p-4 bg-red-50 rounded-xl border border-red-200">
                                        <p className="text-sm text-red-800 font-medium mb-1">
                                            Terminate {employee.first_name} {employee.last_name}?
                                        </p>
                                        <p className="text-xs text-red-600 mb-3">
                                            This will mark them as Terminated and remove them from all Slack channels.
                                        </p>
                                        {terminateError && (
                                            <p className="text-xs text-red-700 bg-red-100 rounded-lg px-3 py-2 mb-3">{terminateError}</p>
                                        )}
                                        <div className="flex gap-2">
                                            <button
                                                onClick={async () => {
                                                    setIsTerminating(true);
                                                    setTerminateError(null);
                                                    try {
                                                        const res = await fetch('/api/hr/terminate-employee', {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ employeeId: employee.id }),
                                                        });
                                                        const data = await res.json();
                                                        if (!res.ok) {
                                                            setTerminateError(data.error || 'Failed to terminate');
                                                        } else {
                                                            // Close drawer — parent will refetch and see updated status
                                                            onClose();
                                                        }
                                                    } catch (err: any) {
                                                        setTerminateError(err.message || 'Network error');
                                                    } finally {
                                                        setIsTerminating(false);
                                                    }
                                                }}
                                                disabled={isTerminating}
                                                className="flex-1 py-2 bg-red-600 text-white rounded-lg font-medium text-sm hover:bg-red-700 transition-colors disabled:opacity-50"
                                            >
                                                {isTerminating ? 'Terminating...' : 'Confirm Terminate'}
                                            </button>
                                            <button
                                                onClick={() => setShowTerminateConfirm(false)}
                                                disabled={isTerminating}
                                                className="flex-1 py-2 bg-white text-gray-700 rounded-lg font-medium text-sm hover:bg-gray-50 transition-colors border border-gray-200 disabled:opacity-50"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                        {employee.employee_status === 'Terminated' && (
                            <div className="py-2.5 bg-red-50 text-red-500 rounded-xl font-medium text-sm text-center flex items-center justify-center gap-2">
                                <Ban size={14} />
                                Terminated
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Profile Image Lightbox */}
            {showImageLightbox && employee.user_image && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-pointer"
                    onClick={() => setShowImageLightbox(false)}
                    onKeyDown={(e) => e.key === 'Escape' && setShowImageLightbox(false)}
                    tabIndex={0}
                    role="dialog"
                >
                    <div className="relative max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
                        <img
                            src={employee.user_image}
                            alt={`${employee.first_name} ${employee.last_name}`}
                            className="w-full rounded-2xl shadow-2xl"
                        />
                        <p className="text-center text-white/80 text-sm mt-3 font-medium">
                            {employee.first_name} {employee.last_name}
                        </p>
                        <button
                            onClick={() => setShowImageLightbox(false)}
                            className="absolute -top-3 -right-3 p-2 bg-white/20 hover:bg-white/40 rounded-full text-white transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
