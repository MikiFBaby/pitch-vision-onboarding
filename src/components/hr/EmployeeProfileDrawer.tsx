"use client";

import { X, Mail, Slack, Calendar, User, Upload, FileText, Trash2, Download, Phone, MapPin, DollarSign, FileCheck, Briefcase, AlertTriangle, ChevronDown, ChevronUp, Clock, Coffee, ExternalLink, Eye } from "lucide-react";
import { parseShiftDuration, calculateWeeklyHours, isFullTime, WEEKDAYS } from "@/lib/hr-utils";
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
}

interface EmployeeProfileDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    employee: Employee | null;
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
        }
    }, [employee]);

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
        if (!firstLower || !lastLower) {
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

        // Flexible name matching: directory may have middle names in last_name
        // e.g. directory "Furman Goodbaum" vs schedule "Goodbaum"
        const nameMatches = (rowFirst: string, rowLast: string) => {
            const rf = (rowFirst || '').trim().toLowerCase();
            const rl = (rowLast || '').trim().toLowerCase();
            if (rf !== firstLower) return false;
            // Exact match or one last name contains the other
            return rl === lastLower || lastLower.includes(rl) || rl.includes(lastLower);
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
                            <div className="h-full w-full rounded-xl bg-gray-200 overflow-hidden">
                                {employee.user_image ? (
                                    <img
                                        src={employee.user_image}
                                        alt={employee.first_name}
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <div className="h-full w-full flex items-center justify-center bg-blue-100 text-blue-600 font-bold text-2xl">
                                        {employee.first_name?.[0]}{employee.last_name?.[0]}
                                    </div>
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
                                                    {isOff ? 'OFF' : shift.trim()}
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
                                    const value = breakSchedule[key];
                                    const hasValue = value && value.trim() && value.trim() !== '-';
                                    return (
                                        <div key={key} className={`flex items-center justify-between px-3 py-2 rounded-lg ${hasValue ? 'bg-amber-50/50' : 'bg-gray-50'}`}>
                                            <span className={`text-sm font-medium ${hasValue ? 'text-gray-700' : 'text-gray-400'}`}>
                                                {label}
                                            </span>
                                            <span className={`text-sm ${hasValue ? 'text-gray-800 font-medium' : 'text-gray-400 italic'}`}>
                                                {hasValue ? value.trim() : '—'}
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
                    <div className="pt-8 flex gap-3">
                        <button className="flex-1 py-2.5 bg-gray-900 text-white rounded-xl font-medium text-sm hover:bg-gray-800 transition-colors shadow-lg shadow-gray-900/10">
                            Send Message
                        </button>
                        <button className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200 transition-colors">
                            Edit Profile
                        </button>
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
