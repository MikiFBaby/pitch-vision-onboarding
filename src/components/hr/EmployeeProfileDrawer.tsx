"use client";

import { X, Mail, Slack, Calendar, User, Upload, FileText, Trash2, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase-client";

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

interface EmployeeProfileDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    employee: Employee | null;
}

export default function EmployeeProfileDrawer({ isOpen, onClose, employee }: EmployeeProfileDrawerProps) {
    const drawerRef = useRef<HTMLDivElement>(null);
    const [documents, setDocuments] = useState<Employee['documents']>([]);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        if (employee) {
            setDocuments(employee.documents || []);
            // Optional: Fetch fresh documents here if needed
            fetchFreshDocuments(employee.id);
        }
    }, [employee]);

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
                <div className="relative h-48 bg-gray-100">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/30" />
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/40 rounded-full text-white transition-colors"
                    >
                        <X size={20} />
                    </button>

                    <div className="absolute -bottom-12 left-8">
                        <div className="h-24 w-24 rounded-2xl bg-white p-1 shadow-lg">
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

                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">About</h3>
                        <p className="text-sm text-gray-600 leading-relaxed">
                            No biography provided.
                        </p>
                    </div>

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

                            {employee.slack_display_name && (
                                <div className="flex items-center gap-3 text-gray-600">
                                    <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                                        <Slack size={18} />
                                    </div>
                                    <span className="text-sm">@{employee.slack_display_name}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Employee Metadata</h3>

                        <div className="flex items-center gap-3 text-gray-600">
                            <div className="p-2 bg-gray-100 rounded-lg">
                                <Calendar size={18} />
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Joined</p>
                                <span className="text-sm font-medium">
                                    {new Date(employee.created_at).toLocaleDateString(undefined, {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric'
                                    })}
                                </span>
                            </div>
                        </div>

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
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="p-2 bg-white rounded-md border border-gray-100 text-blue-500">
                                                <FileText size={16} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-gray-900 truncate pr-4" title={doc.name}>
                                                    {doc.name}
                                                </p>
                                                <p className="text-[10px] text-gray-400">
                                                    {(doc.size / 1024).toFixed(0)} KB • {new Date(doc.uploaded_at).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
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
        </div>
    );
}
