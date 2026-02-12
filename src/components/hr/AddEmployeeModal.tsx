"use client";

import { useState, useEffect } from "react";
import { X, User, Mail, Slack, Briefcase, Loader2, CheckCircle2, Search, UserPlus, RotateCcw, ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase-client";

interface TerminatedEmployee {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    role: string | null;
    user_image: string | null;
    terminated_at: string | null;
    hired_at: string | null;
}

interface AddEmployeeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

type Step = 'ask' | 'new' | 'returning';

export default function AddEmployeeModal({ isOpen, onClose, onSuccess }: AddEmployeeModalProps) {
    const [step, setStep] = useState<Step>('ask');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [successMessage, setSuccessMessage] = useState("");

    // New employee form
    const [formData, setFormData] = useState({
        first_name: "",
        last_name: "",
        email: "",
        role: "",
        slack_display_name: "",
    });

    // Returning employee search
    const [terminatedEmployees, setTerminatedEmployees] = useState<TerminatedEmployee[]>([]);
    const [returnSearch, setReturnSearch] = useState("");
    const [loadingTerminated, setLoadingTerminated] = useState(false);
    const [reactivating, setReactivating] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setStep('ask');
            setError(null);
            setSuccess(false);
            setSuccessMessage("");
            setReturnSearch("");
            setReactivating(null);
        }
    }, [isOpen]);

    const fetchTerminatedEmployees = async () => {
        setLoadingTerminated(true);
        const { data, error } = await supabase
            .from('employee_directory')
            .select('id, first_name, last_name, email, role, user_image, terminated_at, hired_at')
            .eq('employee_status', 'Terminated')
            .order('terminated_at', { ascending: false });

        if (!error && data) {
            setTerminatedEmployees(data);
        }
        setLoadingTerminated(false);
    };

    const handleReturningClick = () => {
        setStep('returning');
        fetchTerminatedEmployees();
    };

    const handleReactivate = async (emp: TerminatedEmployee) => {
        setReactivating(emp.id);
        try {
            const { error: updateError } = await supabase
                .from('employee_directory')
                .update({
                    employee_status: 'Active',
                    terminated_at: null,
                    hired_at: new Date().toISOString(),
                })
                .eq('id', emp.id);

            if (updateError) throw updateError;

            setSuccess(true);
            setSuccessMessage(`${emp.first_name} ${emp.last_name} has been reactivated successfully.`);

            setTimeout(() => {
                onSuccess();
                onClose();
                resetForm();
            }, 1500);
        } catch (err: any) {
            console.error("Error reactivating employee:", err);
            setError(err.message || "Failed to reactivate employee.");
        } finally {
            setReactivating(null);
        }
    };

    const resetForm = () => {
        setFormData({ first_name: "", last_name: "", email: "", role: "", slack_display_name: "" });
        setSuccess(false);
        setSuccessMessage("");
        setError(null);
        setStep('ask');
        setReturnSearch("");
        setTerminatedEmployees([]);
    };

    const handleClose = () => {
        onClose();
        resetForm();
    };

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        if (!formData.first_name || !formData.last_name || !formData.email) {
            setError("Please fill in all required fields.");
            setLoading(false);
            return;
        }

        try {
            const { error: insertError } = await supabase
                .from('employee_directory')
                .insert([
                    {
                        first_name: formData.first_name,
                        last_name: formData.last_name,
                        email: formData.email,
                        role: formData.role || null,
                        slack_display_name: formData.slack_display_name || null,
                        hired_at: new Date().toISOString(),
                        employee_status: 'Active',
                        contract_status: 'not_sent',
                    }
                ]);

            if (insertError) throw insertError;

            setSuccess(true);
            setSuccessMessage(`${formData.first_name} ${formData.last_name} has been successfully added to the directory.`);

            setTimeout(() => {
                onSuccess();
                onClose();
                resetForm();
            }, 1500);

        } catch (err: any) {
            console.error("Error adding employee:", err);
            setError(err.message || "Failed to add employee. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    // Filter terminated employees by search
    const filteredTerminated = terminatedEmployees.filter(emp => {
        if (!returnSearch.trim()) return true;
        const term = returnSearch.toLowerCase();
        const fullName = `${emp.first_name || ''} ${emp.last_name || ''}`.toLowerCase();
        return fullName.includes(term) || (emp.email || '').toLowerCase().includes(term);
    });

    const headerTitle = step === 'ask' ? 'Add Employee' : step === 'new' ? 'Add New Employee' : 'Reactivate Employee';
    const headerSubtitle = step === 'ask' ? 'Is this a new or returning employee?' : step === 'new' ? 'Create a new record in the directory' : 'Search and reactivate a former employee';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden m-4 animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div className="flex items-center gap-3">
                        {step !== 'ask' && !success && (
                            <button
                                onClick={() => { setStep('ask'); setError(null); }}
                                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <ArrowLeft size={18} />
                            </button>
                        )}
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">{headerTitle}</h2>
                            <p className="text-sm text-gray-500">{headerSubtitle}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {success ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                            <div className="h-16 w-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-2">
                                <CheckCircle2 size={32} />
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900">
                                {step === 'returning' ? 'Employee Reactivated!' : 'Employee Added!'}
                            </h3>
                            <p className="text-gray-500">{successMessage}</p>
                        </div>
                    ) : step === 'ask' ? (
                        /* Step 1: Ask if new or returning */
                        <div className="space-y-4">
                            <p className="text-sm text-gray-600 text-center mb-6">
                                Has this employee previously been with the company?
                            </p>

                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => setStep('new')}
                                    className="group flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all"
                                >
                                    <div className="p-3 rounded-xl bg-blue-100 text-blue-600 group-hover:bg-blue-200 transition-colors">
                                        <UserPlus size={24} />
                                    </div>
                                    <div className="text-center">
                                        <p className="font-semibold text-gray-900">New Employee</p>
                                        <p className="text-xs text-gray-500 mt-1">First time joining</p>
                                    </div>
                                </button>

                                <button
                                    onClick={handleReturningClick}
                                    className="group flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-gray-200 hover:border-emerald-400 hover:bg-emerald-50/50 transition-all"
                                >
                                    <div className="p-3 rounded-xl bg-emerald-100 text-emerald-600 group-hover:bg-emerald-200 transition-colors">
                                        <RotateCcw size={24} />
                                    </div>
                                    <div className="text-center">
                                        <p className="font-semibold text-gray-900">Returning Employee</p>
                                        <p className="text-xs text-gray-500 mt-1">Previously with us</p>
                                    </div>
                                </button>
                            </div>

                            <div className="pt-2">
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    className="w-full py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200 transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : step === 'returning' ? (
                        /* Step 2b: Search terminated employees to reactivate */
                        <div className="space-y-4">
                            {error && (
                                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
                                    {error}
                                </div>
                            )}

                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                    <Search size={16} />
                                </div>
                                <input
                                    type="text"
                                    placeholder="Search former employees..."
                                    value={returnSearch}
                                    onChange={(e) => setReturnSearch(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                                    autoFocus
                                />
                            </div>

                            <div className="max-h-72 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-gray-200">
                                {loadingTerminated ? (
                                    <div className="flex items-center justify-center py-8 text-gray-400">
                                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                        Loading...
                                    </div>
                                ) : filteredTerminated.length === 0 ? (
                                    <div className="text-center py-8 text-gray-400 text-sm">
                                        {returnSearch ? 'No matching former employees found' : 'No terminated employees on record'}
                                    </div>
                                ) : (
                                    filteredTerminated.map(emp => (
                                        <div
                                            key={emp.id}
                                            className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition-colors"
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="h-10 w-10 rounded-full bg-gray-100 overflow-hidden border border-gray-200 flex-shrink-0">
                                                    {emp.user_image ? (
                                                        <img src={emp.user_image} alt="" className="h-full w-full object-cover" />
                                                    ) : (
                                                        <div className="h-full w-full flex items-center justify-center bg-red-50 text-red-400 font-semibold text-sm">
                                                            {emp.first_name?.[0]}{emp.last_name?.[0]}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-gray-900 truncate">
                                                        {emp.first_name} {emp.last_name}
                                                    </p>
                                                    <p className="text-xs text-gray-500 truncate">
                                                        {emp.role || 'Agent'}
                                                        {emp.terminated_at && (
                                                            <> &bull; Left {new Date(emp.terminated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                                                        )}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleReactivate(emp)}
                                                disabled={reactivating === emp.id}
                                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-100 rounded-lg hover:bg-emerald-200 transition-colors disabled:opacity-50 flex-shrink-0 ml-3"
                                            >
                                                {reactivating === emp.id ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <RotateCcw className="h-3.5 w-3.5" />
                                                )}
                                                Reactivate
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    ) : (
                        /* Step 2a: New employee form */
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {error && (
                                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
                                    {error}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">First Name <span className="text-red-500">*</span></label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                            <User size={16} />
                                        </div>
                                        <input
                                            type="text"
                                            required
                                            value={formData.first_name}
                                            onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                                            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                            placeholder="John"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Last Name <span className="text-red-500">*</span></label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.last_name}
                                        onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                        placeholder="Doe"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">Email Address <span className="text-red-500">*</span></label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                        <Mail size={16} />
                                    </div>
                                    <input
                                        type="email"
                                        required
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                        placeholder="john.doe@brand.com"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">Role / Job Title</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                        <Briefcase size={16} />
                                    </div>
                                    <input
                                        type="text"
                                        value={formData.role}
                                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                        className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                        placeholder="e.g. Senior Brand Designer"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">Slack Display Name <span className="text-gray-400 font-normal">(Optional)</span></label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                        <Slack size={16} />
                                    </div>
                                    <input
                                        type="text"
                                        value={formData.slack_display_name}
                                        onChange={(e) => setFormData({ ...formData, slack_display_name: e.target.value })}
                                        className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                        placeholder="john.doe"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200 transition-colors"
                                    disabled={loading}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-2.5 bg-gray-900 text-white rounded-xl font-medium text-sm hover:bg-gray-800 transition-colors shadow-lg shadow-gray-900/10 flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        "Add Employee"
                                    )}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
