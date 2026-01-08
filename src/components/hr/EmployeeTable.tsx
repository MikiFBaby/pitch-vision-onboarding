"use client";

import { useRef, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-client";
import { Eye, Mail, Search, Trash2, Upload, UserPlus, FileText, UserMinus, Slack, ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { motion } from "framer-motion";
import EmployeeProfileDrawer from "./EmployeeProfileDrawer";
import DeleteConfirmationModal from "./DeleteConfirmationModal";
import AddEmployeeModal from "./AddEmployeeModal";

interface Employee {
    id: string;
    first_name: string;
    last_name: string;
    role: string | null;
    email: string | null;
    slack_display_name: string | null;
    user_image: string | null;
    documents?: { name: string; path: string; type: string; size: number; uploaded_at: string }[];
    created_at: string;
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
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Upload States
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadTargetEmployee, setUploadTargetEmployee] = useState<Employee | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const handleAddSuccess = () => {
        fetchEmployees();
    };

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
            .order("created_at", { ascending: false });

        if (!error && data) {
            setEmployees(data);
        }
        setLoading(false);
    };

    const handleDeleteEmployee = async () => {
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
            console.error("Error deleting employee:", error);
            alert("Failed to delete employee.");
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

    const [activeTab, setActiveTab] = useState<'all' | 'agents' | 'hr' | 'payroll' | 'management' | 'c-suite'>('all');

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

    const handleBulkDelete = async () => {
        if (selectedEmployeeIds.size === 0) return;

        if (!confirm(`Are you sure you want to delete ${selectedEmployeeIds.size} employees?`)) return;

        setIsDeleting(true);
        const { error } = await supabase
            .from("employee_directory")
            .delete()
            .in("id", Array.from(selectedEmployeeIds));

        if (!error) {
            setEmployees(prev => prev.filter(e => !selectedEmployeeIds.has(e.id)));
            setSelectedEmployeeIds(new Set());
            setIsSelectionMode(false);
        } else {
            console.error("Error bulk deleting:", error);
            alert("Failed to delete employees.");
        }
        setIsDeleting(false);
    };

    const filterEmployees = (employees: Employee[]) => {
        return employees.filter(emp => {
            // Search Filter
            const matchesSearch =
                (emp.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) || "") ||
                (emp.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) || "") ||
                (emp.email?.toLowerCase().includes(searchTerm.toLowerCase()) || "");

            if (!matchesSearch) return false;

            // Tab Filter
            if (activeTab === 'all') return true;

            const role = emp.role?.toLowerCase() || "";

            if (activeTab === 'agents') {
                return role === 'agent' || role === 'qa' || role.includes('pitch qa');
            }

            if (activeTab === 'hr') {
                // Exclude payroll from HR as it has its own tab now
                return (role.includes('hr') || role.includes('attendance')) && !role.includes('payroll');
            }

            if (activeTab === 'payroll') {
                return role.includes('payroll');
            }

            if (activeTab === 'management') {
                // Catch-all for managers, leads, and heads of departments
                return role.includes('manager') || role.includes('team leader') || role.includes('head');
            }

            if (activeTab === 'c-suite') {
                return role.includes('owner') || role.includes('president') || role.includes('cto');
            }

            return false;
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
                                    onClick={handleBulkDelete}
                                    disabled={selectedEmployeeIds.size === 0}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    Delete ({selectedEmployeeIds.size})
                                </button>
                            ) : (
                                <button
                                    onClick={toggleSelectionMode}
                                    className="flex items-center gap-2 px-4 py-2 bg-white text-red-600 border border-red-200 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    Remove Employee
                                </button>
                            )}

                            <button
                                onClick={() => setIsAddModalOpen(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors shadow-lg shadow-gray-900/10"
                            >
                                <UserPlus className="h-4 w-4" />
                                Add Employee
                            </button>
                        </div>
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-hide">
                        {[
                            { id: 'all', label: 'All' },
                            { id: 'agents', label: 'Agents' },
                            { id: 'hr', label: 'HR' },
                            { id: 'payroll', label: 'Payroll' },
                            { id: 'management', label: 'Management' },
                            { id: 'c-suite', label: 'C-Suite' }
                        ].map((tab) => {
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
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
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Pitch Vision Assigned</th>
                                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={isSelectionMode ? 6 : 5} className="px-6 py-8 text-center text-gray-500">
                                            Loading directory...
                                        </td>
                                    </tr>
                                ) : paginatedEmployees.length === 0 ? (
                                    <tr>
                                        <td colSpan={isSelectionMode ? 6 : 5} className="px-6 py-8 text-center text-gray-500">
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
                                                            title={`Email ${employee.email}`}
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <Mail className="h-4 w-4" />
                                                        </a>
                                                    )}
                                                    {employee.slack_display_name && (
                                                        <button
                                                            className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-all cursor-pointer z-10 relative"
                                                            title={`Open Slack (Web/App)`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                // Try to open desktop app
                                                                window.location.href = 'slack://open';
                                                            }}
                                                        >
                                                            <Slack className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
                                                    Pending Invite
                                                </span>
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
                onConfirm={handleDeleteEmployee}
                employeeName={selectedEmployee ? `${selectedEmployee.first_name} ${selectedEmployee.last_name}` : ""}
                isDeleting={isDeleting}
            />

            <AddEmployeeModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSuccess={handleAddSuccess}
            />
        </>
    );
}
