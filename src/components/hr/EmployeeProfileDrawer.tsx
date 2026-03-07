"use client";

import { X, Mail, Calendar, User, Upload, FileText, Trash2, Download, Phone, AlertTriangle, ChevronDown, ChevronUp, Clock, ExternalLink, Eye, Ban, Trophy, Medal, StickyNote } from "lucide-react";

const SlackIcon = ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
        <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/>
        <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D"/>
        <path d="M15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1-2.52-2.523 2.527 2.527 0 0 1 2.52-2.52h6.315A2.528 2.528 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315z" fill="#ECB22E"/>
    </svg>
);
import { parseShiftDuration, calculateWeeklyHours, normalizeShiftTime, WEEKDAYS } from "@/lib/hr-utils";
import { isPilotCampaign } from "@/utils/dialedin-heatmap";
import { getRevenuePerTransfer, getCampaignType, getBreakEvenTPH } from "@/utils/dialedin-revenue";
import { getTier, computeHotStreak } from "@/utils/agent-tiers";
import { getManagerForCampaigns, getManagerNamesForCampaigns } from "@/lib/campaign-config";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase-client";
import { useAuth } from "@/context/AuthContext";

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
    dialedin_name?: string | null;
}

interface EmployeeProfileDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    employee: Employee | null;
}

// CAMPAIGN_MANAGERS imported from @/lib/campaign-config

export default function EmployeeProfileDrawer({ isOpen, onClose, employee }: EmployeeProfileDrawerProps) {
    const { profile } = useAuth();
    const dirReadOnly = !!profile?.hr_permissions?.directory_readonly;
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
    const [fxRate, setFxRate] = useState(0.72); // CAD→USD fallback
    const [qaStats, setQaStats] = useState<{ avg_score: number; total_calls: number; auto_fail_count: number; auto_fail_rate: number; pass_rate: number; risk_breakdown: { high: number; medium: number; low: number } } | null>(null);
    const [qaManual, setQaManual] = useState<{ total: number; violations: { violation: string; count: number; campaigns?: string[] }[]; recent: { date: string; time?: string; phone?: string; violation: string; reviewer: string | null; campaign?: string }[]; trend: { month: string; count: number }[]; matchedName: string; earliest: string; latest: string } | null>(null);
    const [qaFrom, setQaFrom] = useState("");
    const [qaTo, setQaTo] = useState("");
    const [qaExpanded, setQaExpanded] = useState(false);
    const [qaRecentExpanded, setQaRecentExpanded] = useState(false);
    const [qaLoading, setQaLoading] = useState(false);
    const [showTerminateConfirm, setShowTerminateConfirm] = useState(false);
    const [isTerminating, setIsTerminating] = useState(false);
    const [terminateError, setTerminateError] = useState<string | null>(null);
    const [notes, setNotes] = useState<{ id: string; note: string; added_by: string; created_at: string }[]>([]);
    const [showNoteForm, setShowNoteForm] = useState(false);
    const [noteText, setNoteText] = useState("");
    const [noteSaving, setNoteSaving] = useState(false);
    const [notesExpanded, setNotesExpanded] = useState(false);
    const [intradayAgent, setIntradayAgent] = useState<{ sla_hr: number; transfers: number; hours_worked: number; rank?: number; team: string | null; labor_cost?: number; cost_per_sla?: number; revenue_est?: number; roi?: number; wage_matched?: boolean } | null>(null);
    const [intradayMeta, setIntradayMeta] = useState<{ snapshot_at: string | null; stale: boolean; total_ranked: number; break_even: { aca: number; medicare: number } } | null>(null);
    const [showMessageForm, setShowMessageForm] = useState(false);
    const [messageText, setMessageText] = useState("");
    const [messageRecipient, setMessageRecipient] = useState("employee");
    const [messageSending, setMessageSending] = useState(false);
    const [messageStatus, setMessageStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [includeSnapshot, setIncludeSnapshot] = useState(true);
    const [leadershipContacts, setLeadershipContacts] = useState<{ name: string; role: string; slack_user_id: string }[]>([]);
    const [portalProfile, setPortalProfile] = useState<{ nickname: string | null; bio: string | null; interests: string[] | null; avatar_url: string | null } | null>(null);

    const fetchQAManualStats = async (firstName: string, lastName: string, from?: string, to?: string) => {
        const name = `${firstName} ${lastName}`.trim();
        if (!name || name.length < 2) { setQaManual(null); return; }
        setQaLoading(true);
        try {
            let url = `/api/hr/qa-manual-stats?name=${encodeURIComponent(name)}`;
            if (from) url += `&from=${from}`;
            if (to) url += `&to=${to}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                // Keep section visible when filtering returns 0 results
                if (data.total > 0 || from || to) {
                    setQaManual(data);
                } else {
                    setQaManual(null);
                }
            } else if (!from && !to) {
                setQaManual(null);
            }
        } catch {
            if (!from && !to) setQaManual(null);
        } finally {
            setQaLoading(false);
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
            fetchNotes(employee.id);
            // Fetch portal profile (bio, interests, nickname) via server route (bypasses RLS)
            if (employee.email) {
                fetch(`/api/user/portal-profile?email=${encodeURIComponent(employee.email)}`)
                    .then(r => r.ok ? r.json() : null)
                    .then(data => setPortalProfile(data || null))
                    .catch(() => setPortalProfile(null));
            } else {
                setPortalProfile(null);
            }
            fetchSchedule(employee.first_name, employee.last_name);
            fetchAttendanceEvents(employee.first_name, employee.last_name);
            // Reset QA date filters on new employee
            setQaFrom("");
            setQaTo("");
            setQaExpanded(false);
            setQaRecentExpanded(false);
            if (employee.role?.toLowerCase() === 'agent') {
                // Use dialedin_name (primary key in DialedIn) with fallback to directory name
                const dialedInLookup = employee.dialedin_name || `${employee.first_name} ${employee.last_name}`.trim();
                fetchPerformanceStats(dialedInLookup);
                fetchQAStats(dialedInLookup);
                fetchQAManualStats(employee.first_name, employee.last_name);
                // Intraday one-shot fetch
                const agentName = dialedInLookup;
                if (agentName.length >= 2) {
                    fetch(`/api/dialedin/intraday?agent=${encodeURIComponent(agentName)}&include_rank=true&include_trend=false&include_economics=true`)
                        .then(r => r.ok ? r.json() : null)
                        .then(data => {
                            if (data?.agents?.length > 0) {
                                const a = data.agents[0];
                                setIntradayAgent({ sla_hr: a.sla_hr, transfers: a.transfers, hours_worked: a.hours_worked, rank: a.rank, team: a.team, labor_cost: a.labor_cost, cost_per_sla: a.cost_per_sla, revenue_est: a.revenue_est, roi: a.roi, wage_matched: a.wage_matched });
                                setIntradayMeta({ snapshot_at: data.latest_snapshot_at, stale: data.stale, total_ranked: data.total_agents_ranked ?? 0, break_even: data.break_even });
                            } else {
                                setIntradayAgent(null);
                                setIntradayMeta(null);
                            }
                        })
                        .catch(() => { setIntradayAgent(null); setIntradayMeta(null); });
                }
            }
            // Fetch FX rate for Canadian agents (needed for wage display + P&L)
            if (employee.country?.toUpperCase() === 'CANADA') {
                fetch('/api/fx-rate').then(r => r.json()).then(d => {
                    if (d?.cad_to_usd > 0) setFxRate(d.cad_to_usd);
                }).catch(() => {});
            }
            if (employee.role?.toLowerCase() !== 'agent') {
                setPerfStats(null);
                setQaStats(null);
                setQaManual(null);
                setIntradayAgent(null);
                setIntradayMeta(null);
            }
        }
    }, [employee, isOpen]);

    // Fetch non-Agent staff for the "HR & Leadership" Slack DM dropdown
    useEffect(() => {
        supabase
            .from('employee_directory')
            .select('first_name, last_name, role, slack_user_id')
            .eq('employee_status', 'Active')
            .neq('role', 'Agent')
            .not('slack_user_id', 'is', null)
            .neq('slack_user_id', '')
            .then(({ data }) => {
                if (data) {
                    setLeadershipContacts(
                        data.map(d => ({
                            name: `${d.first_name} ${d.last_name}`,
                            role: d.role || 'Staff',
                            slack_user_id: d.slack_user_id,
                        }))
                    );
                }
            });
    }, []);

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

    const fetchNotes = async (employeeId: string) => {
        try {
            const res = await fetch(`/api/hr/employee-notes?employee_id=${employeeId}`);
            const data = await res.json();
            setNotes(data.notes || []);
        } catch { setNotes([]); }
    };

    const saveNote = async () => {
        if (!noteText.trim() || !employee?.id) return;
        setNoteSaving(true);
        try {
            const addedBy = (profile?.first_name && profile?.last_name)
                ? `${profile.first_name} ${profile.last_name}`
                : profile?.first_name || profile?.email || "Unknown";
            const res = await fetch("/api/hr/employee-notes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ employee_id: employee.id, note: noteText.trim(), added_by: addedBy, added_by_email: profile?.email }),
            });
            if (res.ok) {
                setNoteText("");
                setShowNoteForm(false);
                fetchNotes(employee.id);
            }
        } catch { /* silent */ }
        setNoteSaving(false);
    };

    const deleteNote = async (noteId: string) => {
        if (!employee?.id) return;
        try {
            const res = await fetch("/api/hr/employee-notes", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: noteId }),
            });
            if (res.ok) fetchNotes(employee.id);
        } catch { /* silent */ }
    };

    // Get individual manager names for the employee's campaigns
    const getManagerNames = (): string[] => getManagerNamesForCampaigns(employee?.current_campaigns);

    const sendMessage = async () => {
        if (!messageText.trim() || !employee) return;
        setMessageSending(true);
        setMessageStatus(null);

        try {
            const payload: Record<string, string | boolean> = {
                message: messageText.trim(),
                employee_id: employee.id,
                sent_by_email: profile?.email || "",
                include_snapshot: includeSnapshot,
            };

            if (messageRecipient === "employee") {
                if (!employee.slack_user_id) {
                    setMessageStatus({ type: "error", text: "This employee doesn't have a linked Slack account." });
                    setMessageSending(false);
                    return;
                }
                payload.recipient_slack_id = employee.slack_user_id;
                payload.recipient_name = `${employee.first_name} ${employee.last_name}`;
            } else {
                payload.recipient_name = messageRecipient;
            }

            const res = await fetch("/api/slack/send-dm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setMessageStatus({ type: "success", text: `Message sent to ${payload.recipient_name}` });
                setMessageText("");
                setTimeout(() => {
                    setShowMessageForm(false);
                    setMessageStatus(null);
                    setMessageRecipient("employee");
                    setIncludeSnapshot(true);
                }, 2000);
                fetchWriteUps(employee.id);
            } else {
                setMessageStatus({ type: "error", text: data.error || "Failed to send message" });
            }
        } catch {
            setMessageStatus({ type: "error", text: "Network error. Please try again." });
        }
        setMessageSending(false);
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

        // Fetch from both absence tables
        const [bookedRes, unbookedRes] = await Promise.all([
            supabase.from('Booked Days Off').select('*').order('id', { ascending: false }),
            supabase.from('Non Booked Days Off').select('*').order('id', { ascending: false }),
        ]);

        const nameMatch = (rowName: string) => {
            const n = rowName.trim().toLowerCase();
            return n === fullName || n.includes(fullName) || fullName.includes(n);
        };

        const events: { eventType: string; date: string; minutes: number | null; reason: string | null }[] = [];

        // Booked Days Off → planned
        (bookedRes.data || []).filter((r: any) => nameMatch(r['Agent Name'] || '')).forEach((r: any) => {
            events.push({ eventType: 'planned', date: r['Date'] || '', minutes: null, reason: null });
        });

        // Non Booked Days Off → unplanned
        (unbookedRes.data || []).filter((r: any) => nameMatch(r['Agent Name'] || '')).forEach((r: any) => {
            events.push({
                eventType: 'unplanned',
                date: r['Date'] || '',
                minutes: null,
                reason: (r['Reason'] || '').toString().trim() || null,
            });
        });

        // Sort by date descending (most recent first)
        const sortMonths: Record<string, string> = { Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06', Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12' };
        events.sort((a, b) => {
            const parseD = (s: string) => {
                if (s.includes('-')) return s.slice(0, 10);
                const p = s.trim().split(/\s+/);
                if (p.length >= 3 && sortMonths[p[1]]) return `${p[2]}-${sortMonths[p[1]]}-${p[0].padStart(2, '0')}`;
                return s;
            };
            return parseD(b.date).localeCompare(parseD(a.date));
        });

        setAttendanceEvents(events);
    };

    const fetchPerformanceStats = async (agentLookupName: string) => {
        const name = agentLookupName.trim();
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

    const fetchQAStats = async (agentLookupName: string) => {
        const name = agentLookupName.trim();
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
            if (showImageLightbox) return; // Don't close drawer while lightbox is open
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
    }, [isOpen, onClose, showImageLightbox]);

    if (!isOpen || !employee) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm transition-opacity duration-300">
            <div
                ref={drawerRef}
                className="w-full max-w-md h-full bg-gradient-to-b from-slate-950 via-gray-950 to-slate-950 shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300"
            >
                {/* Header */}
                <div className="relative h-44 bg-gradient-to-br from-[#7c3aed] to-[#9333ea]">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/30" />
                    <div className="absolute inset-0 flex items-center justify-center pb-10">
                        <img
                            src="/images/pp-logo-black.png"
                            alt="Pitch Perfect Solutions"
                            className="h-14 object-contain brightness-0 invert opacity-90"
                        />
                    </div>
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white/70 hover:text-white transition-all"
                    >
                        <X size={18} />
                    </button>

                    <div className="absolute -bottom-14 left-1/2 -translate-x-1/2">
                        <div
                            className={`h-24 w-24 rounded-full bg-white p-[3px] shadow-xl ${employee.user_image ? 'cursor-pointer hover:shadow-2xl transition-shadow' : ''}`}
                            onClick={(e) => { e.stopPropagation(); if (employee.user_image) setShowImageLightbox(true); }}
                        >
                            <div className="h-full w-full rounded-full bg-gray-100 overflow-hidden relative">
                                <div className="h-full w-full flex items-center justify-center bg-gray-900 text-white font-medium text-lg tracking-wide">
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
                <div className="pt-20 px-7 pb-8 space-y-6">
                    <div className="text-center">
                        <h2 className="text-2xl font-bold text-white tracking-tight">
                            {employee.first_name} {employee.last_name}
                        </h2>
                        <p className="text-sm text-white/60 mt-1">
                            {employee.role || "No Role Assigned"}
                        </p>
                    </div>

                    {/* Status + Contact Icons */}
                    <div className="flex items-center justify-center gap-3">
                        {employee.employee_status && (() => {
                            const status = employee.employee_status.toLowerCase();
                            const dot: Record<string, string> = { active: 'bg-emerald-400', pending: 'bg-amber-400', terminated: 'bg-red-400', onboarding: 'bg-blue-400' };
                            return (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium text-white/70 bg-white/10 ring-1 ring-white/10">
                                    <span className={`w-1.5 h-1.5 rounded-full ${dot[status] || 'bg-gray-400'}`} />
                                    {employee.employee_status}
                                </span>
                            );
                        })()}
                        <div className="flex items-center gap-1.5">
                            {employee.email && (
                                <a href={`mailto:${employee.email}`} title={employee.email} className="p-2.5 rounded-xl bg-white/10 text-white/60 hover:bg-white/15 hover:text-white transition-all">
                                    <Mail size={16} />
                                </a>
                            )}
                            {employee.phone && (
                                <a href={`tel:${employee.phone}`} title={employee.phone} className="p-2.5 rounded-xl bg-white/10 text-white/60 hover:bg-white/15 hover:text-white transition-all">
                                    <Phone size={16} />
                                </a>
                            )}
                            {(employee.slack_display_name || employee.slack_user_id) && (
                                <button title={employee.slack_display_name ? `@${employee.slack_display_name}` : employee.slack_user_id || ''} className="p-2.5 rounded-xl bg-white/10 text-white/60 hover:bg-white/15 hover:text-white transition-all">
                                    <SlackIcon size={16} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Performance Row — Status + Tier + Hot Streak inline */}
                    {employee.role?.toLowerCase() === 'agent' && !perfLoading && (() => {
                        // Perf status
                        const perfBadge = (() => {
                            if (!perfStats?.latest || !perfStats?.averages) return null;
                            const l = perfStats.latest;
                            const badgeTeam: string | null = (() => {
                                if (l.team) return l.team;
                                for (const c of (employee.current_campaigns || [])) {
                                    const cl = c.toLowerCase();
                                    if (cl.includes('whatif') || cl.includes('what if')) return 'Team WhatIf';
                                    if (cl.includes('medicare')) return 'Aragon Team A';
                                    if (cl.includes('aca')) return 'Jade ACA Team';
                                }
                                return null;
                            })();
                            if (isPilotCampaign(employee?.current_campaigns, badgeTeam)) return null;
                            const be = getBreakEvenTPH(badgeTeam || null);
                            const dayTph = l.adjusted_tph != null ? Number(l.adjusted_tph) : Number(l.tph);
                            const dayAbove = dayTph >= be;
                            const avgTph = perfStats.averages?.adjusted_tph != null
                                ? perfStats.averages.adjusted_tph
                                : perfStats.averages?.tph ?? 0;
                            const periodAbove = avgTph >= be;
                            type PerfStatus = 'performing' | 'trending_up' | 'trending_down' | 'critical';
                            let status: PerfStatus;
                            if (dayAbove && periodAbove) status = 'performing';
                            else if (dayAbove && !periodAbove) status = 'trending_up';
                            else if (!dayAbove && periodAbove) status = 'trending_down';
                            else status = 'critical';
                            const config: Record<PerfStatus, { label: string; color: string; icon: string }> = {
                                performing:    { label: 'Performing',     color: 'bg-emerald-500/15 text-emerald-400 ring-emerald-400/30', icon: '●' },
                                trending_up:   { label: 'Trending Up',    color: 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/20', icon: '↑' },
                                trending_down: { label: 'Trending Down',  color: 'bg-amber-500/15 text-amber-400 ring-amber-400/30',      icon: '↓' },
                                critical:      { label: 'Critical',       color: 'bg-red-500/15 text-red-400 ring-red-400/30',             icon: '▼' },
                            };
                            return config[status];
                        })();

                        // Tier
                        const tierBadge = (() => {
                            if (!perfStats?.averages) return null;
                            const avgTph = perfStats.averages.adjusted_tph ?? perfStats.averages.tph ?? 0;
                            const tier = getTier(avgTph);
                            const tierColors: Record<string, string> = {
                                Rookie:    'bg-amber-500/15 text-amber-400 ring-amber-400/30',
                                Performer: 'bg-slate-500/15 text-slate-300 ring-slate-400/30',
                                Pro:       'bg-yellow-500/15 text-yellow-400 ring-yellow-400/30',
                                Star:      'bg-cyan-500/15 text-cyan-400 ring-cyan-400/30',
                                Elite:     'bg-violet-500/15 text-violet-400 ring-violet-400/30',
                            };
                            return { text: `${tier.badge} · ${tier.name}`, color: tierColors[tier.name] || tierColors.Rookie };
                        })();

                        // Hot streak
                        const streakBadge = (() => {
                            if (!perfStats?.recentDays?.length || perfStats.recentDays.length <= 1) return null;
                            const days = perfStats.recentDays;
                            const effectiveTeam = perfStats.latest?.team || null;
                            const be = getBreakEvenTPH(effectiveTeam);
                            const slaValues = [...days].reverse().map((d: any) =>
                                d.adjusted_tph != null ? Number(d.adjusted_tph) : Number(d.tph)
                            );
                            const streak = computeHotStreak(slaValues, be);
                            if (streak < 2) return null;
                            return streak;
                        })();

                        if (!perfBadge && !tierBadge && !streakBadge) return null;
                        return (
                            <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
                                {perfBadge && (
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ring-1 ${perfBadge.color}`}>
                                        <span>{perfBadge.icon}</span> {perfBadge.label}
                                    </span>
                                )}
                                {tierBadge && (
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ring-1 ${tierBadge.color}`}>
                                        {tierBadge.text}
                                    </span>
                                )}
                                {streakBadge && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-orange-500/15 text-orange-400 ring-1 ring-orange-400/30">
                                        {streakBadge}-day hot streak
                                    </span>
                                )}
                            </div>
                        );
                    })()}

                    {/* Campaign Badges + Manager */}
                    {employee.current_campaigns && employee.current_campaigns.length > 0 && (
                        <div className="flex flex-wrap justify-center gap-1.5">
                            {employee.current_campaigns.map(campaign => {
                                const campaignStyles: Record<string, string> = {
                                    'Medicare': 'bg-gradient-to-r from-blue-500 to-blue-600 text-white',
                                    'ACA': 'bg-gradient-to-r from-violet-500 to-purple-600 text-white',
                                    'Medicare WhatIF': 'bg-gradient-to-r from-teal-500 to-cyan-600 text-white',
                                    'Hospital': 'bg-gradient-to-r from-rose-500 to-pink-600 text-white',
                                    'Pitch Meals': 'bg-gradient-to-r from-orange-500 to-amber-600 text-white',
                                    'Home Care Michigan': 'bg-gradient-to-r from-emerald-500 to-green-600 text-white',
                                    'Home Care NY': 'bg-gradient-to-r from-lime-500 to-green-600 text-white',
                                };
                                const style = campaignStyles[campaign] || 'bg-gradient-to-r from-gray-500 to-gray-600 text-white';
                                return (
                                    <span
                                        key={campaign}
                                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium shadow-sm ${style}`}
                                    >
                                        {campaign}
                                    </span>
                                );
                            })}
                            {(() => {
                                const managerName = getManagerForCampaigns(employee.current_campaigns);
                                if (!managerName) return null;
                                return (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-sm">
                                        <User size={11} />
                                        {managerName}
                                    </span>
                                );
                            })()}
                        </div>
                    )}

                    {/* Portal Profile — Bio & Interests */}
                    {portalProfile && (portalProfile.bio || (portalProfile.interests && portalProfile.interests.length > 0)) && (
                        <div className="rounded-2xl bg-gradient-to-br from-violet-600/15 via-fuchsia-500/10 to-violet-600/15 ring-1 ring-violet-400/30 p-4 space-y-4">
                            <div className="flex items-center gap-2">
                                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-violet-400/50 to-transparent" />
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">Agent Profile</span>
                                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-violet-400/50 to-transparent" />
                            </div>
                            {portalProfile.nickname && (
                                <p className="text-center">
                                    <span className="inline-block px-3.5 py-1 rounded-full bg-fuchsia-500/20 ring-1 ring-fuchsia-400/40 text-[12px] font-semibold text-fuchsia-200 italic">&ldquo;{portalProfile.nickname}&rdquo;</span>
                                </p>
                            )}
                            {portalProfile.bio && (
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80 mb-1.5">About</p>
                                    <p className="text-[13px] text-white/85 leading-relaxed">{portalProfile.bio}</p>
                                </div>
                            )}
                            {portalProfile.interests && portalProfile.interests.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80 mb-2">Interests</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {portalProfile.interests.map(tag => (
                                            <span key={tag} className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-violet-500/20 text-violet-100/90 ring-1 ring-violet-400/35">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 divide-y divide-white/5">
                        {[
                            employee.country && { label: 'Country', value: employee.country },
                            { label: 'Hired', value: employee.hired_at ? new Date(employee.hired_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not recorded' },
                            employee.hourly_wage != null && employee.role?.toLowerCase() === 'agent' && { label: 'Wage', value: employee.country?.toUpperCase() === 'CANADA' ? `$${Math.round(Number(employee.hourly_wage))} CAD` : `$${Math.round(Number(employee.hourly_wage))}/hr`, wageExtra: employee.country?.toUpperCase() === 'CANADA' ? `≈ $${Math.round(Number(employee.hourly_wage) * fxRate)} USD/hr · FX ${fxRate.toFixed(2)}` : undefined },
                            employee.training_start_date && { label: 'Training Start', value: new Date(employee.training_start_date + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) },
                            contractStatus && { label: 'Contract', value: contractStatus.replace(/_/g, ' '), extra: contractStatus },
                        ].filter(Boolean).map((row: any, i: number) => (
                            <div key={i} className="flex items-center justify-between px-4 py-2.5">
                                <span className="text-[13px] text-white/70 font-medium">{row.label}</span>
                                <div className="flex items-center gap-2">
                                    <div className="text-right">
                                        <span className={`text-[13px] font-medium capitalize ${
                                            row.extra === 'signed' ? 'text-emerald-400' : row.extra === 'declined' ? 'text-red-400' : 'text-white'
                                        }`}>{row.value}</span>
                                        {row.wageExtra && (
                                            <div className="text-[11px] text-sky-300/90 font-mono mt-0.5">{row.wageExtra}</div>
                                        )}
                                    </div>
                                    {row.extra === 'signed' && (signedContractUrl || signedContractAuditUrl) && (
                                        <div className="flex items-center gap-1.5">
                                            {signedContractUrl && (
                                                <a href={signedContractUrl} target="_blank" rel="noopener noreferrer" className="text-white/40 hover:text-white transition-colors">
                                                    <ExternalLink size={12} />
                                                </a>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Today's Live Performance (Agents only — from intraday scraper) */}
                    {employee.role?.toLowerCase() === 'agent' && intradayAgent && intradayMeta && (() => {
                        const team = intradayAgent.team?.toLowerCase() || "";
                        const isMedicare = team.includes("aragon") || team.includes("medicare") || team.includes("whatif") || team.includes("elite") || team.includes("brandon");
                        const be = isMedicare ? intradayMeta.break_even.medicare : intradayMeta.break_even.aca;
                        const aboveBE = intradayAgent.sla_hr >= be;
                        const beDelta = intradayAgent.sla_hr - be;
                        return (
                            <div className="space-y-3 pt-2">
                                <h3 className="text-[13px] font-semibold text-white/90 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    Today (Live)
                                    {intradayMeta.snapshot_at && (
                                        <span className="text-[11px] text-white/50 font-normal ml-auto">
                                            {new Date(intradayMeta.snapshot_at).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })}
                                            {intradayMeta.stale && <span className="text-amber-400 ml-1">stale</span>}
                                        </span>
                                    )}
                                </h3>
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="bg-white/5 rounded-lg p-3 text-center">
                                        <div className="text-[10px] text-white/50 uppercase tracking-wider mb-1">SLA/hr</div>
                                        <div className={`text-lg font-bold font-mono tabular-nums ${aboveBE ? "text-emerald-400" : "text-red-400"}`}>
                                            {intradayAgent.sla_hr.toFixed(2)}
                                        </div>
                                        <div className={`text-[10px] font-mono ${aboveBE ? "text-emerald-400/70" : "text-red-400/70"}`}>
                                            {beDelta >= 0 ? "+" : ""}{beDelta.toFixed(2)} vs B/E
                                        </div>
                                    </div>
                                    <div className="bg-white/5 rounded-lg p-3 text-center">
                                        <div className="text-[10px] text-white/50 uppercase tracking-wider mb-1">SLAs</div>
                                        <div className="text-lg font-bold font-mono tabular-nums text-white">
                                            {intradayAgent.transfers}
                                        </div>
                                        <div className="text-[10px] text-white/40 font-mono">{intradayAgent.hours_worked.toFixed(1)}h</div>
                                    </div>
                                    <div className="bg-white/5 rounded-lg p-3 text-center">
                                        <div className="text-[10px] text-white/50 uppercase tracking-wider mb-1">Rank</div>
                                        <div className="text-lg font-bold font-mono tabular-nums text-amber-400">
                                            {intradayAgent.rank ? `#${intradayAgent.rank}` : "—"}
                                        </div>
                                        <div className="text-[10px] text-white/40 font-mono">of {intradayMeta.total_ranked}</div>
                                    </div>
                                </div>
                                {/* Break-even progress bar */}
                                <div className="bg-white/5 rounded-lg p-2">
                                    <div className="flex items-center justify-between text-[10px] mb-1">
                                        <span className="text-white/50">B/E: {be} ({isMedicare ? "Medicare" : "ACA"})</span>
                                        <span className={aboveBE ? "text-emerald-400" : "text-red-400"}>{((intradayAgent.sla_hr / be) * 100).toFixed(0)}%</span>
                                    </div>
                                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full transition-all ${aboveBE ? "bg-emerald-500" : "bg-red-500"}`} style={{ width: `${Math.min((intradayAgent.sla_hr / be) * 100, 100)}%` }} />
                                    </div>
                                </div>
                                {/* Live Economics (cost/revenue per agent) */}
                                {intradayAgent.wage_matched && intradayAgent.labor_cost != null && (
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="bg-white/5 rounded-lg p-2 text-center">
                                            <div className="text-[9px] text-white/40 uppercase tracking-wider mb-0.5">Cost</div>
                                            <div className="text-sm font-bold font-mono tabular-nums text-amber-400">
                                                ${intradayAgent.labor_cost.toFixed(0)}
                                            </div>
                                        </div>
                                        <div className="bg-white/5 rounded-lg p-2 text-center">
                                            <div className="text-[9px] text-white/40 uppercase tracking-wider mb-0.5">$/SLA</div>
                                            <div className="text-sm font-bold font-mono tabular-nums text-white/80">
                                                ${(intradayAgent.cost_per_sla ?? 0).toFixed(2)}
                                            </div>
                                        </div>
                                        <div className="bg-white/5 rounded-lg p-2 text-center">
                                            <div className="text-[9px] text-white/40 uppercase tracking-wider mb-0.5">ROI</div>
                                            <div className={`text-sm font-bold font-mono tabular-nums ${(intradayAgent.roi ?? 0) >= 1 ? "text-emerald-400" : "text-red-400"}`}>
                                                {((intradayAgent.roi ?? 0) * 100).toFixed(0)}%
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* Performance Stats (Agents only) */}
                    {employee.role?.toLowerCase() === 'agent' && (
                        <div className="space-y-4 pt-2">
                            <h3 className="text-[13px] font-semibold text-white/90 flex items-center gap-2">
                                Performance
                                {perfStats?.latest?.report_date && (
                                    <span className="text-[11px] text-white/80 font-medium ml-auto">
                                        {new Date(perfStats.latest.report_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                )}
                            </h3>

                            {perfLoading && (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-3 gap-2">
                                        {[1, 2, 3].map(i => (
                                            <div key={i} className="h-20 bg-white/5 rounded-lg animate-pulse" />
                                        ))}
                                    </div>
                                    <div className="h-12 bg-white/5 rounded-lg animate-pulse" />
                                </div>
                            )}

                            {!perfLoading && !perfStats && (
                                <p className="text-sm text-white/50 italic">No DialedIn data found for this agent.</p>
                            )}

                            {!perfLoading && perfStats?.latest && (() => {
                                const l = perfStats.latest;
                                const avg = perfStats.averages;
                                const tot = perfStats.totals;

                                // Resolve effective team: prefer DialedIn team, fallback to employee campaigns
                                const effectiveTeam = l.team || (() => {
                                    const campaigns: string[] = employee?.current_campaigns || [];
                                    for (const c of campaigns) {
                                        const cl = c.toLowerCase();
                                        if (cl.includes('whatif') || cl.includes('what if')) return 'Team WhatIf';
                                        if (cl.includes('medicare')) return 'Aragon Team A';
                                        if (cl.includes('aca')) return 'Jade ACA Team';
                                    }
                                    return null;
                                })();

                                const logged = Number(l.logged_in_time_min) || 0;
                                const pauseMin = Number(l.pause_time_min) || 0;
                                const wrapMin = Number(l.wrap_time_min) || 0;
                                const active = (Number(l.talk_time_min) || 0) + (Number(l.wait_time_min) || 0) + wrapMin;
                                const util = logged > 0 ? (active / logged) * 100 : 0;
                                const grossHrs = Number(l.hours_worked) || 0;
                                const paidHrsRaw = Math.max((logged - pauseMin - wrapMin + 30) / 60, 0);
                                const paidHrs = grossHrs > 0 ? Math.min(paidHrsRaw, grossHrs) : paidHrsRaw;

                                const totalQualified = (l.raw_data as Record<string, unknown>)?.total_qualified as number | undefined;
                                const RankBadge = ({ rank, total }: { rank: number | null; total?: number }) => {
                                    if (!rank) return null;
                                    if (rank <= 3) return (
                                        <span className="inline-flex items-center gap-0.5">
                                            {rank === 1 ? <Trophy size={10} className="text-amber-500" /> : <Medal size={10} className={rank === 2 ? "text-gray-400" : "text-amber-600"} />}
                                            <span className="text-[9px] font-bold text-amber-400">#{rank}</span>
                                        </span>
                                    );
                                    if (total && total > 0) {
                                        const topPct = Math.max(Math.ceil((rank / total) * 100), 1);
                                        return <span className="text-[9px] text-white/70 font-mono">Top {topPct}%</span>;
                                    }
                                    return <span className="text-[9px] text-white/70 font-mono">#{rank}</span>;
                                };

                                return (
                                    <>
                                        {/* Unified Latest Day Card + Financial Overview */}
                                        {(() => {
                                            const isPilot = isPilotCampaign(employee?.current_campaigns, effectiveTeam);
                                            const rate = getRevenuePerTransfer(effectiveTeam || null, l.skill);
                                            const rateLabel = l.skill || getCampaignType(effectiveTeam || null)?.toUpperCase() || 'SLA';
                                            const displayTph = l.adjusted_tph != null ? Number(l.adjusted_tph) : Number(l.tph);
                                            const isAdjusted = l.adjusted_tph != null;
                                            const dayRevenue = l.transfers * rate;
                                            const rawWage = employee?.hourly_wage != null ? Number(employee.hourly_wage) : null;
                                            const wage = rawWage != null && employee?.country?.toUpperCase() === 'CANADA' ? rawWage * fxRate : rawWage;
                                            const dayCost = wage != null ? paidHrs * wage : null;
                                            const dayPnl = dayCost != null ? dayRevenue - dayCost : null;
                                            const dayRoi = dayCost != null && dayCost > 0 ? (dayPnl! / dayCost) * 100 : null;
                                            const breakEven = getBreakEvenTPH(effectiveTeam || null);
                                            const adjTph = l.adjusted_tph != null ? Number(l.adjusted_tph) : Number(l.tph);
                                            const beDelta = adjTph - breakEven;
                                            const beProgress = Math.min((adjTph / (breakEven * 2)) * 100, 100);

                                            // Period data
                                            const days = perfStats.recentDays || [];
                                            const totalPaidHrs = days.reduce((sum: number, d: Record<string, unknown>) => {
                                                const dLogged = Number(d.logged_in_time_min) || 0;
                                                const dPause = Number(d.pause_time_min) || 0;
                                                const dWrap = Number(d.wrap_time_min) || 0;
                                                const dGross = Number(d.hours_worked) || 0;
                                                const raw = Math.max((dLogged - dPause - dWrap + 30) / 60, 0);
                                                return sum + Math.min(raw, dGross);
                                            }, 0);
                                            const periodRevenue = (perfStats.totals?.transfers || 0) * rate;
                                            const periodCost = wage != null ? totalPaidHrs * wage : null;
                                            const periodPnl = periodCost != null ? periodRevenue - periodCost : null;
                                            const periodRoi = periodCost != null && periodCost > 0 ? (periodPnl! / periodCost) * 100 : null;
                                            const hasPeriod = perfStats.averages && perfStats.totals && perfStats.totals.days_worked > 1;
                                            const periodStart = days.length > 0 ? days[days.length - 1]?.report_date : null;
                                            const periodEnd = days.length > 0 ? days[0]?.report_date : null;
                                            const fmtPeriodDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

                                            return (
                                                <div className="space-y-4">
                                                    {/* Unified dark card — Performance + Financials */}
                                                    <div className="rounded-2xl bg-gray-900 p-4">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <span className="text-[12px] text-white font-medium tracking-wide">Latest Day</span>
                                                            <span className="text-[11px] text-amber-300 font-mono font-bold">{isPilot ? 'Pilot' : `$${rate.toFixed(2)}/${rateLabel}`}</span>
                                                        </div>

                                                        {/* Row 1: SLA/hr, SLA, Conv% */}
                                                        <div className="grid grid-cols-3 gap-0 mb-4">
                                                            <div className="text-center">
                                                                <div className="text-2xl font-bold font-mono text-white tracking-tight">
                                                                    {displayTph.toFixed(2)}{!isAdjusted && <span className="text-[9px] text-white/60 ml-0.5">*</span>}
                                                                </div>
                                                                <div className="text-[11px] text-white mt-1 font-medium">SLA/hr</div>
                                                                <RankBadge rank={l.tph_rank} total={totalQualified} />
                                                            </div>
                                                            <div className="text-center border-x border-white/10">
                                                                <div className="text-2xl font-bold font-mono text-white tracking-tight">
                                                                    {l.transfers}
                                                                </div>
                                                                <div className="text-[11px] text-white mt-1 font-medium">SLA</div>
                                                            </div>
                                                            <div className="text-center">
                                                                <div className="text-2xl font-bold font-mono text-white tracking-tight">
                                                                    {Number(l.conversion_rate).toFixed(1)}%
                                                                </div>
                                                                <div className="text-[11px] text-white mt-1 font-medium">Conv</div>
                                                                <RankBadge rank={l.conversion_rank} total={totalQualified} />
                                                            </div>
                                                        </div>

                                                        {/* Divider */}
                                                        <div className="border-t border-white/10 mb-4" />

                                                        {/* Row 2: Revenue, Cost, P&L, ROI */}
                                                        {isPilot ? (
                                                            <div className="text-center py-2">
                                                                <div className="grid grid-cols-4 gap-0 mb-2">
                                                                    {['Revenue', 'Cost', 'P&L', 'ROI'].map((label, i) => (
                                                                        <div key={label} className={`text-center ${i === 1 || i === 2 ? 'border-x border-white/10' : ''}`}>
                                                                            <div className="text-lg font-semibold font-mono text-white/30">—</div>
                                                                            <div className="text-[10px] text-white/70 mt-0.5">{label}</div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                                <span className="text-[10px] text-white/70 italic">Revenue rates not yet established</span>
                                                            </div>
                                                        ) : (
                                                            <div className="grid grid-cols-4 gap-0">
                                                                <div className="text-center">
                                                                    <div className="text-lg font-semibold font-mono text-white">${dayRevenue.toFixed(0)}</div>
                                                                    <div className="text-[10px] text-white/90 mt-0.5 font-medium">Revenue</div>
                                                                </div>
                                                                <div className="text-center border-x border-white/10">
                                                                    <div className="text-lg font-semibold font-mono text-white">{dayCost != null ? `$${dayCost.toFixed(0)}` : '—'}</div>
                                                                    <div className="text-[10px] text-white/90 mt-0.5 font-medium">Cost{wage != null && <span className="text-sky-300/90 ml-0.5">@${Math.round(wage)}/hr</span>}</div>
                                                                </div>
                                                                <div className="text-center border-r border-white/10">
                                                                    <div className={`text-lg font-semibold font-mono ${dayPnl == null ? 'text-white/30' : dayPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                        {dayPnl != null ? `${dayPnl >= 0 ? '+' : ''}$${dayPnl.toFixed(0)}` : '—'}
                                                                    </div>
                                                                    <div className="text-[10px] text-white/90 mt-0.5 font-medium">P&L</div>
                                                                </div>
                                                                <div className="text-center">
                                                                    <div className={`text-lg font-semibold font-mono ${dayRoi == null ? 'text-white/30' : dayRoi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                        {dayRoi != null ? `${dayRoi >= 0 ? '+' : ''}${dayRoi.toFixed(0)}%` : '—'}
                                                                    </div>
                                                                    <div className="text-[10px] text-white/90 mt-0.5 font-medium">ROI</div>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Break-even bar (hidden for pilot campaigns) */}
                                                        {!isPilot && (
                                                            <div className="mt-4">
                                                                <div className="flex items-center justify-between mb-1.5">
                                                                    <span className="text-[11px] text-white font-medium">
                                                                        {beDelta >= 0 ? 'Above' : 'Below'} break-even
                                                                        <span className="text-white/90 ml-1">({breakEven.toFixed(2)})</span>
                                                                    </span>
                                                                    <span className={`text-[12px] font-mono font-bold ${beDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                        {beDelta >= 0 ? '+' : ''}{beDelta.toFixed(2)} SLA/hr
                                                                    </span>
                                                                </div>
                                                                <div className="relative h-1.5 bg-white/15 rounded-full overflow-hidden">
                                                                    <div
                                                                        className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${beDelta >= 0 ? 'bg-emerald-400' : 'bg-red-400'}`}
                                                                        style={{ width: `${beProgress}%` }}
                                                                    />
                                                                    <div
                                                                        className="absolute top-1/2 -translate-y-1/2 w-px h-2.5 bg-white/50"
                                                                        style={{ left: '50%' }}
                                                                        title={`Break-even: ${breakEven.toFixed(2)} SLA/hr`}
                                                                    />
                                                                </div>

                                                                {/* Consistency streak */}
                                                                {days.length > 1 && (() => {
                                                                    let streak = 0;
                                                                    const latestAbove = adjTph >= breakEven;
                                                                    for (const d of days) {
                                                                        const dTph = d.adjusted_tph != null ? Number(d.adjusted_tph) : Number(d.tph);
                                                                        if ((dTph >= breakEven) === latestAbove) streak++;
                                                                        else break;
                                                                    }
                                                                    if (streak < 2) return null;
                                                                    return (
                                                                        <div className={`mt-2 text-[10px] font-medium ${latestAbove ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                            {latestAbove ? '↑' : '↓'} {streak}-day {latestAbove ? 'above' : 'below'} streak
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </div>
                                                        )}

                                                        {/* Mini SLA/hr sparkline */}
                                                        {days.length > 2 && (() => {
                                                            const pts = [...days].reverse().map(d => d.adjusted_tph != null ? Number(d.adjusted_tph) : Number(d.tph));
                                                            const max = Math.max(...pts, breakEven * 1.3);
                                                            const min = Math.min(...pts, breakEven * 0.5);
                                                            const range = max - min || 1;
                                                            const w = 260;
                                                            const h = 32;
                                                            const beY = h - ((breakEven - min) / range) * h;
                                                            const points = pts.map((v, i) => ({
                                                                x: (i / Math.max(pts.length - 1, 1)) * w,
                                                                y: h - ((v - min) / range) * h,
                                                            }));
                                                            const polyline = points.map(p => `${p.x},${p.y}`).join(' ');
                                                            return (
                                                                <div className="mt-4 px-1">
                                                                    <div className="text-[10px] text-white/80 uppercase tracking-wider font-medium mb-1">SLA/hr Trend</div>
                                                                    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8" preserveAspectRatio="none">
                                                                        <line x1="0" y1={beY} x2={w} y2={beY} stroke="white" strokeOpacity="0.2" strokeDasharray="4 3" />
                                                                        <polyline points={polyline} fill="none" stroke={beDelta >= 0 ? 'rgb(52,211,153)' : 'rgb(248,113,113)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                                        {points.map((p, i) => (
                                                                            <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={pts[i] >= breakEven ? 'rgb(52,211,153)' : 'rgb(248,113,113)'} stroke="rgb(17,24,39)" strokeWidth="1">
                                                                                <title>{pts[i].toFixed(2)} SLA/hr</title>
                                                                            </circle>
                                                                        ))}
                                                                    </svg>
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>

                                                    {/* Secondary Metrics list */}
                                                    <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 divide-y divide-white/5">
                                                        {[
                                                            { label: 'Dials', value: Number(l.dials).toLocaleString() },
                                                            { label: 'Connects', value: Number(l.connects).toLocaleString() },
                                                            { label: 'Connect Rate', value: `${Number(l.connect_rate).toFixed(1)}%` },
                                                            { label: 'Gross Hours', value: grossHrs.toFixed(1) },
                                                            { label: 'Paid Hours', value: paidHrs.toFixed(1) },
                                                            { label: 'Talk Time', value: `${Number(l.talk_time_min).toFixed(0)}m` },
                                                            { label: 'Utilization', value: `${util.toFixed(0)}%` },
                                                            ...(!isPilot && l.transfers > 0 ? [{ label: 'Cost / SLA', value: dayCost != null ? `$${(dayCost / l.transfers).toFixed(2)}` : '—' }] : []),
                                                        ].map(({ label, value }) => (
                                                            <div key={label} className="flex items-center justify-between px-4 py-2">
                                                                <span className="text-[13px] text-white/80 font-medium">{label}</span>
                                                                <span className="text-[13px] font-mono font-medium text-white">{value}</span>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* Period Summary */}
                                                    {hasPeriod && (
                                                        <div className="rounded-2xl bg-gradient-to-br from-indigo-950 via-slate-900 to-violet-950 p-5 shadow-lg">
                                                            {/* Header row */}
                                                            <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/10">
                                                                <div>
                                                                    {(() => {
                                                                        const workDays = perfStats.totals.days_worked;
                                                                        return (
                                                                            <>
                                                                                <span className="text-sm font-bold text-white tracking-tight">
                                                                                    {workDays}-Day Summary
                                                                                </span>
                                                                                {periodStart && periodEnd && (
                                                                                    <div className="text-[11px] text-white/80 font-medium mt-0.5">
                                                                                        {fmtPeriodDate(periodStart)} – {fmtPeriodDate(periodEnd)}
                                                                                    </div>
                                                                                )}
                                                                            </>
                                                                        );
                                                                    })()}
                                                                </div>
                                                                {!isPilot && periodRoi != null && (
                                                                    <div className={`px-3 py-1 rounded-full text-xs font-mono font-bold ${periodRoi >= 0 ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30' : 'bg-red-500/20 text-red-300 ring-1 ring-red-400/30'}`}>
                                                                        {periodRoi >= 0 ? '+' : ''}{periodRoi.toFixed(0)}% ROI
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Financial grid */}
                                                            {isPilot ? (
                                                                <div className="text-center py-3">
                                                                    <div className="grid grid-cols-3 gap-0 mb-2">
                                                                        {['Revenue', 'Cost', 'P&L'].map((label, i) => (
                                                                            <div key={label} className={`text-center ${i === 1 ? 'border-x border-white/10' : ''}`}>
                                                                                <div className="text-xl font-bold font-mono text-white/30">—</div>
                                                                                <div className="text-[10px] text-white/50 mt-1 uppercase tracking-wider">{label}</div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                    <span className="text-[10px] text-white/70 italic">Revenue rates not yet established</span>
                                                                </div>
                                                            ) : (
                                                                <div className="grid grid-cols-3 gap-0 mb-4">
                                                                    <div className="text-center py-2">
                                                                        <div className="text-2xl font-bold font-mono text-white tracking-tight">${periodRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                                                                        <div className="text-[11px] text-white/80 mt-1.5 uppercase tracking-wider font-medium">Revenue</div>
                                                                    </div>
                                                                    <div className="text-center py-2 border-x border-white/10">
                                                                        <div className="text-2xl font-bold font-mono text-white tracking-tight">{periodCost != null ? `$${periodCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}</div>
                                                                        <div className="text-[11px] text-white/80 mt-1.5 uppercase tracking-wider font-medium">Cost</div>
                                                                    </div>
                                                                    <div className="text-center py-2">
                                                                        <div className={`text-2xl font-bold font-mono tracking-tight ${periodPnl == null ? 'text-white/30' : periodPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                            {periodPnl != null ? `${periodPnl >= 0 ? '+' : ''}$${periodPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
                                                                        </div>
                                                                        <div className="text-[11px] text-white/80 mt-1.5 uppercase tracking-wider font-medium">Profit</div>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Footer stats */}
                                                            <div className="grid grid-cols-4 gap-1 pt-3 border-t border-white/10">
                                                                <div className="text-center">
                                                                    <div className="text-sm font-mono font-bold text-white">{perfStats.averages.adjusted_tph != null ? perfStats.averages.adjusted_tph : perfStats.averages.tph}</div>
                                                                    <div className="text-[10px] text-white/80 uppercase tracking-wider font-medium mt-0.5">Avg SLA/hr</div>
                                                                </div>
                                                                <div className="text-center border-x border-white/10">
                                                                    <div className="text-sm font-mono font-bold text-white">{perfStats.totals.transfers}</div>
                                                                    <div className="text-[10px] text-white/80 uppercase tracking-wider font-medium mt-0.5">Total SLA</div>
                                                                </div>
                                                                <div className="text-center border-r border-white/10">
                                                                    <div className="text-sm font-mono font-bold text-white">{totalPaidHrs.toFixed(1)}h</div>
                                                                    <div className="text-[10px] text-white/80 uppercase tracking-wider font-medium mt-0.5">Paid Hours</div>
                                                                </div>
                                                                <div className="text-center">
                                                                    <div className="text-sm font-mono font-bold text-white">
                                                                        {!isPilot && periodCost != null && perfStats.totals.transfers > 0
                                                                            ? `$${Math.round(periodCost / perfStats.totals.transfers)}`
                                                                            : '—'}
                                                                    </div>
                                                                    <div className="text-[10px] text-white/80 uppercase tracking-wider font-medium mt-0.5">Cost/SLA</div>
                                                                </div>
                                                            </div>

                                                            {/* Period break-even bar */}
                                                            {!isPilot && (() => {
                                                                const avgTph = perfStats.averages.adjusted_tph != null ? perfStats.averages.adjusted_tph : perfStats.averages.tph;
                                                                const pBeDelta = avgTph - breakEven;
                                                                const pBeProgress = Math.min((avgTph / (breakEven * 2)) * 100, 100);
                                                                return (
                                                                    <div className="pt-3 mt-3 border-t border-white/10">
                                                                        <div className="flex items-center justify-between mb-1.5">
                                                                            <span className="text-[10px] text-white/80 uppercase tracking-wider font-medium">
                                                                                Period Avg vs Break-Even
                                                                                <span className="text-white/60 ml-1">({breakEven.toFixed(2)})</span>
                                                                            </span>
                                                                            <span className={`text-[11px] font-mono font-bold ${pBeDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                                {pBeDelta >= 0 ? '+' : ''}{pBeDelta.toFixed(2)}
                                                                            </span>
                                                                        </div>
                                                                        <div className="relative h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                                            <div
                                                                                className={`absolute inset-y-0 left-0 rounded-full transition-all ${pBeDelta >= 0 ? 'bg-emerald-400' : 'bg-red-400'}`}
                                                                                style={{ width: `${Math.max(pBeProgress, 2)}%` }}
                                                                            />
                                                                            <div
                                                                                className="absolute top-1/2 -translate-y-1/2 w-px h-2.5 bg-white/50"
                                                                                style={{ left: '50%' }}
                                                                                title={`Break-even: ${breakEven.toFixed(2)} SLA/hr`}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    )}
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
                        <div className="rounded-2xl bg-gradient-to-br from-slate-800 via-gray-900 to-slate-900 p-5 shadow-lg">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
                                QA Compliance
                                <span className="text-[11px] bg-white/10 text-white/70 px-2 py-0.5 rounded-full font-medium">
                                    {qaStats.total_calls} calls
                                </span>
                            </h3>

                            <div className="grid grid-cols-3 gap-0 mb-4">
                                <div className="text-center py-2">
                                    <div className={`text-2xl font-bold font-mono ${
                                        qaStats.avg_score >= 70 ? 'text-emerald-400' : qaStats.avg_score >= 40 ? 'text-amber-400' : 'text-red-400'
                                    }`}>
                                        {qaStats.avg_score}
                                    </div>
                                    <div className="text-[11px] text-white/60 mt-1 uppercase tracking-wider font-medium">Avg Score</div>
                                </div>
                                <div className="text-center py-2 border-x border-white/10">
                                    <div className={`text-2xl font-bold font-mono ${
                                        qaStats.pass_rate >= 80 ? 'text-emerald-400' : qaStats.pass_rate >= 50 ? 'text-amber-400' : 'text-red-400'
                                    }`}>
                                        {qaStats.pass_rate}%
                                    </div>
                                    <div className="text-[11px] text-white/60 mt-1 uppercase tracking-wider font-medium">Pass Rate</div>
                                </div>
                                <div className="text-center py-2">
                                    <div className={`text-2xl font-bold font-mono ${
                                        qaStats.auto_fail_count > 0 ? 'text-red-400' : 'text-emerald-400'
                                    }`}>
                                        {qaStats.auto_fail_count}
                                    </div>
                                    <div className="text-[11px] text-white/60 mt-1 uppercase tracking-wider font-medium">Auto-Fails</div>
                                </div>
                            </div>

                            {/* Risk Breakdown */}
                            <div className="bg-white/5 rounded-xl px-3 py-2.5 flex items-center gap-2">
                                <span className="text-[11px] text-white/60 font-semibold uppercase tracking-wider">Risk</span>
                                <div className="flex gap-1.5">
                                    {qaStats.risk_breakdown.high > 0 && (
                                        <span className="text-[10px] font-semibold bg-red-500/20 text-red-300 ring-1 ring-red-400/30 px-2 py-0.5 rounded-full">
                                            {qaStats.risk_breakdown.high} High
                                        </span>
                                    )}
                                    {qaStats.risk_breakdown.medium > 0 && (
                                        <span className="text-[10px] font-semibold bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30 px-2 py-0.5 rounded-full">
                                            {qaStats.risk_breakdown.medium} Medium
                                        </span>
                                    )}
                                    {qaStats.risk_breakdown.low > 0 && (
                                        <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30 px-2 py-0.5 rounded-full">
                                            {qaStats.risk_breakdown.low} Low
                                        </span>
                                    )}
                                    {qaStats.risk_breakdown.high === 0 && qaStats.risk_breakdown.medium === 0 && qaStats.risk_breakdown.low === 0 && (
                                        <span className="text-[11px] text-white/50 italic">No risk data</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Manual QA Audit (Agents only) */}
                    {employee.role?.toLowerCase() === 'agent' && qaManual && (
                        <div className="rounded-2xl bg-gradient-to-br from-slate-800 via-gray-900 to-slate-900 p-5 shadow-lg">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                    QA Audit
                                    <span className="text-[11px] bg-white/10 text-white/70 px-2 py-0.5 rounded-full font-medium">
                                        {qaManual.total} reviews
                                    </span>
                                    {qaLoading && <span className="w-3 h-3 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />}
                                </h3>
                                <button
                                    onClick={() => {
                                        if (!employee) return;
                                        fetchQAManualStats(employee.first_name, employee.last_name, qaFrom || undefined, qaTo || undefined);
                                    }}
                                    className="text-white/40 hover:text-white/80 transition-colors"
                                    title="Refresh"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
                                </button>
                            </div>

                            {/* Date filter row */}
                            <div className="mb-3 space-y-2">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="date"
                                        value={qaFrom}
                                        onChange={(e) => {
                                            setQaFrom(e.target.value);
                                            if (employee) {
                                                const t = setTimeout(() => fetchQAManualStats(employee.first_name, employee.last_name, e.target.value || undefined, qaTo || undefined), 400);
                                                return () => clearTimeout(t);
                                            }
                                        }}
                                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white/80 focus:outline-none focus:ring-1 focus:ring-violet-400/50 [color-scheme:dark]"
                                        placeholder="From"
                                    />
                                    <span className="text-[10px] text-white/40">to</span>
                                    <input
                                        type="date"
                                        value={qaTo}
                                        onChange={(e) => {
                                            setQaTo(e.target.value);
                                            if (employee) {
                                                const t = setTimeout(() => fetchQAManualStats(employee.first_name, employee.last_name, qaFrom || undefined, e.target.value || undefined), 400);
                                                return () => clearTimeout(t);
                                            }
                                        }}
                                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white/80 focus:outline-none focus:ring-1 focus:ring-violet-400/50 [color-scheme:dark]"
                                        placeholder="To"
                                    />
                                </div>
                                <div className="flex gap-1.5 flex-wrap">
                                    {[
                                        { label: '30d', days: 30 },
                                        { label: '90d', days: 90 },
                                        { label: 'YTD', days: -1 },
                                        { label: 'All', days: 0 },
                                    ].map((preset) => {
                                        const isActive = preset.days === 0 ? (!qaFrom && !qaTo)
                                            : preset.days === -1 ? (qaFrom === `${new Date().getFullYear()}-01-01` && !qaTo)
                                            : (() => {
                                                const d = new Date(); d.setDate(d.getDate() - preset.days);
                                                return qaFrom === d.toISOString().slice(0, 10) && !qaTo;
                                            })();
                                        return (
                                            <button
                                                key={preset.label}
                                                onClick={() => {
                                                    if (!employee) return;
                                                    let from = '';
                                                    const to = '';
                                                    if (preset.days === 0) {
                                                        from = '';
                                                    } else if (preset.days === -1) {
                                                        from = `${new Date().getFullYear()}-01-01`;
                                                    } else {
                                                        const d = new Date();
                                                        d.setDate(d.getDate() - preset.days);
                                                        from = d.toISOString().slice(0, 10);
                                                    }
                                                    setQaFrom(from);
                                                    setQaTo(to);
                                                    fetchQAManualStats(employee.first_name, employee.last_name, from || undefined, to || undefined);
                                                }}
                                                className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-all ${
                                                    isActive
                                                        ? 'bg-violet-500/30 text-violet-200 ring-1 ring-violet-400/40'
                                                        : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                                                }`}
                                            >
                                                {preset.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Empty state for filtered results */}
                            {qaManual.total === 0 && (
                                <div className="bg-white/5 rounded-xl px-4 py-6 mb-3 text-center">
                                    <div className="text-[12px] text-white/50">No violations found in this date range</div>
                                </div>
                            )}

                            {/* Violations list */}
                            {qaManual.violations.length > 0 && <div className="bg-white/5 rounded-xl divide-y divide-white/5 mb-3">
                                {(qaExpanded ? qaManual.violations : qaManual.violations.slice(0, 5)).map((v) => (
                                    <div key={v.violation} className="flex items-center justify-between px-4 py-2.5 gap-2">
                                        <span className="text-[12px] text-white/90 break-words min-w-0 flex-1">{v.violation}</span>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {v.campaigns && v.campaigns.length > 0 && v.campaigns.map(c => (
                                                <span key={c} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-500/30 text-violet-100 ring-1 ring-violet-400/40">{c}</span>
                                            ))}
                                            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
                                                v.count >= 10 ? 'bg-red-500/20 text-red-300 ring-1 ring-red-400/30' : v.count >= 5 ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30' : 'bg-white/10 text-white/70'
                                            }`}>{v.count}</span>
                                        </div>
                                    </div>
                                ))}
                                {qaManual.violations.length > 5 && (
                                    <button
                                        onClick={() => setQaExpanded(!qaExpanded)}
                                        className="w-full px-4 py-2 text-[11px] text-violet-300 hover:text-violet-200 hover:bg-white/5 transition-colors flex items-center justify-center gap-1"
                                    >
                                        {qaExpanded ? (
                                            <>Show less <ChevronUp size={12} /></>
                                        ) : (
                                            <>Show all {qaManual.violations.length} violations <ChevronDown size={12} /></>
                                        )}
                                    </button>
                                )}
                            </div>}

                            {/* Monthly trend — line graph */}
                            {qaManual.trend.length > 1 && (
                                <div className="bg-white/5 rounded-xl px-4 py-3 mb-3">
                                    <div className="text-[10px] text-white/60 uppercase tracking-wider font-semibold mb-2">Monthly Trend</div>
                                    {(() => {
                                        const data = qaManual.trend;
                                        const max = Math.max(...data.map(t => t.count), 1);
                                        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                                        const w = 280;
                                        const h = 48;
                                        const pad = 4;
                                        const points = data.map((t, i) => ({
                                            x: pad + (i / Math.max(data.length - 1, 1)) * (w - pad * 2),
                                            y: pad + (1 - t.count / max) * (h - pad * 2),
                                            count: t.count,
                                            label: months[Number(t.month.slice(5)) - 1],
                                        }));
                                        const polyline = points.map(p => `${p.x},${p.y}`).join(' ');
                                        const areaPath = `M${points[0].x},${h} ${points.map(p => `L${p.x},${p.y}`).join(' ')} L${points[points.length - 1].x},${h} Z`;
                                        return (
                                            <div>
                                                <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-12" preserveAspectRatio="none">
                                                    <defs>
                                                        <linearGradient id="qaManualTrendFill" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="0%" stopColor="rgb(167,139,250)" stopOpacity="0.3" />
                                                            <stop offset="100%" stopColor="rgb(167,139,250)" stopOpacity="0" />
                                                        </linearGradient>
                                                    </defs>
                                                    <path d={areaPath} fill="url(#qaManualTrendFill)" />
                                                    <polyline points={polyline} fill="none" stroke="rgb(167,139,250)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                    {points.map((p, i) => (
                                                        <circle key={i} cx={p.x} cy={p.y} r="3" fill="rgb(167,139,250)" stroke="rgb(30,30,50)" strokeWidth="1.5">
                                                            <title>{`${p.label}: ${p.count}`}</title>
                                                        </circle>
                                                    ))}
                                                </svg>
                                                <div className="flex justify-between mt-1">
                                                    {points.map((p, i) => (
                                                        <span key={i} className="text-[8px] text-white/50 font-medium">{p.label}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}

                            {/* Recent reviews */}
                            {qaManual.recent.length > 0 && (
                                <div className="mb-3">
                                    <button
                                        onClick={() => setQaRecentExpanded(!qaRecentExpanded)}
                                        className="w-full flex items-center justify-between text-[10px] text-white/60 uppercase tracking-wider font-semibold mb-1 hover:text-white/80 transition-colors"
                                    >
                                        <span>Recent Reviews ({qaManual.recent.length})</span>
                                        {qaRecentExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                    </button>
                                    {qaRecentExpanded && (
                                        <div className="bg-white/5 rounded-xl divide-y divide-white/5 max-h-60 overflow-y-auto">
                                            {qaManual.recent.slice(0, 50).map((r, i) => (
                                                <div key={`${r.date}-${r.phone}-${i}`} className="px-3 py-2 flex items-start gap-2">
                                                    <div className="text-[10px] text-white/40 font-mono whitespace-nowrap pt-0.5">
                                                        {new Date(r.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-[11px] text-white/80">{r.violation}</div>
                                                        <div className="text-[10px] text-white/40 flex items-center gap-2">
                                                            {r.phone && <span>{r.phone}</span>}
                                                            {r.reviewer && <span>by {r.reviewer}</span>}
                                                            {r.campaign && <span className="bg-white/5 px-1.5 py-0.5 rounded text-[9px]">{r.campaign}</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Date range + match info */}
                            <div className="text-[10px] text-white/50 font-medium">
                                {new Date(qaManual.earliest + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                {' – '}
                                {new Date(qaManual.latest + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                {qaManual.matchedName !== `${employee.first_name} ${employee.last_name}`.trim() && (
                                    <span className="ml-1 text-white/40">(matched: {qaManual.matchedName})</span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Weekly Schedule */}
                    {schedule && (
                        <div className="rounded-2xl bg-gradient-to-br from-slate-800 via-gray-900 to-slate-900 p-5 shadow-lg">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
                                Schedule
                                {(() => {
                                    const grossHours = calculateWeeklyHours(schedule);
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
                                            <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold normal-case ${ft ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30' : 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30'}`}>
                                                {displayHours}h/wk &middot; {ft ? 'Full-Time' : 'Part-Time'}
                                            </span>
                                            {breakSchedule && breakDeduction > 0 && (
                                                <span className="text-[10px] text-white/50 normal-case ml-1">
                                                    (1hr break/day deducted)
                                                </span>
                                            )}
                                        </>
                                    );
                                })()}
                            </h3>

                            <div className="bg-white/5 rounded-xl divide-y divide-white/5 overflow-hidden">
                                {WEEKDAYS.map((day) => {
                                    const shift = schedule[day];
                                    const isOff = !shift || shift.trim().toLowerCase() === 'off' || shift.trim() === '';
                                    const grossHours = parseShiftDuration(shift);
                                    const netHours = breakSchedule && grossHours > 0 ? Math.max(grossHours - 1, 0) : grossHours;
                                    return (
                                        <div key={day} className={`flex items-center justify-between px-4 py-2.5 ${isOff ? '' : 'bg-indigo-500/10'}`}>
                                            <span className={`text-[13px] font-semibold ${isOff ? 'text-white/30' : 'text-white/90'}`}>
                                                {day}
                                            </span>
                                            <div className="text-right flex items-center gap-2">
                                                <span className={`text-[13px] font-mono ${isOff ? 'text-white/30 italic' : 'text-white font-medium'}`}>
                                                    {isOff ? 'OFF' : normalizeShiftTime(shift).trim()}
                                                </span>
                                                {!isOff && netHours > 0 && (
                                                    <span className="text-[11px] text-white/50 font-mono bg-white/10 px-1.5 py-0.5 rounded">({netHours}h)</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {schedule.Notes && (
                                <div className="mt-3 bg-white/5 rounded-xl px-4 py-2.5">
                                    <p className="text-[10px] font-semibold text-white/50 uppercase tracking-wider mb-0.5">Notes</p>
                                    <p className="text-[12px] text-white/60 italic">{schedule.Notes}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Break Schedule */}
                    {breakSchedule && (
                        <div className="rounded-2xl bg-gradient-to-br from-slate-800 via-gray-900 to-slate-900 p-5 shadow-lg">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
                                Breaks
                            </h3>

                            <div className="bg-white/5 rounded-xl divide-y divide-white/5 overflow-hidden">
                                {[
                                    { label: 'First Break', key: 'First Break' },
                                    { label: 'Lunch Break', key: 'Lunch Break' },
                                    { label: 'Second Break', key: 'Second Break' },
                                ].map(({ label, key }) => {
                                    const raw = breakSchedule[key];
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
                                        <div key={key} className={`flex items-center justify-between px-4 py-2.5 ${hasValue ? 'bg-amber-500/10' : ''}`}>
                                            <span className={`text-[13px] font-semibold ${hasValue ? 'text-white/90' : 'text-white/30'}`}>
                                                {label}
                                            </span>
                                            <span className={`text-[13px] font-mono ${hasValue ? 'text-white font-medium' : 'text-white/30 italic'}`}>
                                                {hasValue ? displayTime : '—'}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>

                            {breakSchedule.Notes && (
                                <div className="mt-3 bg-white/5 rounded-xl px-4 py-2.5">
                                    <p className="text-[10px] font-semibold text-white/50 uppercase tracking-wider mb-0.5">Notes</p>
                                    <p className="text-[12px] text-white/60 italic">{breakSchedule.Notes}</p>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="rounded-2xl bg-gradient-to-br from-slate-800 via-gray-900 to-slate-900 p-5 shadow-lg">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-white">Documents</h3>
                            {!dirReadOnly && (
                                <label className="cursor-pointer bg-white/10 text-white/70 p-1.5 rounded-lg hover:bg-white/15 hover:text-white transition-colors">
                                    <Upload size={14} />
                                    <input
                                        type="file"
                                        className="hidden"
                                        onChange={handleFileUpload}
                                        disabled={uploading}
                                    />
                                </label>
                            )}
                        </div>

                        <div className="space-y-2">
                            {uploading && (
                                <div className="text-xs text-violet-300 animate-pulse font-medium">
                                    Uploading document...
                                </div>
                            )}

                            {!documents || documents.length === 0 ? (
                                <p className="text-sm text-white/50 italic">No documents uploaded.</p>
                            ) : (
                                <div className="bg-white/5 rounded-xl divide-y divide-white/5 overflow-hidden">
                                    {documents.map((doc, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-3 group hover:bg-white/5 transition-colors">
                                            <div className="flex items-center gap-3 overflow-hidden cursor-pointer" onClick={() => handleViewDocument(doc)}>
                                                <div className="p-2 bg-white/10 rounded-md text-violet-400">
                                                    <FileText size={16} />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-white/90 truncate pr-4 hover:text-violet-300 transition-colors" title={doc.name}>
                                                        {doc.name}
                                                    </p>
                                                    <p className="text-[10px] text-white/50">
                                                        {(doc.size / 1024).toFixed(0)} KB • {new Date(doc.uploaded_at).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleViewDocument(doc)}
                                                    className="p-1.5 text-white/40 hover:text-violet-300 hover:bg-white/10 rounded-md transition-colors"
                                                    title="View"
                                                >
                                                    <Eye size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleDownload(doc)}
                                                    className="p-1.5 text-white/40 hover:text-violet-300 hover:bg-white/10 rounded-md transition-colors"
                                                    title="Download"
                                                >
                                                    <Download size={14} />
                                                </button>
                                                {!dirReadOnly && (
                                                    <button
                                                        onClick={() => handleDeleteDocument(doc)}
                                                        className="p-1.5 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Attendance History */}
                    <div className="rounded-2xl bg-gradient-to-br from-slate-800 via-gray-900 to-slate-900 p-5 shadow-lg">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                Attendance
                                {attendanceEvents.length > 0 && (
                                    <span className="text-[11px] bg-white/10 text-white/70 px-2 py-0.5 rounded-full font-medium">
                                        {attendanceEvents.length}
                                    </span>
                                )}
                            </h3>
                            {attendanceEvents.length > 3 && (
                                <button
                                    onClick={() => setAttendanceExpanded(!attendanceExpanded)}
                                    className="text-xs text-violet-300 hover:text-violet-200 flex items-center gap-1"
                                >
                                    {attendanceExpanded ? <>Show less <ChevronUp size={12} /></> : <>Show all <ChevronDown size={12} /></>}
                                </button>
                            )}
                        </div>

                        {attendanceEvents.length === 0 ? (
                            <p className="text-sm text-white/50 italic">No attendance events on record.</p>
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
                                    const weights: Record<string, number> = { planned: 1, unplanned: 1.5 };
                                    const recentScore = attendanceEvents
                                        .filter(e => { try { return parseDate(e.date) >= thirtyDaysAgo; } catch { return false; } })
                                        .reduce((sum, e) => sum + (weights[e.eventType] || 1), 0);
                                    const color = recentScore >= 6 ? 'text-red-400 bg-red-500/10 ring-red-400/20' : recentScore >= 3 ? 'text-amber-400 bg-amber-500/10 ring-amber-400/20' : 'text-emerald-400 bg-emerald-500/10 ring-emerald-400/20';
                                    return (
                                        <div className={`flex items-center justify-between px-3 py-2 rounded-lg ring-1 mb-3 ${color}`}>
                                            <span className="text-xs font-medium">30-Day Occurrence Score</span>
                                            <span className="text-sm font-bold font-mono">{recentScore.toFixed(1)} pts</span>
                                        </div>
                                    );
                                })()}
                                {/* Days since last absence */}
                                {(() => {
                                    const months: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
                                    const parseDate = (s: string) => {
                                        if (s.includes('-')) return new Date(s);
                                        const parts = s.trim().split(/\s+/);
                                        if (parts.length === 3 && months[parts[1]]) {
                                            return new Date(`${parts[2]}-${months[parts[1]]}-${parts[0].padStart(2, '0')}`);
                                        }
                                        return new Date(s);
                                    };
                                    let latestDate: Date | null = null;
                                    for (const evt of attendanceEvents) {
                                        try {
                                            const d = parseDate(evt.date);
                                            if (!isNaN(d.getTime()) && (!latestDate || d > latestDate)) latestDate = d;
                                        } catch { /* skip */ }
                                    }
                                    if (!latestDate) return null;
                                    const diffMs = Date.now() - latestDate.getTime();
                                    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                                    if (diffDays < 0) return null;
                                    const color = diffDays >= 30 ? 'text-emerald-400' : diffDays >= 14 ? 'text-white/60' : 'text-amber-400';
                                    return (
                                        <div className="flex items-center justify-between px-3 py-1.5 mb-3">
                                            <span className="text-[11px] text-white/50">Days since last event</span>
                                            <span className={`text-xs font-bold font-mono ${color}`}>{diffDays}d</span>
                                        </div>
                                    );
                                })()}
                                <div className="bg-white/5 rounded-xl divide-y divide-white/5 overflow-hidden">
                                    {(attendanceExpanded ? attendanceEvents : attendanceEvents.slice(0, 3)).map((evt, idx) => {
                                        const configs: Record<string, { color: string; bg: string; label: string; Icon: typeof Clock }> = {
                                            planned: { color: 'text-sky-400', bg: 'bg-sky-500/10', label: 'Planned', Icon: Calendar },
                                            unplanned: { color: 'text-rose-400', bg: 'bg-rose-500/10', label: 'Unplanned', Icon: AlertTriangle },
                                        };
                                        const cfg = configs[evt.eventType] || configs.unplanned;
                                        const Icon = cfg.Icon;
                                        return (
                                            <div key={idx} className={`flex items-center gap-3 px-4 py-3 ${cfg.bg}`}>
                                                <Icon size={14} className={cfg.color} />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between">
                                                        <span className={`text-xs font-semibold ${cfg.color}`}>
                                                            {cfg.label}{evt.minutes ? ` (${evt.minutes} min)` : ''}
                                                        </span>
                                                        <span className="text-[10px] text-white/50">{evt.date}</span>
                                                    </div>
                                                    {evt.reason && (
                                                        <p className="text-[11px] text-white/50 mt-0.5 truncate">{evt.reason}</p>
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
                    <div className="rounded-2xl bg-gradient-to-br from-slate-800 via-gray-900 to-slate-900 p-5 shadow-lg">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                Write-Ups
                                {writeUps.length > 0 && (
                                    <span className="text-[11px] bg-white/10 text-white/70 px-2 py-0.5 rounded-full font-medium">
                                        {writeUps.length}
                                    </span>
                                )}
                            </h3>
                            {writeUps.length > 2 && (
                                <button
                                    onClick={() => setWriteUpsExpanded(!writeUpsExpanded)}
                                    className="text-xs text-violet-300 hover:text-violet-200 flex items-center gap-1"
                                >
                                    {writeUpsExpanded ? <>Show less <ChevronUp size={12} /></> : <>Show all <ChevronDown size={12} /></>}
                                </button>
                            )}
                        </div>

                        {writeUps.length === 0 ? (
                            <p className="text-sm text-white/50 italic">No write-ups on record.</p>
                        ) : (
                            <div className="bg-white/5 rounded-xl divide-y divide-white/5 overflow-hidden">
                                {(writeUpsExpanded ? writeUps : writeUps.slice(0, 2)).map((wu) => (
                                    <div
                                        key={wu.id}
                                        className="p-3 cursor-pointer hover:bg-white/5 transition-colors"
                                        onClick={() => setExpandedWriteUp(expandedWriteUp === wu.id ? null : wu.id)}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm font-medium text-white/90 truncate pr-4">
                                                {wu.subject}
                                            </span>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                                wu.status === 'sent' ? 'bg-emerald-500/20 text-emerald-300' :
                                                wu.status === 'simulated' ? 'bg-blue-500/20 text-blue-300' :
                                                'bg-red-500/20 text-red-300'
                                            }`}>
                                                {wu.status}
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-white/50">
                                            {new Date(wu.sent_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                            {' '}&bull;{' '}{wu.type.replace(/_/g, ' ')}
                                            {wu.sent_by && <> &bull; by {wu.sent_by}</>}
                                        </p>
                                        {expandedWriteUp === wu.id && (
                                            <div className="mt-2 pt-2 border-t border-white/10">
                                                <p className="text-xs text-white/60 whitespace-pre-line">{wu.body}</p>
                                                {wu.message_id && (
                                                    <p className="text-[10px] text-white/40 mt-2 font-mono">
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

                    {/* Notes */}
                    {notes.length > 0 && (
                        <div className="pt-6">
                            <button
                                onClick={() => setNotesExpanded(!notesExpanded)}
                                className="w-full flex items-center justify-between text-[10px] text-white/70 uppercase tracking-wider font-semibold mb-2 hover:text-white/90 transition-colors"
                            >
                                <span className="flex items-center gap-1.5"><StickyNote size={12} /> Notes ({notes.length})</span>
                                {notesExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                            {notesExpanded && (
                                <div className="bg-white/5 rounded-xl divide-y divide-white/5 max-h-48 overflow-y-auto">
                                    {notes.map((n) => (
                                        <div key={n.id} className="px-3 py-2.5 group/note">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[10px] text-white/50 font-mono">
                                                    {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] text-violet-300 font-medium">{n.added_by}</span>
                                                    {!dirReadOnly && (
                                                        <button
                                                            onClick={() => deleteNote(n.id)}
                                                            className="opacity-0 group-hover/note:opacity-100 text-red-400/70 hover:text-red-400 transition-all"
                                                            title="Delete note"
                                                        >
                                                            <Trash2 size={11} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            <p className="text-[12px] text-white/90 whitespace-pre-line">{n.note}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Actions */}
                    {!dirReadOnly && (
                    <div className="pt-8 flex flex-col gap-3">
                        <div className="flex gap-3">
                            <button
                                onClick={() => { setShowMessageForm(!showMessageForm); setMessageStatus(null); }}
                                className="flex-1 py-2.5 bg-violet-600 text-white rounded-xl font-medium text-sm hover:bg-violet-500 transition-colors shadow-lg shadow-violet-900/30 flex items-center justify-center gap-2"
                            >
                                <SlackIcon size={14} />
                                Send Message
                            </button>
                            <button
                                onClick={() => setShowNoteForm(true)}
                                className="flex-1 py-2.5 bg-white/10 text-white/80 rounded-xl font-medium text-sm hover:bg-white/15 transition-colors ring-1 ring-white/10 flex items-center justify-center gap-2"
                            >
                                <StickyNote size={14} />
                                Add Note
                            </button>
                        </div>
                        {showMessageForm && (
                            <div className="p-3 bg-white/5 rounded-xl ring-1 ring-white/10">
                                <label className="text-[10px] text-white/50 uppercase tracking-wider font-semibold mb-1 block">Send to</label>
                                <select
                                    value={messageRecipient}
                                    onChange={(e) => setMessageRecipient(e.target.value)}
                                    className="w-full bg-white/10 text-white/90 text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-violet-400/50 focus:outline-none mb-2 [&>option]:bg-zinc-800 [&>option]:text-white [&>optgroup]:bg-zinc-800 [&>optgroup]:text-white/50 [&>optgroup]:font-semibold [&>optgroup]:text-[11px]"
                                >
                                    <option value="employee">{employee.first_name} {employee.last_name} (Employee)</option>
                                    {getManagerNames().length > 0 && (
                                        <optgroup label="Campaign Managers">
                                            {getManagerNames().map(name => (
                                                <option key={name} value={name}>{name}</option>
                                            ))}
                                        </optgroup>
                                    )}
                                    {Object.entries(
                                        leadershipContacts.reduce<Record<string, typeof leadershipContacts>>((acc, c) => {
                                            (acc[c.role] = acc[c.role] || []).push(c);
                                            return acc;
                                        }, {})
                                    )
                                        .sort(([a], [b]) => a.localeCompare(b))
                                        .map(([role, contacts]) => (
                                            <optgroup key={role} label={role}>
                                                {contacts.sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                                                    <option key={c.slack_user_id} value={c.name}>{c.name}</option>
                                                ))}
                                            </optgroup>
                                        ))
                                    }
                                </select>
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                    {(() => {
                                        const recipientFirstName = messageRecipient.split(" ")[0];
                                        const senderName = profile?.first_name || "HR";
                                        const empName = `${employee.first_name} ${employee.last_name}`;
                                        const isEmployee = messageRecipient === "employee";
                                        const isManager = getManagerNames().includes(messageRecipient);
                                        // employee → employee templates, campaign manager → manager templates, leadership → leadership templates
                                        const templates = isEmployee ? [
                                            { label: "Schedule", text: `Hi ${employee.first_name}, this is ${senderName} from management. I wanted to check in about your schedule — please confirm your availability for this week.` },
                                            { label: "Performance", text: `Hi ${employee.first_name}, this is ${senderName}. I'd like to discuss your recent performance metrics with you. When would be a good time to chat?` },
                                            { label: "Attendance", text: `Hi ${employee.first_name}, this is ${senderName}. I noticed some attendance concerns and wanted to touch base. Please reach out when you get a chance.` },
                                            { label: "Follow-up", text: `Hi ${employee.first_name}, just following up on our last conversation. Let me know if you have any questions or need anything.` },
                                        ] : isManager ? [
                                            { label: "Agent Update", text: `Hi ${recipientFirstName}, this is ${senderName}. I wanted to flag something regarding ${empName} — could you take a look when you get a chance?` },
                                            { label: "Performance", text: `Hi ${recipientFirstName}, this is ${senderName}. Can we discuss ${empName}'s recent performance? I have some notes I'd like to go over.` },
                                            { label: "Attendance", text: `Hi ${recipientFirstName}, this is ${senderName}. I wanted to bring ${empName}'s recent attendance to your attention. Let me know how you'd like to handle it.` },
                                            { label: "Escalation", text: `Hi ${recipientFirstName}, this is ${senderName}. I need to escalate a matter regarding ${empName}. Can we connect today?` },
                                        ] : [
                                            { label: "Agent Update", text: `Hi ${recipientFirstName}, this is ${senderName}. I wanted to flag something regarding ${empName} — could you take a look when you get a chance?` },
                                            { label: "Escalation", text: `Hi ${recipientFirstName}, this is ${senderName}. I need to escalate a matter regarding ${empName}. Can we connect today?` },
                                            { label: "Compliance", text: `Hi ${recipientFirstName}, this is ${senderName}. There's a compliance concern with ${empName} that needs attention. Please review when possible.` },
                                            { label: "Headcount", text: `Hi ${recipientFirstName}, this is ${senderName}. Quick update on ${empName}'s status — let me know if you need any details.` },
                                        ];
                                        return templates;
                                    })().map(t => (
                                        <button
                                            key={t.label}
                                            onClick={() => setMessageText(t.text)}
                                            className="text-[10px] px-2 py-1 rounded-full bg-white/10 text-white/60 hover:bg-white/15 hover:text-white/90 transition-colors"
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                                <textarea
                                    value={messageText}
                                    onChange={(e) => setMessageText(e.target.value)}
                                    placeholder="Type your message..."
                                    rows={3}
                                    className="w-full bg-white/5 text-white/90 text-sm rounded-lg px-3 py-2 placeholder-white/30 border border-white/10 focus:border-violet-400/50 focus:outline-none resize-none"
                                />
                                <label className="flex items-center gap-2 mt-2 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={includeSnapshot}
                                        onChange={(e) => setIncludeSnapshot(e.target.checked)}
                                        className="w-3.5 h-3.5 rounded border-white/20 bg-white/10 text-violet-500 focus:ring-violet-400/50 focus:ring-offset-0 cursor-pointer"
                                    />
                                    <span className="text-[11px] text-white/50 group-hover:text-white/70 transition-colors">
                                        Include Agent Snapshot card
                                    </span>
                                </label>
                                {messageStatus && (
                                    <p className={`text-xs mt-1.5 ${messageStatus.type === "success" ? "text-emerald-400" : "text-red-400"}`}>
                                        {messageStatus.text}
                                    </p>
                                )}
                                <div className="flex gap-2 mt-2 justify-end">
                                    <button
                                        onClick={() => { setShowMessageForm(false); setMessageText(""); setMessageStatus(null); setMessageRecipient("employee"); setIncludeSnapshot(true); }}
                                        className="px-3 py-1.5 text-[12px] text-white/60 hover:text-white/80 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={sendMessage}
                                        disabled={!messageText.trim() || messageSending}
                                        className="px-4 py-1.5 text-[12px] bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                                    >
                                        <SlackIcon size={12} />
                                        {messageSending ? "Sending..." : "Send via Slack"}
                                    </button>
                                </div>
                            </div>
                        )}
                        {showNoteForm && (
                            <div className="p-3 bg-white/5 rounded-xl ring-1 ring-white/10">
                                <textarea
                                    value={noteText}
                                    onChange={(e) => setNoteText(e.target.value)}
                                    placeholder="Write a note..."
                                    rows={3}
                                    className="w-full bg-white/5 text-white/90 text-sm rounded-lg px-3 py-2 placeholder-white/30 border border-white/10 focus:border-violet-400/50 focus:outline-none resize-none"
                                />
                                <div className="flex gap-2 mt-2 justify-end">
                                    <button
                                        onClick={() => { setShowNoteForm(false); setNoteText(""); }}
                                        className="px-3 py-1.5 text-[12px] text-white/60 hover:text-white/80 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={saveNote}
                                        disabled={!noteText.trim() || noteSaving}
                                        className="px-4 py-1.5 text-[12px] bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        {noteSaving ? "Saving..." : "Save Note"}
                                    </button>
                                </div>
                            </div>
                        )}
                        {employee.employee_status === 'Active' && (
                            <>
                                {!showTerminateConfirm ? (
                                    <button
                                        onClick={() => { setShowTerminateConfirm(true); setTerminateError(null); }}
                                        className="w-full py-2.5 bg-red-500/10 text-red-400 rounded-xl font-medium text-sm hover:bg-red-500/20 transition-colors ring-1 ring-red-400/20 flex items-center justify-center gap-2"
                                    >
                                        <Ban size={14} />
                                        Terminate Employee
                                    </button>
                                ) : (
                                    <div className="p-4 bg-red-500/10 rounded-xl ring-1 ring-red-400/20">
                                        <p className="text-sm text-red-300 font-medium mb-1">
                                            Terminate {employee.first_name} {employee.last_name}?
                                        </p>
                                        <p className="text-xs text-red-400/70 mb-3">
                                            This will mark them as Terminated and remove them from all Slack channels.
                                        </p>
                                        {terminateError && (
                                            <p className="text-xs text-red-300 bg-red-500/20 rounded-lg px-3 py-2 mb-3">{terminateError}</p>
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
                                                className="flex-1 py-2 bg-white/10 text-white/70 rounded-lg font-medium text-sm hover:bg-white/15 transition-colors ring-1 ring-white/10 disabled:opacity-50"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    )}
                    {employee.employee_status === 'Terminated' && (
                        <div className="pt-8">
                            <div className="py-2.5 bg-red-500/10 text-red-400 rounded-xl font-medium text-sm text-center flex items-center justify-center gap-2 ring-1 ring-red-400/20">
                                <Ban size={14} />
                                Terminated
                            </div>
                        </div>
                    )}
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
