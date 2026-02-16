"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase-client";
import { Eye, Mail, Search, Trash2, Upload, FileText, UserMinus, Slack, ChevronLeft, ChevronRight, Phone, MapPin, ClipboardPaste, X, AlertTriangle, CheckCircle2, XCircle, Loader2, Filter } from "lucide-react";
import { motion } from "framer-motion";
import EmployeeProfileDrawer from "./EmployeeProfileDrawer";
import DeleteConfirmationModal from "./DeleteConfirmationModal";
import { calculateWeeklyHours, WEEKDAYS } from "@/lib/hr-utils";

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
}

export default function EmployeeTable() {
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
    const [statusFilter, setStatusFilter] = useState<'active' | 'pending' | 'terminated' | 'all'>('active');
    const [scheduleMap, setScheduleMap] = useState<Map<string, { hours: number; ft: boolean }>>(new Map());
    const [scheduleLoading, setScheduleLoading] = useState(true);

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

            // Build break schedule lookup
            const breakKeys = new Set<string>();
            allBreaks.forEach((b: any) => {
                const f = (b['First Name'] || '').trim().toLowerCase();
                const l = (b['Last Name'] || '').trim().toLowerCase();
                if (f) breakKeys.add(`${f}|${l}`);
            });

            // Build schedule map (dedup by name, first match wins)
            const map = new Map<string, { hours: number; ft: boolean }>();
            allSchedules.forEach((row: any) => {
                const f = (row['First Name'] || '').trim().toLowerCase();
                const l = (row['Last Name'] || '').trim().toLowerCase();
                if (!f) return;
                const key = `${f}|${l}`;
                if (map.has(key)) return;

                const grossHours = calculateWeeklyHours(row);
                const workingDays = WEEKDAYS.filter(day => {
                    const s = row[day];
                    return s && s.trim().toLowerCase() !== 'off' && s.trim() !== '';
                }).length;
                const hasBreak = breakKeys.has(key);
                const breakDeduction = hasBreak ? workingDays * 1 : 0;
                const netHours = Math.round((grossHours - breakDeduction) * 100) / 100;
                const displayHours = hasBreak ? netHours : grossHours;

                map.set(key, { hours: displayHours, ft: displayHours >= 30 });
            });

            setScheduleMap(map);
        } catch (err) {
            console.error('Error loading schedules for PT/FT filter:', err);
        } finally {
            setScheduleLoading(false);
        }
    }, []);

    useEffect(() => { loadSchedules(); }, [loadSchedules]);

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

    // Status counts for filter tabs — contextual to current role/country/employment filters
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

            counts.total++;
            const s = (emp.employee_status || '').toLowerCase();
            if (s === 'active') counts.active++;
            else if (s === 'pending') counts.pending++;
            else if (s === 'terminated') counts.terminated++;
        });
        return counts;
    }, [employees, activeTab, countryFilter, employmentFilter, matchesRoleTab]);

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
        // Exact match
        const exact = scheduleMap.get(`${f}|${l}`);
        if (exact) return exact.ft ? 'full-time' : 'part-time';
        // Flexible: try contains matching on last name
        let flexResult: 'full-time' | 'part-time' | null = null;
        scheduleMap.forEach((val, key) => {
            if (flexResult) return;
            const parts = key.split('|');
            const sf = parts[0], sl = parts[1];
            if (sf !== f) return;
            if (sl.includes(l) || l.includes(sl)) {
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

            // Tab Filter
            return matchesRoleTab(emp, activeTab);
        });
    };

    const filteredEmployees = filterEmployees(employees);

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
                            {isSelectionMode ? (
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
                    <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                        <Filter className="h-4 w-4 text-gray-400" />
                        <select
                            value={countryFilter}
                            onChange={(e) => { setCountryFilter(e.target.value as any); setCurrentPage(1); }}
                            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
                        >
                            <option value="all">All Countries</option>
                            <option value="USA">USA</option>
                            <option value="Canada">Canada</option>
                            <option value="unknown">Unknown</option>
                        </select>
                        <select
                            value={employmentFilter}
                            onChange={(e) => { setEmploymentFilter(e.target.value as any); setCurrentPage(1); }}
                            disabled={scheduleLoading}
                            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                        >
                            <option value="all">All Employment</option>
                            <option value="full-time">Full-Time (30+ hrs)</option>
                            <option value="part-time">Part-Time (&lt;30 hrs)</option>
                            <option value="unknown">No Schedule</option>
                        </select>
                        {(countryFilter !== 'all' || employmentFilter !== 'all') && (
                            <button
                                onClick={() => { setCountryFilter('all'); setEmploymentFilter('all'); setCurrentPage(1); }}
                                className="px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                Clear filters
                            </button>
                        )}
                        {scheduleLoading && (
                            <span className="text-xs text-gray-400 flex items-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Loading schedules...
                            </span>
                        )}
                    </div>
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
                                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={isSelectionMode ? 8 : 7} className="px-6 py-8 text-center text-gray-500">
                                            Loading directory...
                                        </td>
                                    </tr>
                                ) : paginatedEmployees.length === 0 ? (
                                    <tr>
                                        <td colSpan={isSelectionMode ? 8 : 7} className="px-6 py-8 text-center text-gray-500">
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
                                                    <div className="h-10 w-10 rounded-full bg-gray-100 overflow-hidden border border-gray-200 flex-shrink-0">
                                                        {employee.user_image ? (
                                                            <img
                                                                src={employee.user_image}
                                                                alt={employee.first_name}
                                                                className="h-full w-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="h-full w-full flex items-center justify-center bg-blue-100 text-blue-600 font-semibold">
                                                                {employee.first_name?.[0]}{employee.last_name?.[0]}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="font-medium text-gray-900">
                                                        {employee.first_name} {employee.last_name}
                                                    </div>
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
            {isBulkPasteOpen && (
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
